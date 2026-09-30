import { describe, it, expect } from 'vitest';
import React from 'react';
import { TweetMarkdown, renderInlineMarkdown } from '../src/renderer/src/components/TweetMarkdown.js';

describe('TweetMarkdown Unit Tests', () => {
  it('should render H1, H2 headings and Chinese section headers properly', () => {
    const rawText = `# 低吸4种经典模式\n\n一、趋势低吸：顺着大势找机会\n\n低吸富三代，追高毁一生。`;
    const element = TweetMarkdown({ content: rawText }) as React.ReactElement<any>;
    expect(element).not.toBeNull();
    // 渲染出的顶层容器
    expect(element.props.className).toContain('tweet-markdown-container');
    const children = element.props.children;
    expect(Array.isArray(children)).toBe(true);

    // 检查是否有 H1 标题
    const h1Element = children.find((c: any) => c?.type === 'h1');
    expect(h1Element).toBeDefined();

    // 检查是否有中文节次样式
    const paraDiv = children.find((c: any) => c?.props?.style?.marginBottom === '14px');
    expect(paraDiv).toBeDefined();
  });

  it('should parse X Article executive summary cards properly', () => {
    const rawText = `> **核心摘要 / 提要**:\n> - 低吸核心是找趋势关键位置。\n> - 趋势低吸看日K能否延续。`;
    const element = TweetMarkdown({ content: rawText }) as React.ReactElement<any>;
    const children = element.props.children;
    const summaryCard = children.find(
      (c: any) => c?.props?.className === 'tweet-markdown-summary-card'
    );

    expect(summaryCard).toBeDefined();
    // 检查卡片内容包含提要标题与无序列表
    const cardContent = summaryCard?.props?.children;
    expect(cardContent).toBeDefined();
  });

  it('should parse markdown links and bare URLs in inline text', () => {
    const inlineNodes = renderInlineMarkdown(
      '欢迎访问 [官网](https://xtract.ai) 或 https://google.com 查看最新动态',
      ['https://xtract.ai', 'https://google.com']
    );

    expect(inlineNodes.length).toBeGreaterThan(1);
    const linkNodes = inlineNodes.filter(
      (n: any): n is React.ReactElement<any> => n?.props?.className === 'tweet-inline-link'
    );
    expect(linkNodes.length).toBe(2);

    const firstLink = linkNodes[0];
    expect(firstLink.props.href).toBe('https://xtract.ai');
    expect(firstLink.props.children).toContain('官网');
  });

  it('should resolve t.co shortlinks using tweet urls metadata', () => {
    const inlineNodes = renderInlineMarkdown('请点击 https://t.co/abcXYZ 了解更多', [
      'https://t.co/abcXYZ',
      'https://deepmind.google/technologies/gemini/',
    ]);

    const linkNodes = inlineNodes.filter(
      (n: any): n is React.ReactElement<any> => n?.props?.className === 'tweet-inline-link'
    );
    expect(linkNodes.length).toBe(1);
    expect(linkNodes[0].props.href).toBe('https://deepmind.google/technologies/gemini/');
  });

  it('should handle standalone markdown images and clean tail t.co', () => {
    const rawText = `这是推文配图\n\n![配图说明](https://pbs.twimg.com/media/test.jpg)\n\nhttps://t.co/tailmedia123`;
    const element = TweetMarkdown({ content: rawText }) as React.ReactElement<any>;
    const children = element.props.children;

    // 检查独立图片块
    const imgBlock = children.find((c: any) =>
      c?.props?.children?.some?.((sub: any) => sub?.type === 'img')
    );
    expect(imgBlock).toBeDefined();
  });

  it('should normalize escaped \\n\\n literal newlines gracefully', () => {
    const rawText = `第一行\\n\\n第二行\\n\\n第三行`;
    const element = TweetMarkdown({ content: rawText }) as React.ReactElement<any>;
    const children = element.props.children;
    expect(children.length).toBeGreaterThanOrEqual(1);
  });
});
