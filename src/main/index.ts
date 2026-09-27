import { Command } from 'commander';
import { Config } from './config.js';
import { Storage } from './storage/index.js';
import { XClient } from './client/index.js';
import { Pipeline } from './pipeline/index.js';
import {
  formatTweetTable,
  formatTrendsTable,
  formatTweetDetail,
} from './cli/format.js';

// Dual-mode dispatcher: determine CLI vs GUI
const rawArgs = process.argv.slice(2);
const cleanArgs = process.argv.filter((arg) => arg !== '--');
const isCLI = cleanArgs.length > 2;

if (isCLI) {
  const program = new Command();

  program
    .name('xtract')
    .description('Production-grade X (Twitter) intelligence radar & AI digest.')
    .version('1.0.0')
    // Actions & Workflows
    .option('--login [service]', '打开可视化浏览器登录并自动截获保存凭据 (x, openai, gemini)')
    .option('--check-auth', '验证 X Cookie 凭证或本地会话是否有效')
    .option('--trends', '查看全网热门趋势榜单看板')
    .option('--trends-digest', '全自动趋势研报（抓取热榜、主动挖掘代表性讨论并生成研报）')
    .option('--fetch-only', '仅抓取 Following 推文并存入本地 SQLite，不生成总结')
    .option('--report-only', '仅根据本地已有推文生成今日早报，不发起网络请求')
    .option('--search <query>', '按关键词或高级语法搜索推文')
    .option('--search-type <type>', '搜索结果类型：live (实时最新) 或 top (热门)', 'live')
    .option('--user <username>', '指定博主用户名进行针对性抓取或本地检索')
    .option('--x-list <listId>', '指定 X 列表 ID 或 URL，抓取该列表的最新推文')
    .option('--list [limit]', '查看已抓取推文列表 (默认 20 条)')
    .option('--view <tweetId>', '查看指定 ID 或 URL 的推文全文详情，并默认导出为独立 Markdown 文档')
    .option('--no-export-md', '查看单篇推文时关闭自动导出 Markdown')
    .option('--export [limit]', '将已抓取的推文导出为结构化 Markdown 文档')
    .option('-o, --output <path>', '自定义导出 Markdown 文件的路径或目标目录')
    // Filtering & Pacing Options
    .option('-c, --category <category>', '趋势分类主题 (tech, all, business, news, entertainment, sports)', 'tech')
    .option('--top <n>', '趋势榜单展示或研报挖掘的前 N 个热点话题', '10')
    .option('--hours <hours>', '统计与研报回溯时间窗口（小时）', '24')
    .option('--pages <n>', '本次抓取的页数')
    .option('--limit <n>', '限制获取或展示的推文条数', '20')
    .option('--min-likes <n>', '最低点赞门槛过滤', '0')
    .option('--min-retweets <n>', '最低转发门槛过滤', '0')
    .option('--timeout <seconds>', '网络请求与页面加载超时时间（秒）')
    // LLM Options
    .option(
      '--provider <provider>',
      '指定大模型提供商 (gemini, openai, deepseek, qwen, qwen-token-plan, zhipu, zhipu-code-plan, minimax, kimi, custom)'
    )
    .option('--auth-mode <mode>', '指定大模型认证模式 (api_key, account)')
    .option('--model <modelName>', '指定具体的模型名称 (覆盖默认配置)')
    // Agent / Automation Flag
    .option('--json', '以纯 JSON 格式输出结果至 stdout（面向 Agent 与终端管道）');

  program.action(async (options) => {
    Config.ensureDirs();
    const isJson = Boolean(options.json);

    const minLikes = parseInt(options.minLikes || '0', 10);
    const minRetweets = parseInt(options.minRetweets || '0', 10);
    const limit = parseInt(options.limit || '20', 10);
    const hours = parseInt(options.hours || '24', 10);
    const pages = options.pages ? parseInt(options.pages, 10) : undefined;
    const timeout = options.timeout ? parseInt(options.timeout, 10) : undefined;
    const top = parseInt(options.top || '10', 10);

    const storage = new Storage();
    const client = new XClient(timeout);
    const pipeline = new Pipeline(storage, client);

    try {
      // 1. Interactive login
      if (options.login) {
        const target = typeof options.login === 'string' ? options.login : 'x';
        if (target === 'x') {
          await client.loginInteractive(timeout);
        } else {
          process.stderr.write(`暂不支持通过 CLI 登录 ${target}，请使用 --auth-mode api_key 配置密钥。\n`);
        }
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', service: target }) + '\n');
        }
        process.exit(0);
      }

      // 2. Auth verification
      if (options.checkAuth) {
        const auth = await client.verifyAuth(timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'authenticated', ...auth }) + '\n');
        } else {
          process.stdout.write(
            `🎉 认证成功！会话有效：${auth.name} (@${auth.screen_name})\n`
          );
        }
        process.exit(0);
      }

      // 3. List stored tweets
      if (options.list !== undefined) {
        const listLimit = typeof options.list === 'string' ? parseInt(options.list, 10) : limit;
        const tweets = options.user
          ? storage.getTweetsByUser(options.user, { limit: listLimit, minLikes, minRetweets })
          : storage.getRecentTweets({ limit: listLimit, minLikes, minRetweets });

        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          if (tweets.length === 0) {
            process.stdout.write('⚠️ 数据库中暂无符合条件的推文。\n');
          } else {
            const title = options.user ? `博主 @${options.user} 推文` : '推文列表';
            process.stdout.write(formatTweetTable(tweets, title) + '\n');
          }
        }
        process.exit(0);
      }

      // 4. View single tweet
      if (options.view) {
        const tweetId = options.view.match(/\d{5,}/)?.[0] || options.view.trim();
        let tweet = storage.getTweetById(tweetId);
        const isTruncated = Boolean(
          tweet?.text && tweet.text.length < 60 && tweet.text.includes('https://t.co/')
        );
        if (!tweet || isTruncated) {
          const msg = !tweet
            ? `本地数据库未检索到推文 ${tweetId}`
            : `本地数据库推文 ${tweetId} 仅包含短链接`;
          process.stderr.write(`🔍 ${msg}，正在从 X 实时抓取完整内容...\n`);
          try {
            await pipeline.fetchTweetAndStore(tweetId, timeout);
            tweet = storage.getTweetById(tweetId);
          } catch (err: any) {
            process.stderr.write(`❌ 抓取推文失败: ${err.message}\n`);
            if (!tweet) throw err;
          }
        }

        if (!tweet) {
          throw new Error(`未能获取到 ID 为 '${tweetId}' 的推文。`);
        }

        let exportedMdPath: string | null = null;
        if (options.exportMd !== false) {
          const { filePath } = await storage.exportSingleTweetMarkdown(tweetId, {
            outputPath: options.output,
            downloadImages: true,
          });
          exportedMdPath = filePath;
        }

        if (isJson) {
          process.stdout.write(
            JSON.stringify({ tweet, exportedMarkdown: exportedMdPath }, null, 2) + '\n'
          );
        } else {
          process.stdout.write(formatTweetDetail(tweet));
          if (exportedMdPath) {
            process.stdout.write(`🎉 推文已导出为 Markdown 文档: ${exportedMdPath}\n`);
          }
        }
        process.exit(0);
      }

      // 5. Standalone export
      if (
        options.export !== undefined &&
        !options.user &&
        !options.xList &&
        !options.search &&
        !options.fetchOnly &&
        !options.reportOnly
      ) {
        const exportLimit = typeof options.export === 'string' ? parseInt(options.export, 10) : 200;
        const filePath = storage.exportMarkdown({
          outputFile: options.output,
          limit: exportLimit,
          minLikes,
          minRetweets,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', file: filePath }) + '\n');
        } else {
          process.stdout.write(`🎉 推文清单已导出为 Markdown 文档: ${filePath}\n`);
        }
        process.exit(0);
      }

      // 6. Trends radar
      if (options.trends) {
        const trends = await pipeline.showTrends({
          category: options.category,
          top,
          timeout,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify(trends, null, 2) + '\n');
        } else {
          process.stdout.write(formatTrendsTable(trends, `X 全网实时趋势 (${options.category})`));
        }
        process.exit(0);
      }

      // 7. Trends digest
      if (options.trendsDigest) {
        const reportFile = await pipeline.runTrendsDigest({
          category: options.category,
          top,
          hours,
          minLikes,
          minRetweets,
          provider: options.provider,
          authMode: options.authMode,
          model: options.model,
          timeout,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', reportFile }) + '\n');
        } else if (reportFile) {
          process.stdout.write(`🎉 全网趋势深度研报已生成: ${reportFile}\n`);
        }
        process.exit(0);
      }

      // 8. Search
      if (options.search) {
        const tweets = await pipeline.fetchSearchAndStore(options.search, {
          searchType: options.searchType,
          limit,
          minLikes,
          minRetweets,
          timeout,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          process.stdout.write(formatTweetTable(tweets, `搜索 '${options.search}' 结果`));
        }
        if (options.export !== undefined) {
          storage.exportMarkdown({
            outputFile: options.output,
            limit: typeof options.export === 'string' ? parseInt(options.export, 10) : 200,
            minLikes,
            minRetweets,
          });
        }
        process.exit(0);
      }

      // 9. User timeline
      if (options.user) {
        const tweets = await pipeline.fetchUserAndStore(options.user, limit, timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          process.stdout.write(formatTweetTable(tweets, `博主 @${options.user} 推文`));
        }
        process.exit(0);
      }

      // 10. List timeline
      if (options.xList) {
        const tweets = await pipeline.fetchListAndStore(options.xList, limit, timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          process.stdout.write(formatTweetTable(tweets, `X 列表推文`));
        }
        process.exit(0);
      }

      // 11. Fetch only
      if (options.fetchOnly) {
        const [fetched, inserted, skipped] = await pipeline.fetchAndStore(pages, timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify({ fetched, inserted, skipped }) + '\n');
        }
        process.exit(0);
      }

      // 12. Report only
      if (options.reportOnly) {
        const reportFile = await pipeline.generateReport({
          hours,
          minLikes,
          minRetweets,
          provider: options.provider,
          authMode: options.authMode,
          model: options.model,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', reportFile }) + '\n');
        } else if (reportFile) {
          process.stdout.write(`🎉 早报已生成: ${reportFile}\n`);
        }
        process.exit(0);
      }

      // 13. Default: Full daily workflow (Fetch -> Store -> Summarize)
      const reportFile = await pipeline.runDaily({
        maxPages: pages,
        hours,
        minLikes,
        minRetweets,
        provider: options.provider,
        authMode: options.authMode,
        model: options.model,
        timeout,
      });
      if (isJson) {
        process.stdout.write(JSON.stringify({ status: 'ok', reportFile }) + '\n');
      } else if (reportFile) {
        process.stdout.write(`🎉 早报已生成: ${reportFile}\n`);
      }
      process.exit(0);
    } catch (err: any) {
      if (isJson) {
        process.stdout.write(JSON.stringify({ status: 'error', error: err?.message || String(err) }) + '\n');
      } else {
        process.stderr.write(`❌ 执行出错: ${err?.message || err}\n`);
      }
      process.exit(1);
    }
  });

  program.parse(cleanArgs);
} else {
  // Lazy import electron only when launching GUI
  import('electron').then(({ app, BrowserWindow }) => {
    app.whenReady().then(() => {
      const win = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: 'Xtract - Intelligence Radar & AI Digest',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      win.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background: #0f172a;
              color: #f8fafc;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: #1e293b;
              border: 1px solid #334155;
              border-radius: 12px;
              padding: 32px 48px;
              text-align: center;
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
            }
            h1 { font-size: 24px; margin-bottom: 8px; color: #38bdf8; }
            p { color: #94a3b8; font-size: 14px; margin-top: 0; }
            .badge {
              display: inline-block;
              background: #0284c7;
              color: #fff;
              font-size: 12px;
              padding: 4px 12px;
              border-radius: 9999px;
              margin-top: 16px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🗞️ Xtract Desktop Ready</h1>
            <p>Production-Grade Node.js / Electron Architecture</p>
            <div class="badge">Electron Native GUI Active</div>
          </div>
        </body>
        </html>
      `)
      );
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  });
}
