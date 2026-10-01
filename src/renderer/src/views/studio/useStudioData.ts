import { useState, useEffect, useRef } from 'react';
import type { Tweet, XListInfo, StudioJumpAction } from '../../types.js';
import { api } from '../../services/api.js';
import {
  buildQueryOptions,
  classifyTweet,
  computePages,
  extractTweetIdFromQuery,
  filterTweetsByKeyword,
  reduceStreamEvent,
  resolveListId,
  validateCrawlTarget,
  type CrawlProgress,
  type DataSource,
} from './logic.js';

export interface UseStudioDataOptions {
  initialSearchQuery?: string;
  jumpAction?: StudioJumpAction | null;
}

/**
 * 工作台的全部状态与业务编排。
 *
 * 把 29 个 useState、7 个 useEffect 与全部 handler 收敛到单一 hook 中，
 * 使 StudioView 只承担布局职责。抽出的纯函数见 logic.ts。
 */
export function useStudioData({ initialSearchQuery = '', jumpAction }: UseStudioDataOptions) {
  const initialSource: DataSource = (jumpAction?.query || initialSearchQuery)
    ? (jumpAction?.query || initialSearchQuery).startsWith('@')
      ? 'user'
      : 'search'
    : 'following';
  const [dataSource, setDataSource] = useState<DataSource>(initialSource);
  const [crawlLimit, setCrawlLimit] = useState<number>(20);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Source-specific inputs (默认均为空，不添加任何关键词/博主过滤)
  const [searchQuery, setSearchQuery] = useState(
    initialSearchQuery && !initialSearchQuery.startsWith('@') ? initialSearchQuery : ''
  );
  const [userHandle, setUserHandle] = useState(() => {
    if (initialSearchQuery && initialSearchQuery.startsWith('@')) {
      return initialSearchQuery.replace(/^@/, '');
    }
    return '';
  });
  const [userLists, setUserLists] = useState<XListInfo[]>([]);
  const [selectedList, setSelectedList] = useState('2100985900734062922');
  const [customListId, setCustomListId] = useState('');
  const [isSyncingLists, setIsSyncingLists] = useState(false);
  const [streamFilter, setStreamFilter] = useState('');

  // Filtering & Pagination
  const [minLikes, setMinLikes] = useState<number>(0);
  const [limit, setLimit] = useState<number>(50);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);

  // Tweet States
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Tweet Ref to guard against asynchronous detail race conditions (§3)
  const activeTweetIdRef = useRef<string | null>(null);

  // Live Crawl Progress State
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load user lists from local/online
  const loadUserLists = async () => {
    try {
      const lists = await api.getUserLists();
      setUserLists(lists);
      if (lists.length > 0 && (!selectedList || !lists.some((l) => l.id === selectedList))) {
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

  // Close menus on outside click and handle Escape key for modals
  useEffect(() => {
    const handleDocClick = () => setOpenMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setPreviewImage(null);
        setDeleteConfirmOpen(false);
        setBatchDeleteConfirmOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Listen to real IPC streaming progress (§2.3)
  useEffect(() => {
    const unsubscribe = api.onStreamEvent((event) => {
      if (!event) return;
      setCrawlProgress((prev) => reduceStreamEvent(prev, event, dataSource));
      if (event.stage === 'error' || event.stage === 'done') {
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [dataSource]);

  // Sync initial query on mount (if no explicit jumpAction)
  useEffect(() => {
    if (jumpAction) return;
    if (initialSearchQuery) {
      if (initialSearchQuery.startsWith('@')) {
        const handle = initialSearchQuery.replace(/^@/, '');
        setDataSource('user');
        setUserHandle(handle);
        loadLocalTweets(50, 'user', false, undefined, handle);
      } else {
        setDataSource('search');
        setSearchQuery(initialSearchQuery);
        loadLocalTweets(50, 'search', false, initialSearchQuery);
      }
    } else {
      loadLocalTweets(50, dataSource, false);
    }
  }, [initialSearchQuery]);

  // Load tweets from local DB filtered by active data source
  const loadLocalTweets = async (
    customLimit = 50,
    source = dataSource,
    isAppend = false,
    queryParam?: string,
    userParam?: string,
    listIdParam?: string
  ) => {
    setIsLoading(true);
    try {
      const { sourceType, query: q, user: u, listId: lId } = buildQueryOptions(source, {
        streamFilter,
        searchQuery,
        userHandle,
        selectedList,
        customListId,
        queryParam,
        userParam,
        listIdParam,
      });

      const offset = isAppend ? tweets.length : 0;
      const [data, totalCount] = await Promise.all([
        api.listTweets({
          limit: customLimit,
          offset,
          minLikes,
          sourceType,
          query: q,
          user: u,
          listId: lId,
        }),
        api.countTweets({
          minLikes,
          sourceType,
          query: q,
          user: u,
          listId: lId,
        }),
      ]);

      setTotalDbCount(totalCount);

      if (isAppend) {
        setTweets((prev) => [...prev, ...data]);
      } else {
        setTweets(data);
        if (data.length > 0) {
          if (!selectedTweet || !data.some((t) => t.tweet_id === selectedTweet.tweet_id)) {
            handleSelectTweet(data[0]);
          }
        } else {
          setSelectedTweet(null);
          setExportPath(null);
        }
      }
      return data;
    } catch (err: any) {
      console.error('Failed to load local tweets:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // 即时切换数据源并加载对应数据 (§2.1)
  const handleSwitchDataSource = (newSource: DataSource) => {
    setDataSource(newSource);
    setStreamFilter('');
    setCheckedIds(new Set());
    if (newSource === 'user') {
      loadLocalTweets(50, 'user', false, undefined, userHandle);
    } else if (newSource === 'search') {
      loadLocalTweets(50, 'search', false, searchQuery);
    } else if (newSource === 'following') {
      loadLocalTweets(50, 'following', false);
    } else {
      const currentListId = selectedList === 'custom' ? customListId : selectedList;
      loadLocalTweets(50, 'lists', false, undefined, undefined, currentListId);
    }
  };

  // 搜索框防抖联动本地全库查询
  const searchDebounceRef = useRef<any>(null);
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadLocalTweets(50, 'search', false, val);
    }, 250);
  };

  // 博主输入框防抖联动本地全量博主推文查询
  const userDebounceRef = useRef<any>(null);
  const handleUserChange = (val: string) => {
    setUserHandle(val);
    const clean = val.trim().replace(/^@/, '');
    if (clean) {
      try {
        localStorage.setItem('xtract_last_user_handle', clean);
      } catch {}
    }
    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    userDebounceRef.current = setTimeout(() => {
      loadLocalTweets(50, 'user', false, undefined, clean);
    }, 250);
  };

  // 关注流实时过滤输入框联动后端 SQLite 全量查询
  const streamFilterDebounceRef = useRef<any>(null);
  const handleStreamFilterChange = (val: string) => {
    setStreamFilter(val);
    if (streamFilterDebounceRef.current) clearTimeout(streamFilterDebounceRef.current);
    streamFilterDebounceRef.current = setTimeout(() => {
      loadLocalTweets(50, 'following', false, val);
    }, 250);
  };

  useEffect(() => {
    loadLocalTweets(50, dataSource, false);
  }, [minLikes]);

  // Select tweet and asynchronously fetch enriched details / Page Bundle
  const handleSelectTweet = async (tweet: Tweet) => {
    activeTweetIdRef.current = tweet.tweet_id;
    setSelectedTweet(tweet);
    const defaultExportPath = `output/${tweet.author_username || 'tweet'}/${tweet.tweet_id}/index.md`;
    setExportPath(defaultExportPath);
    setIsDetailLoading(true);

    try {
      const res = await api.viewTweet(tweet.tweet_id);
      // 防范异步竞态 (Race Condition)：只有当前聚焦依然是这篇推文时，才更新详情面板
      if (activeTweetIdRef.current === tweet.tweet_id) {
        if (res?.tweet) {
          setSelectedTweet(res.tweet);
        }
        if (res?.exportPath) {
          setExportPath(res.exportPath);
        }
      }
      // 列表缓存始终可用最新数据更新
      if (res?.tweet) {
        setTweets((prev) =>
          prev.map((t) => (t.tweet_id === res.tweet.tweet_id ? res.tweet : t))
        );
      }
    } catch {
      // offline/mock fallback
    } finally {
      // 仅当依然是当前选中的推文时，才关闭详情加载动画
      if (activeTweetIdRef.current === tweet.tweet_id) {
        setIsDetailLoading(false);
      }
    }
  };

  // Crawl Action Handlers with Real-time Progress Tracking (§2.3)
  const handleCrawl = async (source: DataSource, overrideTarget?: string) => {
    setIsLoading(true);

    let title = '正在从 X 官方流实时抓取关注流';
    const effectiveQuery = (overrideTarget !== undefined ? overrideTarget : searchQuery).trim();
    const effectiveUser = (overrideTarget !== undefined ? overrideTarget : userHandle).trim();
    const userGuard = validateCrawlTarget('user', effectiveUser);

    if (source === 'search') {
      const guard = validateCrawlTarget('search', effectiveQuery);
      if (!guard.ok) {
        showToast(guard.message);
        setIsLoading(false);
        return;
      }
      title = `正在全网实时搜索关键词「${effectiveQuery}」`;
    } else if (source === 'user') {
      if (!userGuard.ok) {
        showToast(userGuard.message);
        setIsLoading(false);
        return;
      }
      title = `正在抓取博主 @${effectiveUser.replace(/^@/, '')} 的推文包`;
    } else if (source === 'lists') {
      title = '正在从 X 列表实时抓取推文';
    }

    setCrawlProgress({
      active: true,
      source,
      title,
      stage: '正在启动真实浏览器嗅探网络流...',
      detail: '安全节流规避风控 · 拦截官方 GraphQL 数据包',
      percent: 25,
    });

    const progressTimer = setTimeout(() => {
      setCrawlProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: '正在解析推文数据包与媒体流...',
              detail: '提取高信噪比互动指标 (赞/转/评) 与正文长链接...',
              percent: 65,
            }
          : null
      );
    }, 600);

    try {
      let fetchedCount = 0;
      let insertedCount = 0;
      let skippedCount = 0;

      if (source === 'following') {
        const pages = computePages(crawlLimit);
        const res = await api.fetchFollowing({ pages, limit: crawlLimit });
        fetchedCount = res.fetched;
        insertedCount = res.inserted;
        skippedCount = res.skipped;
      } else if (source === 'search') {
        const tweetId = extractTweetIdFromQuery(effectiveQuery);
        if (tweetId) {
          showToast(`正在精准同步推文【${tweetId}】完整全文...`);
          const res = await api.viewTweet(tweetId, { forceRefresh: true, exportMd: true });
          fetchedCount = 1;
          insertedCount = 1;
          if (res?.tweet) {
            handleSelectTweet(res.tweet);
          }
        } else {
          const res = await api.searchTweets(effectiveQuery, { limit: crawlLimit, minLikes });
          fetchedCount = res.count;
          insertedCount = res.count;
        }
      } else if (source === 'user') {
        const handle = effectiveUser.replace(/^@/, '');
        const res = await api.fetchUser(handle, { limit: crawlLimit });
        fetchedCount = res.fetched;
        insertedCount = res.inserted;
        skippedCount = res.skipped;
      } else if (source === 'lists') {
        let listId = selectedList;
        if (selectedList === 'custom') {
          listId = customListId.trim();
        }
        if (!listId) {
          showToast('请选择或输入有效的 X 列表 ID 或链接');
          setIsLoading(false);
          setCrawlProgress(null);
          clearTimeout(progressTimer);
          return;
        }
        const cleanId = resolveListId(listId);

        const res = await api.fetchList(cleanId, { limit: crawlLimit });
        fetchedCount = res.fetched;
        insertedCount = res.inserted;
        skippedCount = res.skipped;

        // Auto-save and sync list info
        await loadUserLists();
        const updatedLists = await api.getUserLists();
        if (!updatedLists.some((l) => l.id === cleanId)) {
          const newList: XListInfo = {
            id: cleanId,
            name: `X 列表 #${cleanId.slice(-4)}`,
          };
          await api.saveUserList(newList);
          await loadUserLists();
        }
        setSelectedList(cleanId);
      }

      clearTimeout(progressTimer);
      setCrawlProgress({
        active: true,
        source,
        title,
        stage: '增量抓取与落库去重完成！',
        detail: `获取 ${fetchedCount} 条推文，新增入库 ${insertedCount} 条，跳过历史去重 ${skippedCount} 条`,
        percent: 100,
        completed: true,
      });

      showToast(
        `抓取完成：新增入库 ${insertedCount} 条推文 (跳过去重 ${skippedCount} 条)`
      );

      // Reload local tweets for current data source and automatically select the first tweet
      let refreshedTweets: Tweet[] = [];
      if (source === 'lists') {
        const cleanListId = selectedList === 'custom' ? customListId.match(/(\d{5,})/)?.[1] || customListId.trim() : selectedList;
        refreshedTweets = await loadLocalTweets(50, 'lists', false, undefined, undefined, cleanListId);
      } else if (source === 'user') {
        const h = (overrideTarget !== undefined ? overrideTarget : userHandle).trim().replace(/^@/, '');
        refreshedTweets = await loadLocalTweets(50, 'user', false, undefined, h);
      } else if (source === 'search') {
        refreshedTweets = await loadLocalTweets(50, 'search', false, effectiveQuery);
      } else {
        refreshedTweets = await loadLocalTweets(50, 'following', false);
      }

      if (refreshedTweets && refreshedTweets.length > 0) {
        handleSelectTweet(refreshedTweets[0]);
      }

      setTimeout(() => {
        setCrawlProgress(null);
      }, 3500);
    } catch (err: any) {
      clearTimeout(progressTimer);
      setCrawlProgress({
        active: true,
        source,
        title,
        stage: '抓取失败',
        detail: err?.message || String(err),
        percent: 100,
        error: err?.message || String(err),
      });
      showToast(`抓取失败: ${err?.message || String(err)}`);
      setTimeout(() => {
        setCrawlProgress(null);
      }, 5000);
    } finally {
      setIsLoading(false);
    }
  };

  // 响应来自全网趋势雷达或其他外部页面的推文跳转下钻动作
  useEffect(() => {
    if (!jumpAction || !jumpAction.query) return;

    const targetQuery = jumpAction.query.trim();
    if (!targetQuery) return;

    if (targetQuery.startsWith('@')) {
      const handle = targetQuery.replace(/^@/, '');
      setDataSource('user');
      setUserHandle(handle);
      (async () => {
        const local = await loadLocalTweets(50, 'user', false, undefined, handle);
        if (jumpAction.autoFetch || local.length === 0) {
          await handleCrawl('user', handle);
        }
      })();
    } else {
      setDataSource('search');
      setSearchQuery(targetQuery);
      (async () => {
        const local = await loadLocalTweets(50, 'search', false, targetQuery);
        if (jumpAction.autoFetch || local.length === 0) {
          await handleCrawl('search', targetQuery);
        }
      })();
    }
  }, [jumpAction?.timestamp]);

  const handleLoadMore = async () => {
    if (isLoading || (totalDbCount > 0 && tweets.length >= totalDbCount)) return;
    const newData = await loadLocalTweets(50, dataSource, true);
    if (newData && newData.length > 0) {
      showToast(`已加载更早的 ${newData.length} 条历史推文`);
    } else {
      showToast('已加载全部推文');
    }
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
      showToast(`✓ 已彻底删除推文 ${selectedTweet.tweet_id}`);
      const nextList = tweets.filter((t) => t.tweet_id !== selectedTweet.tweet_id);
      setTweets(nextList);
      setTotalDbCount((prev) => Math.max(0, prev - 1));
      if (nextList.length > 0) {
        handleSelectTweet(nextList[0]);
      } else {
        setSelectedTweet(null);
        setExportPath(null);
      }
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      showToast(`删除失败: ${err?.message || String(err)}`);
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    try {
      await api.deleteTweets({ tweetIds: ids });
      showToast(`✓ 已彻底级联删除所选 ${ids.length} 篇推文及磁盘文件`);
      const nextList = tweets.filter((t) => !checkedIds.has(t.tweet_id));
      setTweets(nextList);
      setTotalDbCount((prev) => Math.max(0, prev - ids.length));
      setCheckedIds(new Set());
      setBatchDeleteConfirmOpen(false);
      if (nextList.length > 0) {
        handleSelectTweet(nextList[0]);
      } else {
        setSelectedTweet(null);
        setExportPath(null);
      }
    } catch (err: any) {
      showToast(`批量删除失败: ${err?.message || String(err)}`);
    }
  };

  const handleBatchExport = async () => {
    showToast(`已将选中 ${checkedIds.size} 篇推文导出为结构化 Markdown`);
    setCheckedIds(new Set());
  };

  const handleRevealInFinder = async () => {
    if (!selectedTweet) return;
    showToast('正在导出并定位本地推文包...');
    try {
      // 1. Ensure page bundle is exported and refreshed
      const res = await api.viewTweet(selectedTweet.tweet_id, { exportMd: true });
      const targetPath =
        res?.exportPath ||
        exportPath ||
        `output/${selectedTweet.author_username || 'tweet'}/${selectedTweet.tweet_id}/index.md`;
      if (res?.exportPath) {
        setExportPath(res.exportPath);
      }
      // 2. Reveal in OS file manager
      const revealRes = await api.showItemInFolder(targetPath);
      if (revealRes?.success) {
        showToast(`已在系统文件管理器中定位: ${targetPath}`);
      } else {
        showToast(`定位失败: ${revealRes?.error || '本地文件不存在'}`);
      }
    } catch (err: any) {
      showToast(`定位失败: ${err?.message || String(err)}`);
    }
  };

  const handleOpenInX = async () => {
    if (!selectedTweet) return;
    const url = `https://x.com/${selectedTweet.author_username || 'i'}/status/${selectedTweet.tweet_id}`;
    await api.openExternal(url);
  };

  const handleForceRefreshTweet = async () => {
    if (!selectedTweet) return;
    const currentId = selectedTweet.tweet_id;
    activeTweetIdRef.current = currentId;
    setIsDetailLoading(true);
    showToast('正在从 X 官方实时同步该推文完整全文与高清多媒体...');
    try {
      const res = await api.viewTweet(currentId, { forceRefresh: true, exportMd: true });
      if (activeTweetIdRef.current === currentId) {
        if (res?.tweet) {
          setSelectedTweet(res.tweet);
          showToast('✓ 已成功同步 X 线上完整全文与多媒体！');
        }
        if (res?.exportPath) {
          setExportPath(res.exportPath);
        }
      }
      if (res?.tweet) {
        setTweets((prev) =>
          prev.map((t) => (t.tweet_id === res.tweet.tweet_id ? res.tweet : t))
        );
      }
    } catch (err: any) {
      if (activeTweetIdRef.current === currentId) {
        showToast(`同步失败: ${err?.message || String(err)}`);
      }
    } finally {
      if (activeTweetIdRef.current === currentId) {
        setIsDetailLoading(false);
      }
    }
  };

  // Instant In-Memory Filter
  const filteredTweets = filterTweetsByKeyword(tweets, streamFilter);

  const allChecked = filteredTweets.length > 0 && checkedIds.size === filteredTweets.length;

  // 详情栏的专栏/长推文判定（未选中推文时为 null，JSX 内以可选链消费）
  const detailClassification = selectedTweet ? classifyTweet(selectedTweet) : null;
  return {
    dataSource, crawlLimit, openMenu, searchQuery, userHandle, userLists, selectedList,
    customListId, isSyncingLists, streamFilter, minLikes, totalDbCount, tweets, selectedTweet,
    exportPath, isDetailLoading, checkedIds, isLoading, deleteConfirmOpen, batchDeleteConfirmOpen,
    previewImage, setPreviewImage, toastMessage, crawlProgress,
    setCrawlLimit, setMinLikes, setOpenMenu, setSelectedList, setCustomListId,
    setDeleteConfirmOpen, setBatchDeleteConfirmOpen, setCheckedIds,
    filteredTweets, allChecked,
    showToast, loadUserLists, handleSyncOnlineLists, loadLocalTweets, handleSwitchDataSource,
    handleSearchChange, handleUserChange, handleStreamFilterChange, handleSelectTweet,
    handleCrawl, handleLoadMore, toggleCheck, handleToggleSelectAll, handleDeleteSingle,
    handleBatchDelete, handleBatchExport, handleRevealInFinder, handleOpenInX,
    handleForceRefreshTweet,
  };
}
