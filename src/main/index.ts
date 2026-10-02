import { Command, CommanderError } from 'commander';
import { Config } from './config.js';
import { Storage } from './storage/index.js';
import { XClient } from './client/index.js';
import { Pipeline } from './pipeline/index.js';
import {
  formatTweetTable,
  formatTrendsTable,
  formatTweetDetail,
} from './cli/format.js';
import { isTweetContentIncomplete } from './client/parser.js';
import { resolveUserArgs, resolveVersion, normalizeTweetIdInputs } from './cli/argv.js';
import { createRequire } from 'node:module';

// Dual-mode dispatcher: determine CLI vs GUI
// 判定逻辑见 src/main/cli/argv.ts —— Electron 打包后 argv 少一层脚本路径，
// 用数组长度判断会让 dmg 用户完全进不了 CLI。
const nodeRequire = createRequire(import.meta.url);

/** CLI 版本号：优先取 Electron 应用版本（打包后与 DMG 名一致），否则读 package.json */
function cliVersion(): string {
  return resolveVersion(
    () => {
      const electron = nodeRequire('electron');
      return typeof electron?.app?.getVersion === 'function' ? electron.app.getVersion() : null;
    },
    () => {
      // src/main/cli → src/main → src → 项目根；打包后 dist-electron/main → asar 根
      for (const rel of ['../../../package.json', '../../package.json', '../package.json']) {
        try {
          return nodeRequire(rel).version ?? null;
        } catch {
          /* 尝试下一个候选路径 */
        }
      }
      return null;
    }
  );
}

/**
 * 提示里展示的命令前缀。
 * 打包用户没有 pnpm，必须给可直接复制执行的真实可执行文件路径。
 */
const cmdHint = process.versions.electron ? `"${process.execPath}"` : 'pnpm dev:cli --';

const userArgs = resolveUserArgs(process.argv, {
  isElectron: Boolean(process.versions.electron),
  isDefaultApp: Boolean(process.defaultApp),
});
const isCLI = userArgs.length > 0;

