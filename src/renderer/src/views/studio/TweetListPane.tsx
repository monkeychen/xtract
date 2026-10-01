import React from 'react';
import type { Tweet } from '../../types.js';
import { classifyTweet, isTweetVideo, type CrawlProgress, type DataSource } from './logic.js';
import { formatCount, formatRelativeTime, getTweetListDisplayTitle } from './formatters.js';

export interface TweetListPaneProps {
  tweets: Tweet[];
  filteredTweets: Tweet[];
  totalDbCount: number;
  selectedTweet: Tweet | null;
  checkedIds: Set<string>;
  allChecked: boolean;
  dataSource: DataSource;
  streamFilter: string;
  searchQuery: string;
  userHandle: string;
  isLoading: boolean;
  crawlProgress: CrawlProgress | null;
  onSelectTweet: (tweet: Tweet) => void;
  onToggleCheck: (tweetId: string, e: React.MouseEvent<HTMLInputElement>) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onLoadMore: () => void;
  onCrawl: (source: DataSource) => void;
}

/**
 * 左栏：推文紧凑流 (Master)。
 * 包含全选/计数、来源徽标、实时抓取进度卡、信噪比过滤后的列表、
 * 四种数据源的空态引导，以及条件保全式「加载更早」按钮。
 */
export const TweetListPane: React.FC<TweetListPaneProps> = ({
  tweets,
  filteredTweets,
  totalDbCount,
  selectedTweet,
  checkedIds,
  allChecked,
  dataSource,
  streamFilter,
  searchQuery,
  userHandle,
  isLoading,
  crawlProgress,
  onSelectTweet,
  onToggleCheck,
  onToggleSelectAll,
  onLoadMore,
  onCrawl,
}) => (
  <div className="studio-sidebar">
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper-sunken)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--ink-soft)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="check-all"
              checked={allChecked}
              onChange={(e) => onToggleSelectAll(e.target.checked)}
            />
            <span id="selected-count-label">
              {checkedIds.size > 0 ? `已选 ${checkedIds.size} 篇` : '全选'}
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span id="feed-source-badge" style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--paper)', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
              {dataSource === 'following' && '📡 关注流'}
              {dataSource === 'search' && (searchQuery.trim() ? `🔍 搜: ${searchQuery.trim()}` : '🔍 全库推文')}
              {dataSource === 'user' && (userHandle.trim() ? `👤 @${userHandle.trim().replace(/^@/, '')}` : '👤 全部博主')}
              {dataSource === 'lists' && '📋 X 列表'}
            </span>
            <span id="feed-header-total" style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
              {streamFilter ? `${filteredTweets.length} / ${tweets.length} 条` : `${tweets.length} 条`}
            </span>
          </div>
        </div>

        {/* 实时抓取进度卡片 (§2.3) */}
        {crawlProgress && crawlProgress.active && (
          <div
            id="crawl-progress-card"
            style={{
              margin: '10px 14px',
              padding: '12px 14px',
              background: crawlProgress.completed ? 'var(--paper-raised)' : 'var(--paper-sunken)',
              border: crawlProgress.completed ? '1px solid var(--jade)' : '1px solid var(--cinnabar)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: crawlProgress.completed ? 'var(--jade)' : 'var(--cinnabar)',
                    boxShadow: crawlProgress.completed ? '0 0 0 2px var(--jade-wash)' : '0 0 0 2px var(--cinnabar-wash)',
                  }}
                />
                <span>{crawlProgress.title}</span>
              </div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: crawlProgress.completed ? 'var(--jade)' : 'var(--cinnabar)' }}>
                {crawlProgress.percent}%
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{crawlProgress.stage}</span>
              <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>{crawlProgress.detail}</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${crawlProgress.percent}%`,
                  height: '100%',
                  background: crawlProgress.completed ? 'var(--jade)' : 'var(--cinnabar)',
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          </div>
        )}

        <div id="feed-list-container" style={{ flex: 1, overflowY: 'auto' }}>
          {filteredTweets.map((tweet) => {
            const isSelected = selectedTweet?.tweet_id === tweet.tweet_id;
            const isChecked = checkedIds.has(tweet.tweet_id);
            const avatarLetter = (tweet.author_name || tweet.author_username || 'X')[0].toUpperCase();
            const displayTitle = getTweetListDisplayTitle(tweet.text);
            const relTime = formatRelativeTime(tweet.created_at);
            const { isArticle, isLong } = classifyTweet(tweet);

            return (
              <div
                key={tweet.tweet_id}
                className={`feed-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectTweet(tweet)}
              >
                {/* 第 1 行：复选框、印章头像、作者昵称/Handle 与右侧相对时间、点赞指标 */}
                <div className="feed-item-header">
                  <input
                    type="checkbox"
                    className="tweet-check"
                    checked={isChecked}
                    onClick={(e) => onToggleCheck(tweet.tweet_id, e)}
                    onChange={() => {}}
                  />
                  <div className="stamp-avatar">{avatarLetter}</div>
                  <div className="feed-author-meta">
                    <span className="feed-author-name">
                      {tweet.author_name || tweet.author_username}
                    </span>
                    <span className="feed-author-handle">
                      @{tweet.author_username}
                    </span>
                  </div>
                  {relTime && <span className="feed-item-time">{relTime}</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--ink-faint)', flexShrink: 0 }}>
                    <span>❤️ {formatCount(tweet.like_count)}</span>
                    {tweet.retweet_count > 0 && <span>🔁 {formatCount(tweet.retweet_count)}</span>}
                  </div>
                </div>

                {/* 第 2 行：推文单行精炼标题/第一行文字 (§1 单行溢出省略，杜绝冗余次级摘要) */}
                <div className="feed-item-title-row">
                  {isArticle ? (
                    <span
                      className="feed-tag"
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: 'var(--accent, #10b981)',
                        fontWeight: 600,
                      }}
                    >
                      📰 专栏文章
                    </span>
                  ) : isLong ? (
                    <span
                      className="feed-tag"
                      style={{
                        background: 'rgba(14, 165, 233, 0.12)',
                        color: '#0284c7',
                        fontWeight: 600,
                      }}
                    >
                      📝 长推文
                    </span>
                  ) : null}
                  {isTweetVideo(tweet) ? (
                    <span className="feed-tag" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', fontWeight: 600 }}>
                      🎬 视频
                    </span>
                  ) : tweet.media_urls && tweet.media_urls.length > 0 ? (
                    <span className="feed-tag">📷 图文</span>
                  ) : null}
                  {tweet.is_retweet && (
                    <span className="feed-tag">🔁 转推</span>
                  )}
                  <span className="feed-item-title" title={tweet.text}>
                    {displayTitle}
                  </span>
                </div>
              </div>
            );
          })}

          {/* 空数据引导提示 (§2.1) */}
          {filteredTweets.length === 0 && !isLoading && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📭</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                {dataSource === 'user' && (userHandle.trim() ? `本地数据库暂无 @${userHandle.trim().replace(/^@/, '')} 的推文` : '请输入博主用户名查看其推文')}
                {dataSource === 'search' && (searchQuery.trim() ? `本地数据库暂无与「${searchQuery.trim()}」相关的推文` : '本地数据库暂无推文')}
                {dataSource === 'following' && '本地暂无关注流推文'}
                {dataSource === 'lists' && '本地暂无该列表推文'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginBottom: '14px', lineHeight: '1.5' }}>
                {dataSource === 'user' && (userHandle.trim() ? '点击右上角「抓取推文」，一键从 X 实时抓取该博主主页最新内容落库' : '在上方输入框中输入博主用户名（如 @username），可检索本地或抓取线上最新推文')}
                {dataSource === 'search' && (searchQuery.trim() ? '点击右上角「搜索抓取」，从 X 官方全网检索最新推文并入库' : '在上方输入关键词检索本地推文，或输入后点击「搜索抓取」从 X 官方全网获取')}
                {dataSource === 'following' && '点击右上角「抓取最新」，一键拉取关注流最新推文'}
                {dataSource === 'lists' && '点击右上角「抓取最新」，从指定列表拉取最新推文'}
              </div>
              {(dataSource === 'following' || dataSource === 'lists' || (dataSource === 'search' && searchQuery.trim()) || (dataSource === 'user' && userHandle.trim())) && (
                <button
                  className="cta-button"
                  style={{ fontSize: '12px', padding: '6px 14px', margin: '0 auto' }}
                  onClick={() => onCrawl(dataSource)}
                >
                  <span>立即从 X 抓取 ⚡</span>
                </button>
              )}
            </div>
          )}

          {/* 触底加载更多状态卡片 */}
          <div id="feed-more-box" style={{ padding: '14px', textAlign: 'center', borderTop: '1px dashed var(--line)', background: 'var(--paper-sunken)', margin: '12px 10px 16px 10px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginBottom: totalDbCount > 0 ? '8px' : '0' }} id="feed-count-summary">
              {totalDbCount === 0
                ? '本地数据库暂无符合条件的推文'
                : tweets.length >= totalDbCount
                ? `✓ 已加载全部 ${totalDbCount} 条推文`
                : `已显示 ${filteredTweets.length} 条 · 本地数据库共 ${totalDbCount} 条`}
            </div>
            {totalDbCount > 0 && (
              <button
                id="btn-load-more"
                className="secondary-button"
                style={{ width: '100%', fontSize: '12px', padding: '6px 0', justifyContent: 'center' }}
                onClick={onLoadMore}
                disabled={isLoading || tweets.length >= totalDbCount}
              >
                <span>
                  {isLoading
                    ? '⏳ 正在加载...'
                    : tweets.length >= totalDbCount
                    ? '✓ 已是全部推文'
                    : '⬇️ 加载更早的 50 条历史推文'}
                </span>
              </button>
            )}
          </div>
        </div>
  </div>
);
