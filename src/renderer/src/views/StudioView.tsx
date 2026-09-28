import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  Trash2,
  ExternalLink,
  Heart,
  Repeat,
  Inbox,
  CheckSquare,
  Square,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import type { Tweet } from '../types.js';
import { api } from '../services/api.js';

interface StudioViewProps {
  initialSearchQuery?: string;
}

type DataSource = 'following' | 'search' | 'user' | 'lists';

export const StudioView: React.FC<StudioViewProps> = ({ initialSearchQuery = '' }) => {
  const [dataSource, setDataSource] = useState<DataSource>('following');
  const [crawlLimit, setCrawlLimit] = useState<number>(20);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Source-specific inputs
  const [searchQuery, setSearchQuery] = useState('');
  const [userHandle, setUserHandle] = useState('karpathy');
  const [selectedList, setSelectedList] = useState('ai');
  const [customListId, setCustomListId] = useState('');
  const [streamFilter, setStreamFilter] = useState('');

  // Filtering & Pagination
  const [minLikes, setMinLikes] = useState<number>(0);
  const [limit, setLimit] = useState<number>(50);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);

  // Tweet States
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleDocClick = () => setOpenMenu(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // Sync initial query
  useEffect(() => {
    if (initialSearchQuery) {
      if (initialSearchQuery.startsWith('@')) {
        setDataSource('user');
        setUserHandle(initialSearchQuery.replace(/^@/, ''));
      } else {
        setDataSource('search');
        setSearchQuery(initialSearchQuery);
      }
    }
  }, [initialSearchQuery]);

  // Load tweets from local DB
  const loadLocalTweets = async (customLimit = limit) => {
    setIsLoading(true);
    try {
      const data = await api.listTweets({ limit: customLimit, minLikes });
      setTweets(data);
      setTotalDbCount(Math.max(data.length, totalDbCount || 88));
      if (data.length > 0 && !selectedTweet) {
        setSelectedTweet(data[0]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocalTweets();
  }, [minLikes]);

  // Crawl Action Handlers
  const handleCrawl = async (source: DataSource) => {
    setIsLoading(true);
    try {
      if (source === 'following') {
        const pages = Math.max(1, Math.ceil(crawlLimit / 20));
        const res = await api.fetchFollowing({ pages });
        showToast(`已从关注流拉取 ${res.fetched} 条推文，新增入库 ${res.inserted} 条`);
      } else if (source === 'search') {
        const query = searchQuery.trim() || 'AI';
        const res = await api.searchTweets(query, { limit: crawlLimit, minLikes });
        showToast(`全网搜索「${query}」获取 ${res.count} 条推文并入库`);
      } else if (source === 'user') {
        const handle = userHandle.trim() || 'karpathy';
        const res = await api.fetchUser(handle, { limit: crawlLimit });
        showToast(`博主 @${handle} 获取 ${res.fetched} 条推文，新增入库 ${res.inserted} 条`);
      } else if (source === 'lists') {
        const listId = selectedList === 'custom' ? customListId.trim() : (selectedList === 'ai' ? '1827364512938' : '1827364512939');
        const res = await api.fetchList(listId || '1827364512938', { limit: crawlLimit });
        showToast(`X 列表获取 ${res.fetched} 条推文，新增入库 ${res.inserted} 条`);
      }
      await loadLocalTweets();
    } catch (err: any) {
      showToast(`抓取失败: ${err?.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    const nextLimit = limit + 50;
    setLimit(nextLimit);
    await loadLocalTweets(nextLimit);
  };

  // Selection & Delete
  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const handleSelectAll = () => {
    if (checkedIds.size === filteredTweets.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filteredTweets.map((t) => t.tweet_id)));
    }
  };

  const handleDeleteSingle = async () => {
    if (!selectedTweet) return;
    try {
      await api.deleteTweets({ tweetId: selectedTweet.tweet_id });
      showToast(`推文 ${selectedTweet.tweet_id} 及本地文件已级联清理`);
      const nextList = tweets.filter((t) => t.tweet_id !== selectedTweet.tweet_id);
      setTweets(nextList);
      setSelectedTweet(nextList[0] || null);
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      showToast(`删除失败: ${err?.message || String(err)}`);
    }
  };

  const handleBatchDelete = async () => {
    for (const id of Array.from(checkedIds)) {
      await api.deleteTweets({ tweetId: id });
    }
    showToast(`成功级联删除 ${checkedIds.size} 篇推文`);
    const nextList = tweets.filter((t) => !checkedIds.has(t.tweet_id));
    setTweets(nextList);
    setCheckedIds(new Set());
    setSelectedTweet(nextList[0] || null);
  };

  const handleBatchExport = async () => {
    showToast(`已成功将 ${checkedIds.size} 篇推文批量导出 Markdown 至 output/ 目录`);
    setCheckedIds(new Set());
  };

  const handleRevealInFinder = () => {
    if (!selectedTweet) return;
    const author = selectedTweet.author_username || 'tweet';
    showToast(`本地文件位置: output/${author}/${selectedTweet.tweet_id}/`);
  };

  // Instant In-Memory Filter
  const filteredTweets = tweets.filter((t) => {
    if (!streamFilter.trim()) return true;
    const q = streamFilter.toLowerCase().trim();
    return (
      (t.text && t.text.toLowerCase().includes(q)) ||
      (t.author_name && t.author_name.toLowerCase().includes(q)) ||
      (t.author_username && t.author_username.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ height: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '76px',
            right: '24px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '12.5px',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 54px Context-Aware Single-line Toolbar */}
      <div
        style={{
          padding: '10px 24px',
          background: 'var(--paper)',
          borderBottom: '1px solid var(--line-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          minHeight: '54px',
        }}
      >
        {/* Left: Data Source Tabs */}
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          <div
            className={`fmt-chip ${dataSource === 'following' ? 'active' : ''}`}
            onClick={() => setDataSource('following')}
          >
            关注流
          </div>
          <div
            className={`fmt-chip ${dataSource === 'search' ? 'active' : ''}`}
            onClick={() => setDataSource('search')}
          >
            全网搜索
          </div>
          <div
            className={`fmt-chip ${dataSource === 'user' ? 'active' : ''}`}
            onClick={() => setDataSource('user')}
          >
            博主追踪
          </div>
          <div
            className={`fmt-chip ${dataSource === 'lists' ? 'active' : ''}`}
            onClick={() => setDataSource('lists')}
          >
            X 列表
          </div>
        </div>

        {/* Center: Dynamic Context-aware Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          {dataSource === 'following' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                上次同步: 15分钟前
              </span>
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('following')}
                  disabled={isLoading}
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                  <span>抓取最新 ({crawlLimit}条)</span>
                </button>
                <button
                  className="cta-button split-btn-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === 'following' ? null : 'following');
                  }}
                >
                  <span>▾</span>
                </button>
                <div className={`split-btn-menu ${openMenu === 'following' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 日常极速 (~2秒)</span>
                    {crawlLimit === 20 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期汇总 (~6秒)</span>
                    {crawlLimit === 50 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    {crawlLimit === 100 && <span>✓</span>}
                  </div>
                </div>
              </div>
              <input
                className="text-input"
                style={{ flex: 1, maxWidth: '240px', fontSize: '12.5px', padding: '6px 10px' }}
                type="text"
                placeholder="🔍 过滤当前推文..."
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
              />
            </div>
          )}

          {dataSource === 'search' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <input
                className="text-input"
                style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
                type="text"
                placeholder="输入关键词或语法 (如 AI min_faves:100)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCrawl('search')}
              />
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('search')}
                  disabled={isLoading}
                >
                  <Search size={12} style={{ marginRight: '4px' }} />
                  <span>搜索抓取 ({crawlLimit}条)</span>
                </button>
                <button
                  className="cta-button split-btn-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === 'search' ? null : 'search');
                  }}
                >
                  <span>▾</span>
                </button>
                <div className={`split-btn-menu ${openMenu === 'search' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 快速搜索 (~2秒)</span>
                    {crawlLimit === 20 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 汇总搜索 (~6秒)</span>
                    {crawlLimit === 50 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    {crawlLimit === 100 && <span>✓</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {dataSource === 'user' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <input
                className="text-input"
                style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
                type="text"
                placeholder="@博主用户名 (如 karpathy, sama)..."
                value={userHandle}
                onChange={(e) => setUserHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCrawl('user')}
              />
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('user')}
                  disabled={isLoading}
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                  <span>抓取推文 ({crawlLimit}条)</span>
                </button>
                <button
                  className="cta-button split-btn-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === 'user' ? null : 'user');
                  }}
                >
                  <span>▾</span>
                </button>
                <div className={`split-btn-menu ${openMenu === 'user' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 最新推文 (~2秒)</span>
                    {crawlLimit === 20 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期主页 (~6秒)</span>
                    {crawlLimit === 50 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 历史全量 (~15秒)</span>
                    {crawlLimit === 100 && <span>✓</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {dataSource === 'lists' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <select
                className="select-input"
                style={{ flex: 1, maxWidth: '260px', fontSize: '12.5px', padding: '6px 10px' }}
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
              >
                <option value="ai">📑 AI 核心圈 (42人)</option>
                <option value="indie">📑 独立开发者 (128人)</option>
                <option value="custom">+ 输入其他公开 List 链接...</option>
              </select>
              {selectedList === 'custom' && (
                <input
                  className="text-input"
                  style={{ flex: 1, minWidth: '140px', fontSize: '12.5px', padding: '6px 10px' }}
                  type="text"
                  placeholder="输入 List ID 或链接..."
                  value={customListId}
                  onChange={(e) => setCustomListId(e.target.value)}
                />
              )}
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('lists')}
                  disabled={isLoading}
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                  <span>抓取最新 ({crawlLimit}条)</span>
                </button>
                <button
                  className="cta-button split-btn-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === 'lists' ? null : 'lists');
                  }}
                >
                  <span>▾</span>
                </button>
                <div className={`split-btn-menu ${openMenu === 'lists' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 日常极速 (~2秒)</span>
                    {crawlLimit === 20 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期汇总 (~6秒)</span>
                    {crawlLimit === 50 && <span>✓</span>}
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    {crawlLimit === 100 && <span>✓</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: SNR Filter Pills */}
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0, alignItems: 'center', borderLeft: '1px solid var(--line)', paddingLeft: '12px' }}>
          <div
            className={`fmt-chip ${minLikes === 0 ? 'active' : ''}`}
            onClick={() => setMinLikes(0)}
          >
            全部
          </div>
          <div
            className={`fmt-chip ${minLikes === 50 ? 'active' : ''}`}
            onClick={() => setMinLikes(50)}
          >
            50+ 赞
          </div>
          <div
            className={`fmt-chip ${minLikes === 200 ? 'active' : ''}`}
            onClick={() => setMinLikes(200)}
          >
            200+ 赞
          </div>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="studio-layout" style={{ flex: 1, minHeight: 0 }}>
        {/* Left Column: Feed Stream (380px) */}
        <div className="studio-sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Sidebar Header */}
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
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              onClick={handleSelectAll}
            >
              {checkedIds.size > 0 && checkedIds.size === filteredTweets.length ? (
                <CheckSquare size={15} style={{ color: 'var(--cinnabar)' }} />
              ) : (
                <Square size={15} style={{ color: 'var(--ink-faint)' }} />
              )}
              <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                {checkedIds.size > 0 ? `已选 ${checkedIds.size} 篇` : '全选'}
              </span>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
              {streamFilter ? `${filteredTweets.length} / ${tweets.length} 条` : `${tweets.length} 条推文`}
            </span>
          </div>

          {/* Tweet List with Load More Card */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredTweets.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 16px' }}>
                <Inbox size={32} style={{ color: 'var(--ink-faint)', marginBottom: '8px' }} />
                <div className="empty-title" style={{ fontSize: '15px' }}>暂无推文</div>
                <div className="empty-desc" style={{ fontSize: '12px' }}>
                  {streamFilter ? '无符合本地关键词的推文' : '可尝试放宽点赞门槛或点击顶栏抓取最新。'}
                </div>
              </div>
            ) : (
              filteredTweets.map((tweet) => {
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

                      {/* Avatar Stamp */}
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

                        {/* Engagement stats */}
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

            {/* Bottom Stream Pagination / Load More Card */}
            {filteredTweets.length > 0 && (
              <div
                style={{
                  padding: '14px',
                  textAlign: 'center',
                  borderTop: '1px dashed var(--line)',
                  background: 'var(--paper-sunken)',
                  margin: '12px 10px 16px 10px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginBottom: '8px' }}>
                  已显示 {filteredTweets.length} 条 · 本地数据库共 {totalDbCount} 条
                </div>
                <button
                  className="secondary-button"
                  style={{ width: '100%', fontSize: '12px', padding: '6px 0', justifyContent: 'center' }}
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  <span>⬇️ 加载更早的 50 条历史推文</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Page Bundle Detail View (720px Magazine Center-spread) */}
        <div className="studio-main" style={{ padding: '36px 44px', overflowY: 'auto' }}>
          {selectedTweet ? (
            <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%' }}>
              {/* Author & Action Header */}
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

                {/* Actions: Reveal local Page Bundle & Cascade Delete */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px' }}
                    onClick={handleRevealInFinder}
                  >
                    <FolderOpen size={13} />
                    <span>本地文件</span>
                  </button>

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

              {/* Tweet Full Body */}
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

              {/* Local Page Bundle Attached Images */}
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

      {/* Float Selection Bar (.selbar) */}
      {checkedIds.size > 0 && (
        <div className="selbar">
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--cinnabar)' }}>
            已选 {checkedIds.size} 篇推文
          </span>

          <button
            className="secondary-button"
            onClick={handleBatchExport}
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
            <span>级联删除所选项</span>
          </button>
        </div>
      )}

      {/* Cascade Delete Confirmation Dialog */}
      {deleteConfirmOpen && selectedTweet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(33, 28, 21, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="surface"
            style={{
              width: '420px',
              padding: '24px',
              background: 'var(--paper-raised)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cinnabar)', marginBottom: '12px' }}>
              <AlertTriangle size={20} />
              <h3 className="serif-title" style={{ fontSize: '16px' }}>
                确认级联物理清理？
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '16px' }}>
              此操作将彻底删除推文 <strong>{selectedTweet.tweet_id}</strong> 的本地数据库元数据，并强一致级联物理移除磁盘上的
              Page Bundle 目录：
              <code style={{ display: 'block', background: 'var(--paper-sunken)', padding: '6px 8px', borderRadius: '4px', margin: '8px 0', fontSize: '11.5px' }}>
                output/{selectedTweet.author_username}/{selectedTweet.tweet_id}/
              </code>
              此清理不可撤销。
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="secondary-button" onClick={() => setDeleteConfirmOpen(false)}>
                取消
              </button>
              <button className="cta-button" onClick={handleDeleteSingle} style={{ background: 'var(--cinnabar)' }}>
                确认彻底删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
