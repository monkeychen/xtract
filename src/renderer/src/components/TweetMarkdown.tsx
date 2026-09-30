import React from 'react';

export interface TweetMarkdownProps {
  content: string;
  urls?: string[];
  onOpenUrl?: (url: string) => void;
  onPreviewImage?: (imgUrl: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 解析行内 Markdown 元素：加粗、斜体、代码、删除线、Markdown 链接、Markdown 图片与原生 URL
 */
export function renderInlineMarkdown(
  text: string,
  urls?: string[],
  onOpenUrl?: (url: string) => void,
  onPreviewImage?: (imgUrl: string) => void,
  keyPrefix = 'inline'
): React.ReactNode[] {
  if (!text) return [];

  // 精准匹配行内标记，杜绝贪婪吞噬
  const tokenRegex =
    /(!\[[^\]]*\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)|\[[^\]]+\]\((?:https?:\/\/[^\s\)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|https:\/\/t\.co\/[a-zA-Z0-9]+|https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]+)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    const token = match[1];
    const key = `${keyPrefix}-${counter++}-${match.index}`;

    if (token.startsWith('![') && token.endsWith(')')) {
      // 命中图片 ![alt](url)
      const imgMatch = token.match(/^!\[(.*?)\]\((https?:\/\/[^\s\)]+|[^\s\)]+)\)$/);
      if (imgMatch) {
        const altText = imgMatch[1];
        const imgUrl = imgMatch[2];
        elements.push(
          <span
            key={key}
            style={{
              margin: '12px 0',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: 'var(--paper-sunken)',
              display: 'inline-block',
              maxWidth: '100%',
              verticalAlign: 'middle',
            }}
          >
            <img
              src={imgUrl}
              alt={altText}
              loading="lazy"
              style={{
                maxWidth: '100%',
                maxHeight: '480px',
                display: 'block',
                margin: '0 auto',
                objectFit: 'contain',
                cursor: 'zoom-in',
                borderRadius: '6px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onPreviewImage) onPreviewImage(imgUrl);
              }}
              title={altText || '点击全屏高清预览图片'}
            />
          </span>
        );
      } else {
        elements.push(token);
      }
    } else if (token.startsWith('[') && token.endsWith(')')) {
      // 命中链接 [label](url)
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)$/);
      if (linkMatch) {
        const label = linkMatch[1];
        const targetUrl = linkMatch[2];
        elements.push(
          <a
            key={key}
            href={targetUrl}
            className="tweet-inline-link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenUrl) onOpenUrl(targetUrl);
            }}
            style={{
              color: 'var(--accent, #0284c7)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--accent, #0284c7)',
              cursor: 'pointer',
              fontWeight: 500,
              padding: '0 2px',
              borderRadius: '2px',
            }}
            title={`在系统默认浏览器中打开: ${targetUrl}`}
          >
            {label} ↗
          </a>
        );
      } else {
        elements.push(token);
      }
    } else if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      // 命中行内代码 `code`
      const codeContent = token.slice(1, -1);
      elements.push(
        <code
          key={key}
          style={{
            fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
            fontSize: '0.9em',
            padding: '2px 6px',
            background: 'var(--paper-sunken)',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            color: 'var(--cinnabar, #e11d48)',
          }}
        >
          {codeContent}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      // 命中加粗 **bold**
      const boldText = token.slice(2, -2);
      elements.push(
        <strong key={key} style={{ fontWeight: 700, color: 'var(--ink)' }}>
          {renderInlineMarkdown(boldText, urls, onOpenUrl, onPreviewImage, `${key}-b`)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      // 命中斜体 *italic*
      const italicText = token.slice(1, -1);
      elements.push(
        <em key={key} style={{ fontStyle: 'italic', color: 'var(--ink)' }}>
          {italicText}
        </em>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length >= 4) {
      // 命中删除线 ~~del~~
      const delText = token.slice(2, -2);
      elements.push(
        <del key={key} style={{ textDecoration: 'line-through', color: 'var(--ink-faint)' }}>
          {delText}
        </del>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      // 命中裸 URL (t.co 或普通外链)
      const rawUrl = token;
      let targetUrl = rawUrl;
      let displayLabel = rawUrl;

      // 历史推文短链智能解绑：若匹配到 t.co 短链，且推文元数据包含真实 urls，则自动对齐真实地址
      if (rawUrl.includes('https://t.co/') && urls && urls.length > 0) {
        const validUrls = urls.filter((u) => !u.includes('https://t.co/'));
        if (validUrls.length > 0) {
          targetUrl = validUrls[0];
        }
      }

      try {
        const uObj = new URL(targetUrl);
        displayLabel =
          uObj.hostname.replace(/^www\./, '') +
          (uObj.pathname.length > 1 ? uObj.pathname.slice(0, 16) + '...' : '');
      } catch {
        displayLabel = targetUrl;
      }

      elements.push(
        <a
          key={key}
          href={targetUrl}
          className="tweet-inline-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onOpenUrl) onOpenUrl(targetUrl);
          }}
          style={{
            color: 'var(--accent, #0284c7)',
            textDecoration: 'none',
            borderBottom: '1px solid var(--accent, #0284c7)',
            cursor: 'pointer',
            fontWeight: 500,
            padding: '0 2px',
            borderRadius: '2px',
          }}
          title={`在系统默认浏览器中打开: ${targetUrl}`}
        >
          {displayLabel} ↗
        </a>
      );
    } else {
      elements.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}

interface BlockItem {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'divider'
    | 'summary-card'
    | 'blockquote'
    | 'ul'
    | 'ol'
    | 'standalone-image'
    | 'paragraph';
  lines: string[];
  level?: number;
  altText?: string;
  imgUrl?: string;
}

/**
 * 块级 Markdown 扫描解析器
 */
function parseBlocks(rawText: string, urls?: string[]): BlockItem[] {
  // 1. 规整换行并清洗末尾冗余媒体短链
  let clean = rawText
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  clean = clean.replace(/\s*https:\/\/t\.co\/[a-zA-Z0-9]+$/g, (match) => {
    const raw = match.trim();
    if (urls && urls.includes(raw)) return match;
    return '';
  });

  const lines = clean.split('\n');
  const blocks: BlockItem[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过纯空行
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. 水平分割线 (--- / ***)
    if (/^(\-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'divider', lines: [trimmed] });
      i++;
      continue;
    }

    // 2. 标题 (# ~ ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const type = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
      blocks.push({ type, lines: [text], level });
      i++;
      continue;
    }

    // 3. 引用块 (> ...) -> 特别检查是否为「核心摘要 / 提要」专栏卡片
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        const curTrimmed = lines[i].trim();
        if (curTrimmed.startsWith('>')) {
          // 剥除前导 > 符号与首个空格
          quoteLines.push(curTrimmed.replace(/^>\s?/, ''));
        } else if (quoteLines.length > 0 && curTrimmed === '') {
          // 引用块内部的空行允许容忍一行，若下一行仍是 > 则继续，否则跳出
          if (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
            quoteLines.push('');
          } else {
            break;
          }
        }
        i++;
      }

      // 判定是否为专栏「核心摘要 / 提要」卡片
      const firstLine = quoteLines[0] || '';
      const isSummary =
        firstLine.includes('核心摘要') ||
        firstLine.includes('提要') ||
        firstLine.includes('Executive Summary');

      if (isSummary) {
        blocks.push({ type: 'summary-card', lines: quoteLines });
      } else {
        blocks.push({ type: 'blockquote', lines: quoteLines });
      }
      continue;
    }

    // 4. 无序列表 (- / * / +)
    if (/^[-*+]\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        listLines.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', lines: listLines });
      continue;
    }

    // 5. 有序列表 (1. / 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listLines.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', lines: listLines });
      continue;
    }

    // 6. 单独成行的 Markdown 图片 ![alt](url)
    const singleImgMatch = trimmed.match(/^!\[(.*?)\]\((https?:\/\/[^\s\)]+|[^\s\)]+)\)$/);
    if (singleImgMatch) {
      blocks.push({
        type: 'standalone-image',
        lines: [trimmed],
        altText: singleImgMatch[1],
        imgUrl: singleImgMatch[2],
      });
      i++;
      continue;
    }

    // 7. 普通段落 (多行归并，直到遇到空行、标题或列表)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const curTrimmed = lines[i].trim();
      if (!curTrimmed) break;
      if (/^(\-{3,}|\*{3,})$/.test(curTrimmed)) break;
      if (/^#{1,4}\s+/.test(curTrimmed)) break;
      if (curTrimmed.startsWith('>')) break;
      if (/^[-*+]\s+/.test(curTrimmed)) break;
      if (/^\d+\.\s+/.test(curTrimmed)) break;
      if (/^!\[.*?\]\(.*?\)$/.test(curTrimmed)) break;

      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      // 检查段落是否以「一、」「二、」等中文节次标题开头，若是则标记
      blocks.push({ type: 'paragraph', lines: paraLines });
    }
  }

  return blocks;
}

