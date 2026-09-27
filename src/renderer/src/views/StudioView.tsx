import React, { useState, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Download,
  Trash2,
  ExternalLink,
  Heart,
  Repeat,
  Inbox,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import type { Tweet } from '../types.js';
import { api } from '../services/api.js';

interface StudioViewProps {
  initialSearchQuery?: string;
}

export const StudioView: React.FC<StudioViewProps> = ({ initialSearchQuery = '' }) => {
  const [query, setQuery] = useState(initialSearchQuery);
  const [searchType, setSearchType] = useState<'live' | 'top'>('live');
  const [minLikes, setMinLikes] = useState(0);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadTweets = async () => {
    setIsLoading(true);
    try {
      if (query.trim()) {
        const res = await api.searchTweets(query.trim(), { searchType, minLikes });
        setTweets(res.tweets);
        if (res.tweets.length > 0) setSelectedTweet(res.tweets[0]);
      } else {
        const res = await api.listTweets({ limit: 50, minLikes });
        setTweets(res);
        if (res.length > 0) setSelectedTweet(res[0]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialSearchQuery) {
      setQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    loadTweets();
  }, [minLikes, searchType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTweets();
  };

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const handleSelectAll = () => {
    if (checkedIds.size === tweets.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(tweets.map((t) => t.tweet_id)));
    }
  };

  const handleDeleteSingle = async () => {
    if (!selectedTweet) return;
    await api.deleteTweets({ tweetId: selectedTweet.tweet_id });
    showToast(`推文 ${selectedTweet.tweet_id} 及本地文件已级联清理`);
    setTweets(tweets.filter((t) => t.tweet_id !== selectedTweet.tweet_id));
    setSelectedTweet(null);
    setDeleteConfirmOpen(false);
  };

  const handleBatchDelete = async () => {
    for (const id of Array.from(checkedIds)) {
      await api.deleteTweets({ tweetId: id });
    }
    showToast(`成功级联删除 ${checkedIds.size} 篇推文`);
    setTweets(tweets.filter((t) => !checkedIds.has(t.tweet_id)));
    setCheckedIds(new Set());
    setSelectedTweet(null);
  };

  return (
    <div style={{ height: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Search & Filter Bar */}
      <div
        style={{
          padding: '16px 28px',
          background: 'var(--paper)',
          borderBottom: '1px solid var(--line-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flex: 1, maxWidth: '520px', gap: '8px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
            />
            <input
              className="text-input"
              style={{ paddingLeft: '36px' }}
              type="text"
              placeholder="搜索全网关键词、博主或语法 (如: 'AI min_faves:100')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="cta-button" style={{ padding: '8px 18px' }} disabled={isLoading}>
            <span>搜索</span>
          </button>
        </form>

        {/* Signal-to-Noise Ratio (SNR) Filter Pills (§7.4) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink-soft)' }}>
            <SlidersHorizontal size={14} />
            <span>信噪比门槛:</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={`fmt-chip ${minLikes === 0 ? 'active' : ''}`}
              onClick={() => setMinLikes(0)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              全部推文
            </button>
            <button
              className={`fmt-chip ${minLikes === 50 ? 'active' : ''}`}
              onClick={() => setMinLikes(50)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              ⭐ 50+ 赞 (高信噪比)
            </button>
            <button
              className={`fmt-chip ${minLikes === 200 ? 'active' : ''}`}
              onClick={() => setMinLikes(200)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              👑 200+ 赞 (爆款核心)
            </button>
          </div>
        </div>
      </div>

      {/* Main Studio Area (Master-Detail) */}
      <div className="studio-layout" style={{ flex: 1 }}>
        {/* Left Column: Feed List (380px) */}
        <div className="studio-sidebar">
          {/* Column Subheader */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--paper-sunken)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={handleSelectAll}>
              {checkedIds.size > 0 && checkedIds.size === tweets.length ? (
                <CheckSquare size={15} style={{ color: 'var(--cinnabar)' }} />
              ) : (
                <Square size={15} style={{ color: 'var(--ink-faint)' }} />
              )}
              <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                {checkedIds.size > 0 ? `已选 ${checkedIds.size} 篇` : '全选'}
              </span>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
              库内 {tweets.length} 条推文
            </span>
          </div>

          {/* Tweet List Container */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tweets.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 16px' }}>
                <Inbox size={32} style={{ color: 'var(--ink-faint)', marginBottom: '8px' }} />
                <div className="empty-title" style={{ fontSize: '15px' }}>暂无推文</div>
                <div className="empty-desc" style={{ fontSize: '12px' }}>可尝试放宽点赞门槛或修改搜索词。</div>
              </div>
            ) : (
              tweets.map((tweet) => {
                const isSelected = selectedTweet?.tweet_id === tweet.tweet_id;
                const isChecked = checkedIds.has(tweet.tweet_id);
                return (
                  <div
                    key={tweet.tweet_id}
                    className={`feed-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedTweet(tweet)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div
                        onClick={(e) => toggleCheck(tweet.tweet_id, e)}
                        style={{ cursor: 'pointer', marginTop: '2px', color: isChecked ? 'var(--cinnabar)' : 'var(--ink-faint)' }}
                      >
                        {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                      </div>

                      {/* Author Avatar Stamp */}
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, var(--cinnabar), var(--cinnabar-soft))',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-serif)',
                          fontWeight: 700,
                          fontSize: '13px',
                          flexShrink: 0,
                        }}
                      >
                        {tweet.author_name ? tweet.author_name[0].toUpperCase() : 'X'}
                      </div>

                      {/* Content Preview */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tweet.author_name || tweet.author_username}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                            @{tweet.author_username}
                          </span>
                        </div>

                        <p
                          style={{
                            fontSize: '12.5px',
                            color: 'var(--ink-soft)',
                            lineHeight: '1.45',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            marginBottom: '6px',
                          }}
                        >
                          {tweet.text}
                        </p>

                        {/* Engagement mini badges */}
                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink-faint)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Heart size={11} style={{ color: tweet.like_count > 500 ? 'var(--cinnabar)' : undefined }} />
                            <span>{tweet.like_count}</span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Repeat size={11} />
                            <span>{tweet.retweet_count}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Page Bundle Detail View */}
        <div className="studio-main" style={{ padding: '36px 44px' }}>
          {selectedTweet ? (
            <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%' }}>
              {/* Author & Action Topbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '20px',
                  borderBottom: '1px solid var(--line-strong)',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, var(--cinnabar), var(--cinnabar-soft))',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-serif)',
                      fontWeight: 700,
                      fontSize: '18px',
                    }}
                  >
                    {selectedTweet.author_name ? selectedTweet.author_name[0].toUpperCase() : 'X'}
                  </div>

                  <div>
                    <h3 className="serif-title" style={{ fontSize: '16px' }}>
                      {selectedTweet.author_name || selectedTweet.author_username}
                    </h3>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
                      @{selectedTweet.author_username} • {selectedTweet.created_at}
                    </div>
                  </div>
                </div>

                {/* Single tweet actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={selectedTweet.urls?.[0] || `https://x.com/${selectedTweet.author_username}/status/${selectedTweet.tweet_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button"
                    style={{ textDecoration: 'none', fontSize: '12px' }}
                  >
                    <ExternalLink size={13} />
                    <span>在 X 打开</span>
                  </a>

                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px', color: 'var(--cinnabar)' }}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={13} />
                    <span>级联删除</span>
                  </button>
                </div>
              </div>

              {/* Tweet Body */}
              <div
                style={{
                  fontSize: '16.5px',
                  lineHeight: '1.8',
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                  marginBottom: '24px',
                }}
              >
                {selectedTweet.text}
              </div>

              {/* Media images if any */}
              {selectedTweet.media_urls && selectedTweet.media_urls.length > 0 && (
                <div style={{ marginBottom: '24px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--line)' }}>
                  {selectedTweet.media_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt="Tweet attachment"
                      style={{ width: '100%', maxHeight: '420px', objectFit: 'cover', display: 'block' }}
                    />
                  ))}
                </div>
              )}

              {/* Engagement Stats Box */}
              <div
                className="surface"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-around',
                  background: 'var(--paper-sunken)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>点赞</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cinnabar)' }}>
                    {selectedTweet.like_count}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>转推</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                    {selectedTweet.retweet_count}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>回复</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink-soft)' }}>
                    {selectedTweet.reply_count || 0}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ margin: 'auto' }}>
              <div className="empty-stamp">📦</div>
              <div className="empty-title">从左侧选择一篇推文进行研读</div>
              <div className="empty-desc">支持单篇导出 Page Bundle 独立包，或级联彻底删除已落盘推文与媒体资源。</div>
            </div>
          )}
        </div>
      </div>

      {/* Float Selection Bar (§7.7) */}
      {checkedIds.size > 0 && (
        <div className="selbar">
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--cinnabar)' }}>
            已选 {checkedIds.size} 篇推文
          </span>

          <button
            className="secondary-button"
            onClick={() => showToast(`已将 ${checkedIds.size} 篇推文导出至 output/`)}
            style={{ padding: '5px 12px', fontSize: '12px' }}
          >
            <Download size={13} />
            <span>批量导出 Markdown</span>
          </button>

          <button
            className="cta-button"
            onClick={handleBatchDelete}
            style={{ padding: '5px 14px', fontSize: '12px' }}
          >
            <Trash2 size={13} />
            <span>级联清理</span>
          </button>

          <button
            className="text-button"
            onClick={() => setCheckedIds(new Set())}
            style={{ fontSize: '12px' }}
          >
            取消
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="drawer-backdrop" onClick={() => setDeleteConfirmOpen(false)}>
          <div
            className="surface"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              padding: '24px',
              margin: 'auto',
              background: 'var(--paper-raised)',
              border: '1px solid var(--line-strong)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--cinnabar)' }}>
              <AlertTriangle size={20} />
              <h3 className="serif-title" style={{ fontSize: '17px' }}>确认永久级联删除？</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
              此操作将同步从 SQLite 数据库移除推文记录，并物理删除本地 <code>output/{selectedTweet?.author_username}/{selectedTweet?.tweet_id}/</code> 目录及配图文件，不可逆。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="secondary-button" onClick={() => setDeleteConfirmOpen(false)}>
                取消
              </button>
              <button className="cta-button" onClick={handleDeleteSingle}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '28px',
            background: 'var(--paper-raised)',
            border: '1px solid var(--cinnabar)',
            boxShadow: 'var(--shadow-popover)',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--cinnabar)',
            zIndex: 9999,
            animation: 'rise 0.2s ease',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};
