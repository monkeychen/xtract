import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  classifyTweetContentType,
  matchesContentTypes,
  parseContentTypes,
} from '../src/main/client/parser.js';
import { Config } from '../src/main/config.js';
import type { Tweet } from '../src/main/types.js';

describe('T1.1: TweetContentType classification, matching & config', () => {
  const articleTweet: Partial<Tweet> = {
    tweet_id: 'a1',
    is_article: true,
    is_note_tweet: true, // 文章正文也通常 > 280 字，必须优先归为 article
    text: '# 深度长文标题\n\n' + '很长的专栏正文内容。'.repeat(50),
  };

  const articleByUrl: Partial<Tweet> = {
    tweet_id: 'a2',
    text: 'Check out my new article',
    urls: ['https://x.com/i/article/123456789'],
  };

  const noteTweet: Partial<Tweet> = {
    tweet_id: 'n1',
    is_note_tweet: true,
    text: '这是一条超过 280 字的长推文。'.repeat(25),
  };

  const truncatedNoteTweet: Partial<Tweet> = {
    tweet_id: 'n2',
    text: 'This is a long note preview that gets truncated… https://t.co/abc123',
  };

  const shortTweet: Partial<Tweet> = {
    tweet_id: 's1',
    text: 'Just shipped a tiny fix!',
  };

  it('UT-1: classifyTweetContentType prioritizes article > note > short', () => {
    expect(classifyTweetContentType(articleTweet)).toBe('article');
    expect(classifyTweetContentType(articleByUrl)).toBe('article');
    expect(classifyTweetContentType(noteTweet)).toBe('note');
    expect(classifyTweetContentType(truncatedNoteTweet)).toBe('note');
    expect(classifyTweetContentType(shortTweet)).toBe('short');
  });

  it('UT-2: matchesContentTypes accurately filters by allowed set', () => {
    // 默认仅专栏文章
    expect(matchesContentTypes(articleTweet, ['article'])).toBe(true);
    expect(matchesContentTypes(noteTweet, ['article'])).toBe(false);
    expect(matchesContentTypes(shortTweet, ['article'])).toBe(false);

    // 专栏 + 长推
    expect(matchesContentTypes(articleTweet, ['article', 'note'])).toBe(true);
    expect(matchesContentTypes(noteTweet, ['article', 'note'])).toBe(true);
    expect(matchesContentTypes(shortTweet, ['article', 'note'])).toBe(false);

    // 仅短推
    expect(matchesContentTypes(articleTweet, ['short'])).toBe(false);
    expect(matchesContentTypes(noteTweet, ['short'])).toBe(false);
    expect(matchesContentTypes(shortTweet, ['short'])).toBe(true);

    // 全部类型
    expect(matchesContentTypes(articleTweet, ['article', 'note', 'short'])).toBe(true);
    expect(matchesContentTypes(noteTweet, ['article', 'note', 'short'])).toBe(true);
    expect(matchesContentTypes(shortTweet, ['article', 'note', 'short'])).toBe(true);
  });

  it('UT-3: parseContentTypes handles lenient normalization and strict validation', () => {
    // 宽松模式：空值/空白回退 ['article']，去重并规范顺序 article -> note -> short
    expect(parseContentTypes(undefined)).toEqual(['article']);
    expect(parseContentTypes('')).toEqual(['article']);
    expect(parseContentTypes('   ')).toEqual(['article']);
    expect(parseContentTypes('short, article, short, NOTE')).toEqual(['article', 'note', 'short']);
    expect(parseContentTypes(['note', 'article'])).toEqual(['article', 'note']);
    expect(parseContentTypes('invalid_only')).toEqual(['article']);
    expect(parseContentTypes('note,bogus')).toEqual(['note']);

    // 严格模式（CLI 用）：合法值规范化，非法值或空值直接抛错
    expect(parseContentTypes('note,article', { strict: true })).toEqual(['article', 'note']);
    expect(() => parseContentTypes('', { strict: true })).toThrow(/article.*note.*short/i);
    expect(() => parseContentTypes('article,video', { strict: true })).toThrow(/video/);
  });

  describe('UT-4: Config.FETCH_CONTENT_TYPES defaults & persistence', () => {
    const origContentTypes = process.env.FETCH_CONTENT_TYPES;
    const origOnlyLong = process.env.FETCH_ONLY_LONG_TWEETS;

    beforeEach(() => {
      delete process.env.FETCH_CONTENT_TYPES;
      delete process.env.FETCH_ONLY_LONG_TWEETS;
    });

    afterEach(() => {
      if (origContentTypes === undefined) delete process.env.FETCH_CONTENT_TYPES;
      else process.env.FETCH_CONTENT_TYPES = origContentTypes;
      if (origOnlyLong === undefined) delete process.env.FETCH_ONLY_LONG_TWEETS;
      else process.env.FETCH_ONLY_LONG_TWEETS = origOnlyLong;
    });

    it('defaults to ["article"] even if legacy FETCH_ONLY_LONG_TWEETS=true exists', () => {
      expect(Config.FETCH_CONTENT_TYPES).toEqual(['article']);

      process.env.FETCH_ONLY_LONG_TWEETS = 'true';
      expect(Config.FETCH_CONTENT_TYPES).toEqual(['article']);
      expect(Config.FETCH_ONLY_LONG_TWEETS).toBe(true);
    });

    it('reads configured FETCH_CONTENT_TYPES and derives FETCH_ONLY_LONG_TWEETS', () => {
      process.env.FETCH_CONTENT_TYPES = 'article,note';
      expect(Config.FETCH_CONTENT_TYPES).toEqual(['article', 'note']);
      expect(Config.FETCH_ONLY_LONG_TWEETS).toBe(true);

      process.env.FETCH_CONTENT_TYPES = 'article,note,short';
      expect(Config.FETCH_CONTENT_TYPES).toEqual(['article', 'note', 'short']);
      expect(Config.FETCH_ONLY_LONG_TWEETS).toBe(false);
    });
  });
});