/**
 * 专为 Xtract 情报工作台打造的推文 & X Article 专栏专属 Markdown 渲染器
 */
export const TweetMarkdown: React.FC<TweetMarkdownProps> = ({
  content,
  urls,
  onOpenUrl,
  onPreviewImage,
  className,
  style,
}) => {
  if (!content) return null;

  const blocks = parseBlocks(content, urls);

  return (
    <div
      className={`tweet-markdown-container ${className || ''}`}
      style={{
        lineHeight: '1.8',
        color: 'var(--ink)',
        fontSize: '15.5px',
        wordBreak: 'break-word',
        ...style,
      }}
    >
      {blocks.map((block, idx) => {
        const blockKey = `blk-${idx}-${block.type}`;

        switch (block.type) {
          case 'h1':
            return (
              <h1
                key={blockKey}
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: '18px 0 12px 0',
                  lineHeight: '1.4',
                  letterSpacing: '-0.02em',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {renderInlineMarkdown(block.lines[0], urls, onOpenUrl, onPreviewImage, blockKey)}
              </h1>
            );

          case 'h2':
            return (
              <h2
                key={blockKey}
                style={{
                  fontSize: '18.5px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '20px 0 10px 0',
                  lineHeight: '1.45',
                  letterSpacing: '-0.01em',
                }}
              >
                {renderInlineMarkdown(block.lines[0], urls, onOpenUrl, onPreviewImage, blockKey)}
              </h2>
            );

          case 'h3':
            return (
              <h3
                key={blockKey}
                style={{
                  fontSize: '16.5px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '16px 0 8px 0',
                  lineHeight: '1.5',
                }}
              >
                {renderInlineMarkdown(block.lines[0], urls, onOpenUrl, onPreviewImage, blockKey)}
              </h3>
            );

          case 'h4':
            return (
              <h4
                key={blockKey}
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--ink-soft)',
                  margin: '14px 0 6px 0',
                }}
              >
                {renderInlineMarkdown(block.lines[0], urls, onOpenUrl, onPreviewImage, blockKey)}
              </h4>
            );

          case 'divider':
            return (
              <hr
                key={blockKey}
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--line)',
                  margin: '24px 0',
                }}
              />
            );

          case 'summary-card': {
            // X Article 专栏专属「核心摘要 / 提要」卡片
            const [titleLine, ...itemLines] = block.lines;
            // 提要标题文本，剥除加粗标记作为纯文本标题
            const cleanTitle = titleLine
              .replace(/\*\*/g, '')
              .replace(/:$/, '')
              .trim();

            return (
              <div
                key={blockKey}
                className="tweet-markdown-summary-card"
                style={{
                  margin: '18px 0 22px 0',
                  padding: '16px 20px',
                  background: 'var(--paper-sunken)',
                  border: '1px solid rgba(2, 132, 199, 0.28)',
                  borderLeft: '4px solid var(--accent, #0284c7)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    color: 'var(--accent, #0284c7)',
                    fontWeight: 700,
                    fontSize: '14px',
                    letterSpacing: '0.02em',
                  }}
                >
                  <span style={{ fontSize: '15px' }}>⚡</span>
                  <span>{cleanTitle || '核心摘要 / 提要'}</span>
                </div>

                <div style={{ fontSize: '14px', lineHeight: '1.75', color: 'var(--ink)' }}>
                  {itemLines.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {itemLines.map((it, itIdx) => {
                        const itTrimmed = it.trim();
                        if (!itTrimmed) return null;
                        const cleanItem = itTrimmed.replace(/^[-*+]\s+/, '');
                        return (
                          <li key={`${blockKey}-item-${itIdx}`} style={{ marginBottom: '6px' }}>
                            {renderInlineMarkdown(
                              cleanItem,
                              urls,
                              onOpenUrl,
                              onPreviewImage,
                              `${blockKey}-it-${itIdx}`
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div>
                      {renderInlineMarkdown(
                        titleLine,
                        urls,
                        onOpenUrl,
                        onPreviewImage,
                        `${blockKey}-txt`
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          case 'blockquote':
            return (
              <blockquote
                key={blockKey}
                style={{
                  margin: '16px 0',
                  padding: '10px 16px',
                  background: 'var(--paper-sunken)',
                  borderLeft: '3px solid var(--cinnabar, #e11d48)',
                  borderRadius: '4px',
                  color: 'var(--ink-soft)',
                  fontStyle: 'normal',
                }}
              >
                {block.lines.map((l, lIdx) => (
                  <p key={`${blockKey}-l-${lIdx}`} style={{ margin: '4px 0', lineHeight: '1.6' }}>
                    {renderInlineMarkdown(l, urls, onOpenUrl, onPreviewImage, `${blockKey}-${lIdx}`)}
                  </p>
                ))}
              </blockquote>
            );

          case 'ul':
            return (
              <ul
                key={blockKey}
                style={{
                  margin: '12px 0 16px 0',
                  paddingLeft: '22px',
                  lineHeight: '1.75',
                }}
              >
                {block.lines.map((item, itemIdx) => (
                  <li key={`${blockKey}-${itemIdx}`} style={{ marginBottom: '4px' }}>
                    {renderInlineMarkdown(
                      item,
                      urls,
                      onOpenUrl,
                      onPreviewImage,
                      `${blockKey}-${itemIdx}`
                    )}
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol
                key={blockKey}
                style={{
                  margin: '12px 0 16px 0',
                  paddingLeft: '22px',
                  lineHeight: '1.75',
                }}
              >
                {block.lines.map((item, itemIdx) => (
                  <li key={`${blockKey}-${itemIdx}`} style={{ marginBottom: '4px' }}>
                    {renderInlineMarkdown(
                      item,
                      urls,
                      onOpenUrl,
                      onPreviewImage,
                      `${blockKey}-${itemIdx}`
                    )}
                  </li>
                ))}
              </ol>
            );

          case 'standalone-image': {
            const { altText, imgUrl } = block;
            if (!imgUrl) return null;

            return (
              <div
                key={blockKey}
                style={{
                  margin: '18px 0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid var(--line)',
                  background: 'var(--paper-sunken)',
                  display: 'block',
                  maxWidth: '100%',
                }}
              >
                <img
                  src={imgUrl}
                  alt={altText || '配图'}
                  loading="lazy"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '540px',
                    display: 'block',
                    margin: '0 auto',
                    objectFit: 'contain',
                    cursor: 'zoom-in',
                    borderRadius: '6px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPreviewImage) onPreviewImage(imgUrl);
                  }}
                  title={altText || '点击全屏高清预览图片'}
                />
                {altText && altText !== '封面图' && altText !== '配图' && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--ink-faint)',
                      padding: '6px 12px',
                      textAlign: 'center',
                      background: 'rgba(0,0,0,0.02)',
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    {altText}
                  </span>
                )}
              </div>
            );
          }

          case 'paragraph': {
            // 检查首行是否像中文章节段落标题（如 "一、趋势低吸" / "二、套利低吸"）
            const firstLine = block.lines[0].trim();
            const isSectionHeading = /^[一二三四五六七八九十]+[、.．]\s*.+$/.test(firstLine);

            return (
              <div key={blockKey} style={{ marginBottom: '14px' }}>
                {block.lines.map((lineText, lineIdx) => {
                  const lineTrimmed = lineText.trim();
                  if (!lineTrimmed) return null;

                  const isHeadingLine =
                    lineIdx === 0 &&
                    isSectionHeading &&
                    /^[一二三四五六七八九十]+[、.．]\s*.+$/.test(lineTrimmed);

                  if (isHeadingLine) {
                    return (
                      <div
                        key={`${blockKey}-p-${lineIdx}`}
                        style={{
                          fontSize: '17px',
                          fontWeight: 700,
                          color: 'var(--ink)',
                          margin: '22px 0 10px 0',
                          lineHeight: '1.4',
                        }}
                      >
                        {renderInlineMarkdown(
                          lineText,
                          urls,
                          onOpenUrl,
                          onPreviewImage,
                          `${blockKey}-sec-${lineIdx}`
                        )}
                      </div>
                    );
                  }

                  return (
                    <p
                      key={`${blockKey}-p-${lineIdx}`}
                      style={{
                        margin: '0 0 12px 0',
                        lineHeight: '1.8',
                        color: 'var(--ink)',
                        fontSize: '15.5px',
                      }}
                    >
                      {renderInlineMarkdown(
                        lineText,
                        urls,
                        onOpenUrl,
                        onPreviewImage,
                        `${blockKey}-p-${lineIdx}`
                      )}
                    </p>
                  );
                })}
              </div>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
};