if (isCLI) {
  const program = new Command();

  program
    .name('xtract')
    .description('Production-grade X (Twitter) intelligence radar & AI digest.')
    .version(cliVersion(), '-v, --version')
    // 显式控制流：version/help/选项错误以异常形式交回我们处理，
    // 不依赖 process.exit 的隐式终止（CI 上实测存在 exit 不生效的环境，
    // 曾导致 `--version` 输出后继续执行 default 抓取流水线）
    .exitOverride()
    // Actions & Workflows
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
    .option('--delete [tweetIds...]', '级联删除推文及本地文件：可传多个 ID/URL 批量删除，也可仅搭配 --user/--since 等筛选条件')
    .option('--since <date>', '起始日期过滤 (YYYY-MM-DD)')
    .option('--until <date>', '截止日期过滤 (YYYY-MM-DD)')
    .option('--older-than <duration>', '早于指定时长的推文 (例如 30d, 48h, 7d)')
    .option('--only-short', '仅筛选/删除普通短推文（保留长推文 Note Tweet 与专栏文章 X Article）')
    .option('--dry-run', '演练预览模式，仅展示待删除列表，不执行真实删除')
    .option('-y, --yes', '跳过删除确认提示直接执行')
    .option('--export [limit]', '将已抓取的推文导出为结构化 Markdown 文档')
    .option('--export-ids <tweetIds...>', '按 ID/URL 批量导出为独立 Markdown 归档（本地缺失的推文先尝试在线抓取）')
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
    .option('--all-tweets', '不过滤普通短推文，抓取包含短推文在内的全量推文（默认仅抓取长推文 Note Tweet 与专栏文章 X Article）')
    .option('--author-replies', '抓取/同步单篇推文时，一并拉取作者本人的追加评论/推文串 (Thread Replies)')
    .option('--no-author-replies', '抓取/同步单篇推文时，不抓取作者的追加评论（仅保留主推文本体）')
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
    if (options.allTweets) {
      process.env.FETCH_ONLY_LONG_TWEETS = 'false';
    }

    // CLI author replies option priority: CLI flags > env > default(false)
    let fetchAuthorReplies = Config.FETCH_AUTHOR_REPLIES;
    if (options.authorReplies !== undefined) {
      fetchAuthorReplies = Boolean(options.authorReplies);
    }

    const storage = new Storage();
    const client = new XClient(timeout);
    const pipeline = new Pipeline(storage, client);

    // 统一收尾：设置退出码 → 给异步 stdout/stderr 一个 flush 窗口 → 强制退出。
    // 不裸调 process.exit（隐式终止不可靠），也不纯靠事件循环排空（keepalive 句柄可能挂住）。
    const finish = (code: number) => {
      process.exitCode = code;
      const t = setTimeout(() => process.exit(code), 50);
      // 若事件循环已排空则自然退出，timer 不阻止进程结束
      (t as any).unref?.();
    };

    try {
      // 1. Auth verification
      if (options.checkAuth) {
        const auth = await client.verifyAuth(timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'authenticated', ...auth }) + '\n');
        } else {
          process.stdout.write(
            `🎉 认证成功！会话有效：${auth.name} (@${auth.screen_name})\n`
          );
        }
        finish(0);
        return;
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
            process.stdout.write(formatTweetTable(tweets, title, cmdHint) + '\n');
          }
        }
        finish(0);
        return;
      }

      // 4. View single tweet
      if (options.view) {
        const tweetId = options.view.match(/\d{5,}/)?.[0] || options.view.trim();
        let tweet = storage.getTweetById(tweetId);
        const isIncomplete = tweet ? isTweetContentIncomplete(tweet) : true;
        const threadTweets = tweet ? storage.getThreadTweets(tweetId) : [];
        const missingReplies = fetchAuthorReplies && threadTweets.length <= 1;

        if (!tweet || isIncomplete || missingReplies) {
          const msg = !tweet
            ? `本地数据库未检索到推文 ${tweetId}`
            : isIncomplete
            ? `本地推文 ${tweetId} 包含未展开长文或万字 Article`
            : `已指定 --author-replies，正在拉取作者完整追加回复推文串`;
          process.stderr.write(`🔍 ${msg}，正在从 X 实时抓取完整内容...\n`);
          try {
            await pipeline.fetchTweetAndStore(tweetId, {
              timeout,
              fetchAuthorReplies,
            });
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
            fetchAuthorReplies,
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
          if (!fetchAuthorReplies) {
            process.stderr.write(
              `ℹ️ 当前默认不拉取作者追评，如需抓取完整推文串可使用 --author-replies 选项\n`
            );
          }
        }
        finish(0);
        return;
      }

      // 4.5 Delete tweets (single / batch by IDs / filter-based)
      if (options.delete !== undefined) {
        const rawDelete = options.delete;
        const ids = normalizeTweetIdInputs(typeof rawDelete === 'string' ? [rawDelete] : Array.isArray(rawDelete) ? rawDelete : []);
        const username = options.user;
        const since = options.since;
        const until = options.until;
        const olderThan = options.olderThan;
        const onlyShortTweets = Boolean(options.onlyShort);
        const dryRun = Boolean(options.dryRun);

        if (ids.length === 0 && !username && !since && !until && !olderThan && !onlyShortTweets) {
          throw new Error(
            '删除操作必须指定至少一个筛选条件（推文ID/URL、--user、--since、--until、--older-than 或 --only-short），以防误删全库。'
          );
        }

        const deleteFilter = {
          tweetIds: ids.length > 0 ? ids : undefined,
          username,
          since,
          until,
          olderThan,
          onlyShortTweets,
        };

        // Preview matches first
        const preview = await storage.deleteTweets({
          ...deleteFilter,
          dryRun: true,
        });

        if (preview.matchedCount === 0) {
          if (isJson) {
            process.stdout.write(
              JSON.stringify({
                status: 'ok',
                matchedCount: 0,
                deletedCount: 0,
                message: '未检索到符合条件的推文。',
              }) + '\n'
            );
          } else {
            process.stdout.write('🔍 未检索到符合条件的推文，无需删除。\n');
          }
          finish(0);
        return;
        }

        if (dryRun) {
          if (isJson) {
            process.stdout.write(JSON.stringify(preview, null, 2) + '\n');
          } else {
            process.stdout.write(`🔎 [演练模式] 命中 ${preview.matchedCount} 篇推文：\n`);
            if (preview.deletedDirs.length) {
              process.stdout.write(`📁 拟清理目录 (${preview.deletedDirs.length} 个):\n`);
              for (const d of preview.deletedDirs) {
                process.stdout.write(`  - ${d}\n`);
              }
            }
            if (preview.deletedFiles.length) {
              process.stdout.write(`📄 拟清理文件 (${preview.deletedFiles.length} 个):\n`);
              for (const f of preview.deletedFiles) {
                process.stdout.write(`  - ${f}\n`);
              }
            }
            process.stdout.write('ℹ️ 演练模式未执行实际删除。添加 -y 可直接执行删除。\n');
          }
          finish(0);
        return;
        }

        // Confirmation if not -y and interactive
        if (!options.yes && process.stdin.isTTY && !isJson) {
          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer = await rl.question(
            `⚠️ 即将从 SQLite 数据库和本地磁盘永久删除 ${preview.matchedCount} 篇推文及 ${preview.deletedDirs.length} 个相关目录，是否确认？(y/N): `
          );
          rl.close();
          if (answer.trim().toLowerCase() !== 'y') {
            process.stdout.write('🚫 操作已取消。\n');
            finish(0);
        return;
          }
        }

        const result = await storage.deleteTweets({
          ...deleteFilter,
          dryRun: false,
        });

        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', ...result }, null, 2) + '\n');
        } else {
          process.stdout.write(
            `✅ 成功删除 ${result.deletedCount} 篇推文记录，清理了 ${result.deletedDirs.length} 个本地目录与 ${result.deletedFiles.length} 个文件。\n`
          );
        }
        finish(0);
        return;
      }

      // 4.8 Batch export by IDs (Page Bundle per tweet, mirrors GUI 批量导出)
      if (options.exportIds) {
        const ids = normalizeTweetIdInputs(options.exportIds);
        if (ids.length === 0) {
          throw new Error('--export-ids 需要至少一个有效的推文 ID 或 URL。');
        }
        if (options.output) {
          throw new Error(
            '--export-ids 每篇会生成独立归档目录，不支持 -o 指定单一输出路径；如需自定义路径请对单篇使用 --view <ID> -o <path>。'
          );
        }

        const result = await pipeline.exportTweetsByIds(ids, { timeout, fetchAuthorReplies });

        if (isJson) {
          process.stdout.write(JSON.stringify({ status: 'ok', ...result }, null, 2) + '\n');
        } else {
          for (const item of result.exported) {
            process.stdout.write(`✅ 已导出 [${item.tweetId}] → ${item.filePath}\n`);
          }
          for (const f of result.failed) {
            process.stderr.write(`❌ 导出失败 [${f.tweetId}]: ${f.error}\n`);
          }
          if (result.failed.length > 0) {
            process.stdout.write(
              `⚠️ 批量导出完成：成功 ${result.exported.length} 篇，失败 ${result.failed.length} 篇（共 ${ids.length} 篇）。\n`
            );
          } else {
            process.stdout.write(`🎉 批量导出完成：成功导出 ${result.exported.length} 篇推文。\n`);
          }
        }
        finish(result.exported.length === 0 && result.failed.length > 0 ? 1 : 0);
        return;
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
        finish(0);
        return;
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
          process.stdout.write(formatTrendsTable(trends, `X 全网实时趋势 (${options.category})`, cmdHint));
        }
        finish(0);
        return;
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
        finish(0);
        return;
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
          process.stdout.write(formatTweetTable(tweets, `搜索 '${options.search}' 结果`, cmdHint));
        }
        if (options.export !== undefined) {
          storage.exportMarkdown({
            outputFile: options.output,
            limit: typeof options.export === 'string' ? parseInt(options.export, 10) : 200,
            minLikes,
            minRetweets,
          });
        }
        finish(0);
        return;
      }

      // 9. User timeline
      if (options.user) {
        const tweets = await pipeline.fetchUserAndStore(options.user, limit, timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          process.stdout.write(formatTweetTable(tweets, `博主 @${options.user} 推文`, cmdHint));
        }
        finish(0);
        return;
      }

      // 10. List timeline
      if (options.xList) {
        const tweets = await pipeline.fetchListAndStore(options.xList, limit, timeout);
        if (isJson) {
          process.stdout.write(JSON.stringify(tweets, null, 2) + '\n');
        } else {
          process.stdout.write(formatTweetTable(tweets, `X 列表推文`, cmdHint));
        }
        finish(0);
        return;
      }

      // 11. Fetch only
      if (options.fetchOnly) {
        const [fetched, inserted, skipped] = await pipeline.fetchAndStore({
          maxPages: pages,
          limit: options.limit ? limit : undefined,
          timeout,
        });
        if (isJson) {
          process.stdout.write(JSON.stringify({ fetched, inserted, skipped }) + '\n');
        } else {
          process.stdout.write(`✓ 抓取完成：获取 ${fetched} 条推文，新增入库 ${inserted} 条，跳过去重 ${skipped} 条\n`);
        }
        finish(0);
        return;
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
        finish(0);
        return;
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
      finish(0);
        return;
    } catch (err: any) {
      if (isJson) {
        process.stdout.write(JSON.stringify({ status: 'error', error: err?.message || String(err) }) + '\n');
      } else {
        process.stderr.write(`❌ 执行出错: ${err?.message || err}\n`);
      }
      finish(1);
        return;
    }
  });

  Config.detectLocalProxy().then(() => {
    // 传数组时 commander 默认按 from:'node' 再跳过两段，与已解析的 userArgs 冲突
    try {
      program.parse(userArgs, { from: 'user' });
    } catch (err) {
      if (err instanceof CommanderError) {
        // exitOverride 生效：--version / --help 已输出到 stdout，选项错误已输出到 stderr，
        // 按 commander 给定的退出码显式收尾（不隐式依赖 process.exit）
        process.exitCode = err.exitCode;
        const t = setTimeout(() => process.exit(err.exitCode), 50);
        (t as any).unref?.();
        return;
      }
      throw err;
    }
  });
} else {
  // Lazy import electron only when launching GUI
  import('electron').then(async ({ app, BrowserWindow, session }) => {
    const { registerIpcHandlers } = await import('./ipc/index.js');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fs = await import('node:fs');
    let preloadPath = path.resolve(__dirname, '../preload/index.cjs');
    if (!fs.existsSync(preloadPath)) {
      preloadPath = path.resolve(__dirname, '../preload/index.js');
    }

    let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
    let isQuitting = false;

    const createWindow = () => {
      const win = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: 'Xtract - Intelligence Radar & AI Digest',
        backgroundColor: '#faf7f0',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath,
        },
      });

      mainWindow = win;
      registerIpcHandlers(win);

      const devServerUrl = process.env.VITE_DEV_SERVER_URL;
      if (devServerUrl) {
        win.loadURL(devServerUrl);
      } else {
        const prodIndexPath = path.resolve(__dirname, '../../dist/renderer/index.html');
        if (fs.existsSync(prodIndexPath)) {
          win.loadFile(prodIndexPath);
        } else {
          win.loadURL('http://localhost:5173');
        }
      }

      // macOS 原生交互标准：用户点左上角 X 时隐藏而非销毁，点 Dock 图标无感毫秒级唤起
      win.on('close', (e) => {
        if (process.platform === 'darwin' && !isQuitting) {
          e.preventDefault();
          win.hide();
        }
      });

      win.on('closed', () => {
        mainWindow = null;
      });

      return win;
    };

    app.whenReady().then(async () => {
      // 启动前极速探活本机常见科学上网代理 (8118/7890/7897 等)，彻底解决直连 ERR_CONNECTION_CLOSED
      const proxyUrl = await Config.detectLocalProxy();
      if (proxyUrl && session.defaultSession) {
        await session.defaultSession.setProxy({
          proxyRules: proxyUrl,
        });
        process.stderr.write(`🌐 Electron 会话已成功挂载本地代理通道: ${proxyUrl}\n`);
      }

      // 为推特多媒体与视频流注入官方 Referer 和 Origin，彻底杜绝防盗链 403 导致媒体控制条禁用
      if (session.defaultSession) {
        session.defaultSession.webRequest.onBeforeSendHeaders(
          { urls: ['*://*.twimg.com/*', '*://video.twimg.com/*'] },
          (details, callback) => {
            const headers = { ...details.requestHeaders };
            headers['Referer'] = 'https://x.com/';
            headers['Origin'] = 'https://x.com';
            callback({ cancel: false, requestHeaders: headers });
          }
        );
      }

      createWindow();
    });

    app.on('before-quit', () => {
      isQuitting = true;
    });

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  });
}
