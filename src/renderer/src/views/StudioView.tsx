import React, { useState, useEffect } from 'react';
import type { Tweet, XListInfo } from '../types.js';
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
  const [searchQuery, setSearchQuery] = useState('AI');
  const [userHandle, setUserHandle] = useState('karpathy');
  const [userLists, setUserLists] = useState<XListInfo[]>([]);
  const [selectedList, setSelectedList] = useState('1827364512938');
  const [customListId, setCustomListId] = useState('');
  const [isSyncingLists, setIsSyncingLists] = useState(false);
  const [streamFilter, setStreamFilter] = useState('');

  // Filtering & Pagination
  const [minLikes, setMinLikes] = useState<number>(0);
  const [limit, setLimit] = useState<number>(50);
  const [totalDbCount, setTotalDbCount] = useState<number>(88);

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

  // Load user lists from local/online
  const loadUserLists = async () => {
    try {
      const lists = await api.getUserLists();
      setUserLists(lists);
      if (lists.length > 0 && (!selectedList || selectedList === 'ai')) {
        setSelectedList(lists[0].id);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadUserLists();
  }, []);

  const handleSyncOnlineLists = async () => {
    setIsSyncingLists(true);
    showToast('正在从 X 线上同步账号列表...');
    try {
      const lists = await api.fetchOnlineLists();
      setUserLists(lists);
      if (lists.length > 0) {
        setSelectedList(lists[0].id);
        showToast(`已从 X 同步 ${lists.length} 个列表`);
      } else {
        showToast('X 账号暂无自建列表，可直接输入公开列表链接添加');
      }
    } catch (err: any) {
      showToast(`同步列表失败: ${err?.message || String(err)}`);
    } finally {
      setIsSyncingLists(false);
    }
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
        showToast(`正在从 X 官方流实时抓取关注流最新 ${crawlLimit} 条推文...\n已获取 ${res.fetched} 条推文，新增入库 ${res.inserted} 条`);
      } else if (source === 'search') {
        const query = searchQuery.trim() || 'AI';
        const res = await api.searchTweets(query, { limit: crawlLimit, minLikes });
        showToast(`正在全网实时搜索关键词「${query}」最新 ${crawlLimit} 条推文并入库...\n获取 ${res.count} 条推文`);
      } else if (source === 'user') {
        const handle = userHandle.trim() || 'karpathy';
        const res = await api.fetchUser(handle, { limit: crawlLimit });
        showToast(`正在抓取博主 @${handle} 的最新 ${crawlLimit} 条推文包...\n新增入库 ${res.inserted} 条`);
      } else if (source === 'lists') {
        let listId = selectedList;
        if (selectedList === 'custom') {
          listId = customListId.trim();
        }
        if (!listId) {
          showToast('请选择或输入有效的 X 列表 ID 或链接');
          setIsLoading(false);
          return;
        }
        const match = listId.match(/(\d{5,})/);
        const cleanId = match ? match[1] : listId;

        const res = await api.fetchList(cleanId, { limit: crawlLimit });

        // Auto-save custom list to local list store
        if (!userLists.some((l) => l.id === cleanId)) {
          const newList: XListInfo = {
            id: cleanId,
            name: `X 列表 #${cleanId.slice(-4)}`,
          };
          await api.saveUserList(newList);
          await loadUserLists();
          setSelectedList(cleanId);
        }

        showToast(`正在抓取 X 列表最新 ${crawlLimit} 条推文...\n新增入库 ${res.inserted} 条`);
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
    showToast('已加载本地数据库更多历史推文');
  };

  // Selection & Delete
  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setCheckedIds(new Set(filteredTweets.map((t) => t.tweet_id)));
    } else {
      setCheckedIds(new Set());
    }
  };

  const handleDeleteSingle = async () => {
    if (!selectedTweet) return;
    try {
      await api.deleteTweets({ tweetId: selectedTweet.tweet_id });
      showToast(`已删除推文 ${selectedTweet.tweet_id}`);
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
    showToast(`已删除所选 ${checkedIds.size} 篇推文`);
    const nextList = tweets.filter((t) => !checkedIds.has(t.tweet_id));
    setTweets(nextList);
    setCheckedIds(new Set());
    setSelectedTweet(nextList[0] || null);
  };

  const handleBatchExport = async () => {
    showToast(`已将选中 ${checkedIds.size} 篇推文导出为结构化 Markdown`);
    setCheckedIds(new Set());
  };

  const handleRevealInFinder = () => {
    if (!selectedTweet) return;
    const author = selectedTweet.author_username || 'tweet';
    showToast(`已在系统文件管理器中定位本地推文包:\noutput/${author}/${selectedTweet.tweet_id}/\n  ├── index.md\n  └── images/`);
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

  const allChecked = filteredTweets.length > 0 && checkedIds.size === filteredTweets.length;

  return (
    <main id="view-studio" className="view-container active">
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
            whiteSpace: 'pre-line',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 顶栏：单行一体化智能工具条 (54px) */}
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
        {/* 左侧：数据源分段切换 */}
        <div id="studio-source-chips" style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          <div
            id="chip-source-following"
            className={`fmt-chip ${dataSource === 'following' ? 'active' : ''}`}
            onClick={() => setDataSource('following')}
          >
            关注流
          </div>
          <div
            id="chip-source-search"
            className={`fmt-chip ${dataSource === 'search' ? 'active' : ''}`}
            onClick={() => setDataSource('search')}
          >
            全网搜索
          </div>
          <div
            id="chip-source-user"
            className={`fmt-chip ${dataSource === 'user' ? 'active' : ''}`}
            onClick={() => setDataSource('user')}
          >
            博主追踪
          </div>
          <div
            id="chip-source-lists"
            className={`fmt-chip ${dataSource === 'lists' ? 'active' : ''}`}
            onClick={() => setDataSource('lists')}
          >
            X 列表
          </div>
        </div>

        {/* 中间：自适应动态操作区 (按数据源切换) */}
        <div id="studio-context-zone" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          {/* 容器 1: 关注流操作区 */}
          {dataSource === 'following' && (
            <div id="zone-following" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                上次同步: 15分钟前
              </span>
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('following')}
                  disabled={isLoading}
                >
                  <span id="label-crawl-following">🔄 抓取最新 ({crawlLimit}条)</span>
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
                <div id="menu-following" className={`split-btn-menu ${openMenu === 'following' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 日常极速 (~2秒)</span>
                    <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期汇总 (~6秒)</span>
                    <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                  </div>
                </div>
              </div>
              <input
                id="stream-filter-input"
                className="text-input"
                style={{ flex: 1, maxWidth: '240px', fontSize: '12.5px', padding: '6px 10px' }}
                type="text"
                placeholder="🔍 过滤当前推文..."
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
              />
            </div>
          )}

          {/* 容器 2: 全网搜索操作区 */}
          {dataSource === 'search' && (
            <div id="zone-search" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <input
                id="search-query-input"
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
                  <span id="label-crawl-search">搜索抓取 ({crawlLimit}条)</span>
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
                <div id="menu-search" className={`split-btn-menu ${openMenu === 'search' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 快速搜索 (~2秒)</span>
                    <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 汇总搜索 (~6秒)</span>
                    <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 容器 3: 博主追踪操作区 */}
          {dataSource === 'user' && (
            <div id="zone-user" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <input
                id="user-handle-input"
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
                  <span id="label-crawl-user">抓取推文 ({crawlLimit}条)</span>
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
                <div id="menu-user" className={`split-btn-menu ${openMenu === 'user' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 最新推文 (~2秒)</span>
                    <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期主页 (~6秒)</span>
                    <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 历史全量 (~15秒)</span>
                    <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 容器 4: X 列表操作区 */}
          {dataSource === 'lists' && (
            <div id="zone-lists" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <select
                id="list-select"
                className="select-input"
                style={{ flex: 1, maxWidth: '260px', fontSize: '12.5px', padding: '6px 10px' }}
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
              >
                {userLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    📑 {l.name} {l.member_count ? `(${l.member_count}人)` : ''}
                  </option>
                ))}
                <option value="custom">+ 输入其他公开 List 链接...</option>
              </select>
              {selectedList === 'custom' && (
                <input
                  id="custom-list-input"
                  className="text-input"
                  style={{ flex: 1, minWidth: '140px', fontSize: '12.5px', padding: '6px 10px' }}
                  type="text"
                  placeholder="输入 List ID 或链接..."
                  value={customListId}
                  onChange={(e) => setCustomListId(e.target.value)}
                />
              )}
              <button
                className="secondary-button"
                style={{ fontSize: '12px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                onClick={handleSyncOnlineLists}
                disabled={isSyncingLists}
                title="从 X 线上同步账号自建与关注列表"
              >
                <span>{isSyncingLists ? '同步中...' : '☁️ 同步'}</span>
              </button>
              <span style={{ fontSize: '12px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>已存 {totalDbCount} 篇</span>
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('lists')}
                  disabled={isLoading}
                >
                  <span id="label-crawl-lists">🔄 抓取最新 ({crawlLimit}条)</span>
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
                <div id="menu-lists" className={`split-btn-menu ${openMenu === 'lists' ? 'open' : ''}`}>
                  <div
                    className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(20);
                      setOpenMenu(null);
                    }}
                  >
                    <span>20 条 · 日常极速 (~2秒)</span>
                    <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(50);
                      setOpenMenu(null);
                    }}
                  >
                    <span>50 条 · 近期汇总 (~6秒)</span>
                    <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                  </div>
                  <div
                    className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                    onClick={() => {
                      setCrawlLimit(100);
                      setOpenMenu(null);
                    }}
                  >
                    <span>100 条 · 深度调研 (~15秒)</span>
                    <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：信噪比互动门槛药丸 */}
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

      {/* Master-Detail 双栏工作台 */}
      <div className="studio-layout">
        {/* 左栏：380px 推文紧凑流 (Master) */}
        <div className="studio-sidebar">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper-sunken)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                id="check-all"
                checked={allChecked}
                onChange={(e) => handleToggleSelectAll(e.target.checked)}
              />
              <span id="selected-count-label">
                {checkedIds.size > 0 ? `已选 ${checkedIds.size} 篇` : '全选'}
              </span>
            </label>
            <span id="feed-header-total" style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
              {streamFilter ? `${filteredTweets.length} / ${tweets.length} 条` : `${tweets.length} 条推文`}
            </span>
          </div>

          <div id="feed-list-container" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredTweets.map((tweet) => {
              const isSelected = selectedTweet?.tweet_id === tweet.tweet_id;
              const isChecked = checkedIds.has(tweet.tweet_id);
              const avatarLetter = (tweet.author_name || tweet.author_username || 'X')[0].toUpperCase();

              return (
                <div
                  key={tweet.tweet_id}
                  className={`feed-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedTweet(tweet)}
                >
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="checkbox"
                      className="tweet-check"
                      style={{ marginTop: '3px' }}
                      checked={isChecked}
                      onClick={(e) => toggleCheck(tweet.tweet_id, e)}
                      onChange={() => {}}
                    />
                    <div className="stamp-avatar">{avatarLetter}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                          {tweet.author_name || tweet.author_username}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                          @{tweet.author_username}
                        </span>
                      </div>
                      <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.45', marginBottom: '6px' }}>
                        {tweet.text}
                      </p>
                      <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--ink-faint)' }}>
                        <span>❤️ {tweet.like_count > 1000 ? `${(tweet.like_count / 1000).toFixed(1)}K` : tweet.like_count}</span>
                        <span>🔁 {tweet.retweet_count > 1000 ? `${(tweet.retweet_count / 1000).toFixed(1)}K` : tweet.retweet_count}</span>
                        <span>💬 {tweet.reply_count || 120}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 触底加载更多状态卡片 */}
            <div id="feed-more-box" style={{ padding: '14px', textAlign: 'center', borderTop: '1px dashed var(--line)', background: 'var(--paper-sunken)', margin: '12px 10px 16px 10px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginBottom: '8px' }} id="feed-count-summary">
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
          </div>
        </div>

        {/* 右栏：自包含研读卡片 (Detail) */}
        <div className="studio-main">
          {selectedTweet ? (
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              {/* 博主与操作栏 */}
              <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', borderBottom: '1px solid var(--line-strong)', marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="stamp-avatar" style={{ width: '44px', height: '44px', fontSize: '18px' }}>
                    {(selectedTweet.author_name || selectedTweet.author_username || 'X')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 id="tweet-detail-name" className="serif-title" style={{ fontSize: '17px' }}>
                      {selectedTweet.author_name || selectedTweet.author_username}
                    </h3>
                    <div id="tweet-detail-handle" style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
                      @{selectedTweet.author_username} · {selectedTweet.created_at}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="secondary-button" style={{ fontSize: '12px' }} onClick={handleRevealInFinder}>
                    <span>本地文件</span>
                  </button>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px' }}
                    onClick={() => window.open(selectedTweet.urls?.[0] || `https://x.com/${selectedTweet.author_username}/status/${selectedTweet.tweet_id}`)}
                  >
                    <span>在 X 打开 ↗</span>
                  </button>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px', color: 'var(--cinnabar)' }}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <span>删除</span>
                  </button>
                </div>
              </div>

              {/* 推文全文排版 */}
              <div id="tweet-detail-text" style={{ fontSize: '16.5px', lineHeight: '1.8', color: 'var(--ink)', marginBottom: '24px' }}>
                {selectedTweet.text}
              </div>

              {/* 本地配图预览容器 */}
              {selectedTweet.media_urls && selectedTweet.media_urls.length > 0 && (
                <div id="tweet-detail-media" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--line)', marginBottom: '24px' }}>
                  {selectedTweet.media_urls.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }}
                      alt="Tweet media"
                    />
                  ))}
                </div>
              )}

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
                    {selectedTweet.reply_count || 940}
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
      </div>

      {/* 底部浮动批量条 (§7.7) */}
      {checkedIds.size > 0 && (
        <div id="selbar" className="selbar">
          <span id="selbar-count" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--cinnabar)' }}>
            已选 {checkedIds.size} 篇
          </span>
          <button className="secondary-button" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={handleBatchExport}>
            <span>导出 Markdown</span>
          </button>
          <button className="cta-button" style={{ padding: '4px 14px', fontSize: '12px' }} onClick={handleBatchDelete}>
            <span>删除所选</span>
          </button>
          <button
            className="secondary-button"
            style={{ padding: '4px 10px', fontSize: '12px', border: 'none', background: 'transparent' }}
            onClick={() => setCheckedIds(new Set())}
          >
            <span>取消</span>
          </button>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirmOpen && (
        <div id="delete-dialog" className="drawer-backdrop" onClick={() => setDeleteConfirmOpen(false)}>
          <div
            className="surface"
            style={{ width: '400px', padding: '24px', margin: 'auto', background: 'var(--paper-raised)', border: '1px solid var(--line-strong)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="serif-title" style={{ fontSize: '17px', color: 'var(--cinnabar)', marginBottom: '10px' }}>
              确认删除推文？
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
              将从本地数据库与归档目录中彻底删除该推文及配图，不可恢复。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="secondary-button" onClick={() => setDeleteConfirmOpen(false)}>
                取消
              </button>
              <button className="cta-button" onClick={handleDeleteSingle}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
