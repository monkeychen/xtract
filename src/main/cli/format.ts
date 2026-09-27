import type { Tweet, TrendTopic } from '../types.js';

export function formatTweetTable(tweets: Tweet[], title: string): string {
  const lines: string[] = [];
  lines.push(`\n=== ${title} ===`);
  lines.push('─'.repeat(80));

  tweets.forEach((t, idx) => {
    const author = `${t.author_name} (@${t.author_username})`;
    const text = (t.text || '').replace(/\s+/g, ' ').slice(0, 72);
    const metrics = `❤️ ${t.like_count || 0}  🔁 ${t.retweet_count || 0}`;
    lines.push(
      `${String(idx + 1).padStart(2)}. [${t.tweet_id}] ${author} | ${metrics}\n    ${text}`
    );
  });

  lines.push('─'.repeat(80));
  lines.push('💡 提示：');
  lines.push('• 查看单篇推文全文及多媒体：pnpm dev:cli -- --view <推文ID>');
  lines.push('• 导出全量推文为 Markdown 查阅：pnpm dev:cli -- --export\n');

  return lines.join('\n');
}

export function formatTrendsTable(trends: TrendTopic[], title: string): string {
  const lines: string[] = [];
  lines.push(`\n=== ${title} ===`);
  lines.push('─'.repeat(80));
  lines.push(
    `${'#'.padEnd(4)} ${'趋势话题 / 热点'.padEnd(30)} ${'所属分类'.padEnd(16)} ${'热度指标'.padEnd(16)} 推荐检索 Query`
  );
  lines.push('─'.repeat(80));

  trends.forEach((t, idx) => {
    const rank = String(t.rank || idx + 1).padEnd(4);
    const name = (t.name || '').padEnd(30).slice(0, 30);
    const domain = (t.domain || 'General').padEnd(16).slice(0, 16);
    const volume = String(t.tweet_count || '高讨论量').padEnd(16).slice(0, 16);
    const query = t.query || t.name;
    lines.push(`${rank} ${name} ${domain} ${volume} ${query}`);
  });

  lines.push('─'.repeat(80));
  lines.push('💡 提示：可使用 `pnpm dev:cli -- --trends-digest` 全自动对上述热点生成深度研报。\n');

  return lines.join('\n');
}

export function formatTweetDetail(t: Tweet): string {
  const author = `${t.author_name} (@${t.author_username})`;
  const url = `https://x.com/${t.author_username}/status/${t.tweet_id}`;
  const metrics = `❤️ 赞: ${t.like_count || 0} | 🔁 转发: ${t.retweet_count || 0} | 💬 回复: ${t.reply_count || 0} | 👁️ 浏览: ${t.view_count || 0}`;

  const lines: string[] = [];
  lines.push('\n' + '─'.repeat(60));
  lines.push(`推文详情: ${t.tweet_id}`);
  lines.push('─'.repeat(60));
  lines.push(`作者: ${author}`);
  lines.push(`发布时间: ${t.created_at || '未知'}`);
  lines.push(`原文链接: ${url}`);
  lines.push(`互动数据: ${metrics}`);
  lines.push('─'.repeat(60));
  lines.push(`\n正文:\n${t.text || ''}\n`);

  if (t.is_retweet) {
    lines.push(`🔁 转推自 @${t.retweeted_author}:\n${t.retweeted_text || ''}\n`);
  } else if (t.is_quote) {
    lines.push(`💬 引用推文 @${t.quoted_author}:\n${t.quoted_text || ''}\n`);
  }

  if (t.urls && t.urls.length > 0) {
    lines.push('🔗 附带链接:');
    t.urls.forEach((u) => lines.push(`  - ${u}`));
    lines.push('');
  }

  if (t.media_urls && t.media_urls.length > 0) {
    lines.push('🖼️ 媒体附件:');
    t.media_urls.forEach((m) => lines.push(`  - ${m}`));
    lines.push('');
  }

  lines.push('─'.repeat(60) + '\n');
  return lines.join('\n');
}
