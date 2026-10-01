import React from 'react';
import type { Tweet } from '../../types.js';
import { api } from '../../services/api.js';
import { renderFormattedTweetText } from './formatters.js';
import { classifyTweet, extractMedia, formatTweetDate } from './logic.js';
import { formatCount } from './formatters.js';
import { TweetVideoPlayer } from './TweetVideoPlayer.js';

export interface TweetDetailPaneProps {
  selectedTweet: Tweet | null;
  isDetailLoading: boolean;
  exportPath: string;
  onOpenInX: () => void;
  onRevealInFinder: () => void;
  onForceRefresh: () => void;
  onRequestDelete: () => void;
  onPreviewImage: (url: string) => void;
  onToast: (msg: string) => void;
}

/**
 * 右栏：自包含研读卡片 (Detail)。
 * 博主与操作栏、全文正文（原生 Markdown）、长图网格、
 * 免落盘视频流式播放、转推/引用推文卡片、互动指标与删除入口。
 */
export const TweetDetailPane: React.FC<TweetDetailPaneProps> = ({
  selectedTweet,
  isDetailLoading,
  exportPath,
  onOpenInX,
  onRevealInFinder,
  onForceRefresh,
  onRequestDelete,
  onPreviewImage,
  onToast,
}) => {
  const classification = selectedTweet ? classifyTweet(selectedTweet) : null;

  return (
      <div className="studio-main">
        {selectedTweet ? (
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {/* 博主与操作栏 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '16px',
                borderBottom: '1px solid var(--line-strong)',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="stamp-avatar" style={{ width: '44px', height: '44px', fontSize: '18px' }}>
                  {(selectedTweet.author_name || selectedTweet.author_username || 'X')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 id="tweet-detail-name" className="serif-title" style={{ fontSize: '17px' }}>
                      {selectedTweet.author_name || selectedTweet.author_username}
                    </h3>
                    {classification?.isArticle ? (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--accent, #10b981)',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        📰 专栏文章 (X Article)
                      </span>
                    ) : classification?.isLong ? (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#0284c7',
                          background: 'rgba(14, 165, 233, 0.12)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        📝 长推文 (Note Tweet)
                      </span>
                    ) : null}
                    {isDetailLoading && (
                      <span style={{ fontSize: '11px', color: 'var(--cinnabar)', background: 'var(--cinnabar-wash)', padding: '1px 6px', borderRadius: '4px' }}>
                        ⚡ 正在自动同步全文与高清媒体...
                      </span>
                    )}
                  </div>
                  <div id="tweet-detail-handle" style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
                    @{selectedTweet.author_username} · {formatTweetDate(selectedTweet.created_at)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="secondary-button"
                  style={{ fontSize: '12px' }}
                  onClick={onForceRefresh}
                  disabled={isDetailLoading}
                  title="从 X 线上强制拉取该推文的完整 Note Tweet / 长文与媒体"
                >
                  <span>{isDetailLoading ? '⏳ 同步中...' : '🔄 同步全文'}</span>
                </button>
                <button
                  className="secondary-button"
                  style={{ fontSize: '12px' }}
                  onClick={onRevealInFinder}
                  title="在系统访达/资源管理器中高亮定位该推文的 Markdown 归档包 (index.md & 配图)"
                >
                  <span>本地文件</span>
                </button>
                <button
                  className="secondary-button"
                  style={{ fontSize: '12px' }}
                  onClick={onOpenInX}
                  title="在系统默认浏览器中打开 X 原帖"
                >
                  <span>在 X 打开 ↗</span>
                </button>
                <button
                  className="secondary-button"
                  style={{ fontSize: '12px', color: 'var(--cinnabar)' }}
                  onClick={() => onRequestDelete()}
                >
                  <span>删除</span>
                </button>
              </div>
            </div>

            {/* 互动数据胶囊与推文指标卡 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '14px',
                padding: '6px 12px',
                background: 'var(--paper-sunken)',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                fontSize: '12.5px',
                color: 'var(--ink-soft)',
              }}
            >
              <span>❤️ 点赞: <strong style={{ color: 'var(--ink)' }}>{formatCount(selectedTweet.like_count)}</strong></span>
              <span>🔁 转发: <strong style={{ color: 'var(--ink)' }}>{formatCount(selectedTweet.retweet_count)}</strong></span>
              <span>💬 回复: <strong style={{ color: 'var(--ink)' }}>{formatCount(selectedTweet.reply_count)}</strong></span>
              {selectedTweet.view_count ? (
                <span>👁️ 浏览: <strong style={{ color: 'var(--ink)' }}>{formatCount(selectedTweet.view_count)}</strong></span>
              ) : null}
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ink-faint)' }}>
                ID: {selectedTweet.tweet_id}
              </span>
            </div>

            {/* 归档文件与路径看板 (§2.4) */}
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--paper-sunken)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
              }}
            >
              <div style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '520px' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>📁 归档包: </span>
                <code style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                  {exportPath || `articles/${selectedTweet.author_username || 'tweet'}/${selectedTweet.tweet_id}/index.md`}
                </code>
              </div>
              <button
                className="secondary-button"
                style={{ fontSize: '11px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                onClick={onRevealInFinder}
                title="在访达/资源管理器中显式定位"
              >
                <span>访达定位 ↗</span>
              </button>
            </div>

            {/* 推文全文排版 (§2.2 保持换行与段落格式并渲染富文本可点击超链接) */}
            <div
              id="tweet-detail-text"
              style={{
                fontSize: '15.5px',
                lineHeight: '1.8',
                color: 'var(--ink)',
                marginBottom: '20px',
                wordBreak: 'break-word',
              }}
            >
              {renderFormattedTweetText(
                selectedTweet.text,
                selectedTweet.urls,
                (url) => api.openExternal(url),
                (img) => onPreviewImage(img)
              )}
            </div>

            {/* 转推卡片 (Retweet Card) */}
            {selectedTweet.is_retweet && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--paper-sunken)',
                  borderLeft: '3px solid var(--cinnabar)',
                  borderRadius: '4px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>
                  🔁 转推自 @{selectedTweet.retweeted_author || '原作者'}
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)' }}>
                  {renderFormattedTweetText(
                    selectedTweet.retweeted_text || selectedTweet.text,
                    selectedTweet.urls,
                    (url) => api.openExternal(url),
                    (img) => onPreviewImage(img)
                  )}
                </div>
              </div>
            )}

            {/* 引用推文卡片 (Quote Tweet Card) */}
            {selectedTweet.is_quote && (selectedTweet.quoted_text || selectedTweet.quoted_author) && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--paper-sunken)',
                  borderLeft: '3px solid #0284c7',
                  borderRadius: '4px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0284c7', marginBottom: '4px' }}>
                  💬 引用推文 @{selectedTweet.quoted_author || '原作者'}
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)' }}>
                  {renderFormattedTweetText(
                    selectedTweet.quoted_text || '',
                    selectedTweet.urls,
                    (url) => api.openExternal(url),
                    (img) => onPreviewImage(img)
                  )}
                </div>
              </div>
            )}

            {/* 附带外部链接列表 */}
            {selectedTweet.urls && selectedTweet.urls.length > 0 && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--paper-sunken)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-faint)', marginBottom: '6px' }}>
                  🔗 附带链接 ({selectedTweet.urls.length})
                </div>
                {selectedTweet.urls.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12.5px' }}>
                    <span style={{ color: 'var(--ink-faint)' }}>•</span>
                    <a
                      href={u}
                      onClick={(e) => {
                        e.preventDefault();
                        api.openExternal(u);
                      }}
                      style={{ color: 'var(--cinnabar)', textDecoration: 'underline', wordBreak: 'break-all', cursor: 'pointer' }}
                      title="在系统默认浏览器中打开"
                    >
                      {u} ↗
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* 本地媒体（视频与配图）预览容器 */}
            {(() => {
              const { isVideo, videoUrl, posterUrl, displayImages } = extractMedia(selectedTweet);

              return (
                <>
                  {/* 现代化推特在线视频播放器 */}
                  {isVideo && videoUrl && (
                    <TweetVideoPlayer
                      videoUrl={videoUrl}
                      posterUrl={posterUrl}
                      tweetUrl={`https://x.com/${selectedTweet.author_username || 'i'}/status/${selectedTweet.tweet_id}`}
                      authorUsername={selectedTweet.author_username}
                      onToast={onToast}
                    />
                  )}

                  {/* 普通配图容器 */}
                  {displayImages.length > 0 && (
                    <div
                      id="tweet-detail-media"
                      style={{
                        marginBottom: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            displayImages.length === 1
                              ? '1fr'
                              : displayImages.length === 2
                              ? '1fr 1fr'
                              : 'repeat(2, 1fr)',
                          gap: '8px',
                          borderRadius: '10px',
                          overflow: 'hidden',
                        }}
                      >
                        {displayImages.map((img, i) => (
                          <div
                            key={i}
                            style={{
                              position: 'relative',
                              background: 'var(--paper-sunken, #0f1419)',
                              border: '1px solid var(--line)',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'zoom-in',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: displayImages.length === 1 ? '240px' : '180px',
                              maxHeight: displayImages.length === 1 ? '520px' : '260px',
                            }}
                            onClick={() => onPreviewImage(img)}
                            title="点击查看高清大图"
                          >
                            <img
                              src={img}
                              style={{
                                width: '100%',
                                height: '100%',
                                maxHeight: displayImages.length === 1 ? '520px' : '260px',
                                objectFit: displayImages.length === 1 ? 'contain' : 'cover',
                                display: 'block',
                              }}
                              alt={`Tweet media ${i + 1}`}
                              onError={(e) => {
                                // 图片加载受阻时优雅兜底提示
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const fb = target.nextElementSibling as HTMLElement;
                                if (fb) fb.style.display = 'flex';
                              }}
                            />
                            <div
                              style={{
                                display: 'none',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '16px',
                                textAlign: 'center',
                                gap: '8px',
                                width: '100%',
                                height: '100%',
                              }}
                            >
                              <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                                🖼️ 推特配图加载受阻（网络或防盗链）
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  api.openExternal(img);
                                }}
                              >
                                在浏览器中打开原图 ↗
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 配图底栏工具条 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 12px',
                          background: 'var(--paper-sunken)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: 'var(--ink-muted)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        <span>📷 包含 {displayImages.length} 张高清配图（点击可放大查看）</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => {
                              navigator.clipboard.writeText(displayImages[0]);
                              onToast('✓ 配图直链已复制至剪贴板');
                            }}
                          >
                            📋 复制原图直链
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => {
                              api.openExternal(displayImages[0]);
                            }}
                          >
                            🌐 在浏览器查看 ↗
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* 互动数据卡片 */}
            <div className="surface" style={{ padding: '16px', background: 'var(--paper-sunken)', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>点赞</div>
                <div id="tweet-stat-likes" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cinnabar)' }}>
                  {selectedTweet.like_count.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>转发</div>
                <div id="tweet-stat-rts" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                  {selectedTweet.retweet_count.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>回复</div>
                <div id="tweet-stat-replies" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink-soft)' }}>
                  {selectedTweet.reply_count || 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>浏览量</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink-soft)' }}>
                  {selectedTweet.view_count ? selectedTweet.view_count.toLocaleString() : '-'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-faint)' }}>
            请从左侧选择一篇推文进行研读
          </div>
        )}
      </div>
  );
};
