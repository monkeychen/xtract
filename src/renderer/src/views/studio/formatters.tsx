import React from 'react';
import { TweetMarkdown } from '../../components/TweetMarkdown.js';

/**
 * 推文展示层格式化函数：正文渲染、列表标题提取、相对时间与数字紧凑显示。
 * 契约与测试见 tests/studio-list-formatter.test.ts。
 */

/**
 * 格式化并渲染推文正文，支持完整 Markdown 标题、X Article 专栏专属核心摘要卡片、列表、内联图片与可点击超链接
 */
export function renderFormattedTweetText(
  text: string,
  urls?: string[],
  onOpenUrl?: (url: string) => void,
  onPreviewImage?: (imgUrl: string) => void
): React.ReactNode {
  if (!text) return null;
  return (
    <TweetMarkdown
      content={text}
      urls={urls}
      onOpenUrl={onOpenUrl}
      onPreviewImage={onPreviewImage}
    />
  );
}


/**
 * 提取推文的标题与摘要（紧凑列表扫读体验）
 * 规则：
 * 1. 显式 Markdown 标题 (# Title) 或【...】等格式直接作为标题
 * 2. 多行时，第一行作为标题（若包含前缀符号自动修剪）；剩余内容作为次级摘要
 * 3. 单行时长文本：按标点符号断句，首句为标题，剩余为摘要；若无断句，前 45 字符为标题，剩余为摘要
 * 4. 极简短推文（如“收藏”、“只能说MiniMax-3是真的拉...”）：直接全句作为标题，不生成冗余摘要
/**
 * 提取推文列表单行标题/首要摘要 (§1 列表只显示推文标题，无标题显示摘要，无摘要显示第一行文字)
 */
export function getTweetListDisplayTitle(rawText: string = ''): string {
  const text = (rawText || '').trim();
  if (!text) {
    return '（无文本推文）';
  }
  if (/^https?:\/\/\S+$/.test(text)) {
    return `🔗 ${text}`;
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0];
    const mdMatch = firstLine.match(/^#+\s*(.+)$/);
    if (mdMatch) return mdMatch[1].trim();

    const bracketMatch = firstLine.match(/^([【\[《][^】\]》]+[】\]》])\s*(.*)$/);
    if (bracketMatch && bracketMatch[2].length > 0) {
      return `${bracketMatch[1]} ${bracketMatch[2]}`.trim();
    }
    return firstLine;
  }

  const matchSentence = text.match(/^(.{6,45}[。！？\?!;；])/);
  if (matchSentence) {
    return matchSentence[1].trim();
  }

  return text;
}

export function extractTweetTitleAndSnippet(rawText: string = ''): { title: string; snippet?: string } {
  const text = (rawText || '').trim();
  if (!text) {
    return { title: '（无文本推文）' };
  }

  // 纯 URL
  if (/^https?:\/\/\S+$/.test(text)) {
    return { title: `🔗 ${text}` };
  }

  // 按换行分割
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    const line0 = lines[0];
    const rest = lines.slice(1).join(' ').trim();

    // 识别 Markdown 标题 (# 标题)
    const mdMatch = line0.match(/^#+\s*(.+)$/);
    if (mdMatch) {
      return {
        title: mdMatch[1].trim(),
        snippet: rest.slice(0, 120),
      };
    }

    // 识别【主题】或《主题》
    const bracketMatch = line0.match(/^([【\[《][^】\]》]+[】\]》])\s*(.*)$/);
    if (bracketMatch && bracketMatch[2].length > 0) {
      return {
        title: bracketMatch[1] + ' ' + bracketMatch[2],
        snippet: rest.slice(0, 120),
      };
    }

    // 第一行作为标题，后续行合并为摘要
    return {
      title: line0,
      snippet: rest.slice(0, 120),
    };
  }

  // 单行文本
  const single = lines[0] || text;
  // 若长度不超过 45 字符，整句就是标题，不需要摘要
  if (single.length <= 45) {
    return { title: single };
  }

  // 1. 尝试在自然句末标点 (。！？?!;；) 断句
  const matchSentence = single.match(/^(.{6,45}[。！？\?!;；])\s*(.*)$/);
  if (matchSentence) {
    return {
      title: matchSentence[1].trim(),
      snippet: matchSentence[2].trim() ? matchSentence[2].trim().slice(0, 120) : undefined,
    };
  }

  // 2. 尝试在中文/英文逗号断句 (首个分句作为标题)
  const matchComma = single.match(/^(.{4,30}?[，,])\s*(.*)$/);
  if (matchComma) {
    const rawTitle = matchComma[1].trim().replace(/[，,]$/, '');
    return {
      title: rawTitle,
      snippet: matchComma[2].trim() ? matchComma[2].trim().slice(0, 120) : undefined,
    };
  }

  // 3. 无合适断句，前 40 字加省略号作为标题，后续作为摘要
  return {
    title: single.slice(0, 40) + '...',
    snippet: single.slice(40).trim().slice(0, 120),
  };
}

/**
 * 格式化相对时间 (刚刚, 5分钟前, 2小时前, 昨天, 03-12)
 */
export function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return dateStr.slice(0, 10);
  }
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  if (diffSec < 86400 * 2) return '昨天';
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}天前`;
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 紧凑格式化数字
 */
export function formatCount(num?: number): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

