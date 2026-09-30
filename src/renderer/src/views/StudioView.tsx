import React, { useState, useEffect, useRef } from 'react';
import type { Tweet, XListInfo, TweetQueryOptions, StudioJumpAction } from '../types.js';
import { api } from '../services/api.js';
import { TweetMarkdown, renderInlineMarkdown } from '../components/TweetMarkdown.js';

interface StudioViewProps {
  initialSearchQuery?: string;
  jumpAction?: StudioJumpAction | null;
}

type DataSource = 'following' | 'search' | 'user' | 'lists';

export function isVideoUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('video.twimg.com');
}

export function isTweetVideo(tweet: Partial<Tweet>): boolean {
  if (tweet.video_url) return true;
  return Boolean(tweet.media_urls && tweet.media_urls.some((m) => isVideoUrl(m)));
}

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

export interface TweetVideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  tweetUrl?: string;
  authorUsername?: string;
  onToast?: (msg: string) => void;
}

export const TweetVideoPlayer: React.FC<TweetVideoPlayerProps> = ({
  videoUrl,
  posterUrl,
  tweetUrl,
  authorUsername,
  onToast,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setIsBuffering(false);
    setHasError(false);
    setErrorMessage('');
  }, [videoUrl]);

  const handleTogglePlay = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const video = videoRef.current;
    if (!video) return;

    if (hasError) {
      handleReload();
      return;
    }

    if (video.paused || video.ended) {
      try {
        setIsBuffering(true);
        await video.play();
        setIsPlaying(true);
        setIsBuffering(false);
      } catch (err: any) {
        setIsBuffering(false);
        if (err?.name === 'NotAllowedError') {
          // autoplay / gesture restriction
        } else if (err?.name === 'NotSupportedError' || err?.message?.includes('DEMUXER_ERROR')) {
          setHasError(true);
          setErrorMessage('该视频格式需系统浏览器直接播放');
        } else {
          console.warn('Video play error:', err);
        }
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleReload = () => {
    setHasError(false);
    setErrorMessage('');
    setIsBuffering(true);
    const video = videoRef.current;
    if (video) {
      video.load();
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {
          setIsBuffering(false);
        });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      if (onToast) onToast('📋 已复制视频直链');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      id="tweet-detail-video"
      style={{
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid var(--line-strong)',
        background: '#050505',
        marginBottom: '20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          backgroundColor: '#000',
          minHeight: '220px',
          maxHeight: '520px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={handleTogglePlay}
      >
        <video
          key={videoUrl}
          ref={videoRef}
          controls
          playsInline
          preload="none"
          poster={posterUrl}
          src={videoUrl}
          style={{
            width: '100%',
            maxHeight: '520px',
            display: 'block',
            backgroundColor: '#000',
            cursor: 'pointer',
          }}
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
          }}
          onPause={() => {
            setIsPlaying(false);
            setIsBuffering(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setIsBuffering(false);
          }}
          onWaiting={() => {
            // 仅在用户已触发播放的前提下遇到卡顿才展示缓冲转圈，避免未播放时偷跑元数据或提前转圈
            if (isPlaying) {
              setIsBuffering(true);
            }
          }}
          onPlaying={() => {
            setIsPlaying(true);
            setIsBuffering(false);
          }}
          onCanPlay={() => setIsBuffering(false)}
          onError={() => {
            const mediaError = videoRef.current?.error;
            let msg = '推特视频流连接超时或受阻（需代理畅通）';
            if (mediaError?.code === 4) {
              msg = '格式不支持或网络加载失败，建议直接使用系统浏览器播放';
            }
            setHasError(true);
            setIsBuffering(false);
            setErrorMessage(msg);
          }}
        >
          您的系统暂不支持直接播放该格式视频。
        </video>

        {/* 1. 大号居中播放按钮 Overlay */}
        {!isPlaying && !isBuffering && !hasError && (
          <div
            id="video-big-play-btn"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              border: '2px solid rgba(255, 255, 255, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              pointerEvents: 'auto',
              zIndex: 3,
            }}
            onClick={handleTogglePlay}
            title="点击在线播放视频"
          >
            <span style={{ marginLeft: '4px' }}>▶</span>
          </div>
        )}

        {/* 2. 缓冲/加载中指示器 Overlay */}
        {isBuffering && !hasError && (
          <div
            id="video-buffering-indicator"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '10px 18px',
              borderRadius: '20px',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#ffffff',
              fontSize: '13px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: '#ffffff',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span>流媒体连接缓冲中...</span>
          </div>
        )}

        {/* 3. 错误状态兜底 Overlay */}
        {hasError && (
          <div
            id="video-error-fallback"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(10, 10, 10, 0.88)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              zIndex: 5,
              gap: '12px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '28px' }}>⚠️</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>
              在线播放遇到网络或解码受阻
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', maxWidth: '380px', lineHeight: '1.5' }}>
              {errorMessage || '推特媒体 CDN 需保持网络代理畅通。'}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                className="secondary-button"
                style={{ fontSize: '12px', padding: '6px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                onClick={handleReload}
                title="重新发起流媒体加载"
              >
                🔄 重新加载
              </button>
              <button
                className="primary-button"
                style={{ fontSize: '12px', padding: '6px 14px', background: 'var(--cinnabar)', color: '#fff', border: 'none' }}
                onClick={() => api.openExternal(videoUrl)}
                title="一键在 macOS 系统默认浏览器（Safari / Chrome）中高速播放"
              >
                🌐 在系统浏览器播放 ↗
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部控制工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          background: 'var(--paper-sunken)',
          borderTop: '1px solid var(--line)',
          fontSize: '12.5px',
          color: 'var(--ink-soft)',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>🎬</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>推特在线视频 (MP4)</span>
          <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>免落盘直接流式播放</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="secondary-button"
            style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
            onClick={handleCopy}
            title="复制该视频原源 MP4 下载/播放直链"
          >
            <span>{copied ? '✓ 已复制直链' : '📋 复制直链'}</span>
          </button>
          <button
            className="secondary-button"
            style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
            onClick={() => api.openExternal(videoUrl)}
            title="在系统默认浏览器（如 Safari / Chrome）中高速播放原视频"
          >
            <span>🌐 在系统浏览器播放 ↗</span>
          </button>
          {tweetUrl && (
            <button
              className="secondary-button"
              style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
              onClick={() => api.openExternal(tweetUrl)}
              title="在 X 官方页面查看该推文及视频原帖"
            >
              <span>🐦 在 X 查看 ↗</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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

export const StudioView: React.FC<StudioViewProps> = ({ initialSearchQuery = '', jumpAction }) => {
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
  const [crawlProgress, setCrawlProgress] = useState<{
    active: boolean;
    source: DataSource;
    title: string;
    stage: string;
    detail: string;
    percent: number;
    completed?: boolean;
    error?: string;
  } | null>(null);

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
      if (event.stage === 'error') {
        setCrawlProgress((prev) =>
          prev
            ? {
                ...prev,
                stage: '抓取失败',
                detail: event.text || '发生未知错误',
                percent: 100,
                error: event.text,
              }
            : null
        );
        setIsLoading(false);
      } else if (event.stage === 'done') {
        setCrawlProgress((prev) =>
          prev
            ? {
                ...prev,
                stage: '抓取完成',
                detail: event.text || '已完成落库去重',
                percent: 100,
                completed: true,
              }
            : null
        );
        setIsLoading(false);
      } else {
        setCrawlProgress((prev) => ({
          active: true,
          source: prev?.source || dataSource,
          title: prev?.title || '正在抓取推文数据',
          stage: event.text || '正在处理...',
          detail: `进度: ${event.progress || 50}%`,
          percent: event.progress || 50,
        }));
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
      let sourceType: TweetQueryOptions['sourceType'] = 'following';
      let q: string | undefined = undefined;
      let u: string | undefined = undefined;
      let lId: string | undefined = undefined;

      if (source === 'user') {
        sourceType = 'user';
        u = (userParam !== undefined ? userParam : userHandle).trim().replace(/^@/, '') || undefined;
      } else if (source === 'search') {
        sourceType = 'all'; // 全网搜索工作台：检索本地推文库，为空时不添加任何关键词过滤（查全库），有词时全库模糊搜索
        q = (queryParam !== undefined ? queryParam : searchQuery).trim() || undefined;
      } else if (source === 'lists') {
        sourceType = 'list';
        lId = (listIdParam !== undefined ? listIdParam : (selectedList === 'custom' ? customListId : selectedList)).trim() || undefined;
      } else {
        sourceType = 'following';
        q = (queryParam !== undefined ? queryParam : streamFilter).trim() || undefined;
      }

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

    if (source === 'search') {
      if (!effectiveQuery) {
        showToast('请输入要搜索的关键词');
        setIsLoading(false);
        return;
      }
      title = `正在全网实时搜索关键词「${effectiveQuery}」`;
    } else if (source === 'user') {
      const u = (overrideTarget !== undefined ? overrideTarget : userHandle).trim().replace(/^@/, '');
      if (!u) {
        showToast('请输入要追踪的博主用户名（如 @username）');
        setIsLoading(false);
        return;
      }
      title = `正在抓取博主 @${u} 的推文包`;
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
        const pages = Math.max(1, Math.ceil(crawlLimit / 20));
        const res = await api.fetchFollowing({ pages, limit: crawlLimit });
        fetchedCount = res.fetched;
        insertedCount = res.inserted;
        skippedCount = res.skipped;
      } else if (source === 'search') {
        const matchId = effectiveQuery.match(/status\/(\d{5,})/) || effectiveQuery.match(/^(\d{5,})$/);
        if (matchId) {
          const tweetId = matchId[1];
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
        const handle = (overrideTarget !== undefined ? overrideTarget : userHandle).trim().replace(/^@/, '');
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
        const match = listId.match(/(\d{5,})/);
        const cleanId = match ? match[1] : listId;

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
            onClick={() => handleSwitchDataSource('following')}
          >
            关注流
          </div>
          <div
            id="chip-source-search"
            className={`fmt-chip ${dataSource === 'search' ? 'active' : ''}`}
            onClick={() => handleSwitchDataSource('search')}
          >
            全网搜索
          </div>
          <div
            id="chip-source-user"
            className={`fmt-chip ${dataSource === 'user' ? 'active' : ''}`}
            onClick={() => handleSwitchDataSource('user')}
          >
            博主追踪
          </div>
          <div
            id="chip-source-lists"
            className={`fmt-chip ${dataSource === 'lists' ? 'active' : ''}`}
            onClick={() => handleSwitchDataSource('lists')}
          >
            X 列表
          </div>
        </div>

        {/* 中间：自适应动态操作区 (按数据源切换) */}
        <div id="studio-context-zone" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          {/* 容器 1: 关注流操作区 */}
          {dataSource === 'following' && (
            <div id="zone-following" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('following')}
                  disabled={isLoading}
                >
                  <span id="label-crawl-following">
                    {isLoading && crawlProgress?.source === 'following'
                      ? '⏳ 正在抓取...'
                      : `🔄 抓取最新 (${crawlLimit}条)`}
                  </span>
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
                placeholder="🔍 搜索关注流推文 (全库检索)..."
                value={streamFilter}
                onChange={(e) => handleStreamFilterChange(e.target.value)}
              />
            </div>
          )}

          {/* 容器 2: 全网搜索操作区 */}
          {dataSource === 'search' && (
            <div id="zone-search" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              <input
                id="search-query-input"
                className="text-input"
                style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
                type="text"
                placeholder="输入【关键词、推文链接或ID】即触发本地搜索"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadLocalTweets(50, 'search', false, e.currentTarget.value);
                  }
                }}
              />
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('search')}
                  disabled={isLoading}
                >
                  <span id="label-crawl-search">
                    {isLoading && crawlProgress?.source === 'search'
                      ? '⏳ 搜索中...'
                      : `搜索抓取 (${crawlLimit}条)`}
                  </span>
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
            <div id="zone-user" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              <input
                id="user-handle-input"
                className="text-input"
                style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
                type="text"
                placeholder="输入【博主用户名或昵称】即触发本地搜索"
                value={userHandle}
                onChange={(e) => handleUserChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const clean = e.currentTarget.value.trim().replace(/^@/, '');
                    loadLocalTweets(50, 'user', false, undefined, clean);
                  }
                }}
              />
              <div className="split-btn-group">
                <button
                  className="cta-button split-btn-main"
                  onClick={() => handleCrawl('user')}
                  disabled={isLoading}
                >
                  <span id="label-crawl-user">
                    {isLoading && crawlProgress?.source === 'user'
                      ? '⏳ 抓取中...'
                      : `抓取推文 (${crawlLimit}条)`}
                  </span>
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
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedList(val);
                  if (val !== 'custom') {
                    loadLocalTweets(50, 'lists', false, undefined, undefined, val);
                  }
                }}
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
                  placeholder="输入 List ID 或链接 (回车搜索)..."
                  value={customListId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomListId(val);
                    const match = val.match(/(\d{5,})/);
                    if (match) {
                      loadLocalTweets(50, 'lists', false, undefined, undefined, match[1]);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const match = customListId.match(/(\d{5,})/);
                      const clean = match ? match[1] : customListId.trim();
                      if (clean) loadLocalTweets(50, 'lists', false, undefined, undefined, clean);
                    }
                  }}
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
                  <span id="label-crawl-lists">
                    {isLoading && crawlProgress?.source === 'lists'
                      ? '⏳ 抓取中...'
                      : `🔄 抓取最新 (${crawlLimit}条)`}
                  </span>
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

              return (
                <div
                  key={tweet.tweet_id}
                  className={`feed-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectTweet(tweet)}
                >
                  {/* 第 1 行：复选框、印章头像、作者昵称/Handle 与右侧相对时间、点赞指标 */}
                  <div className="feed-item-header">
                    <input
                      type="checkbox"
                      className="tweet-check"
                      checked={isChecked}
                      onClick={(e) => toggleCheck(tweet.tweet_id, e)}
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
                    {Boolean(
                      tweet.is_article ||
                        tweet.urls?.some((u) => /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(u)) ||
                        (tweet.text && /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(tweet.text)) ||
                        tweet.text?.startsWith('# ')
                    ) ? (
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
                    ) : Boolean(
                      tweet.is_note_tweet ||
                        (tweet.text && tweet.text.length > 280) ||
                        (tweet.text && /…\s*https:\/\/t\.co\/\S+$/i.test(tweet.text.trim()))
                    ) ? (
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
                    onClick={() => handleCrawl(dataSource)}
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
                  onClick={handleLoadMore}
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

        {/* 右栏：自包含研读卡片 (Detail §2.2 & §2.4) */}
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
                      {Boolean(
                        selectedTweet.is_article ||
                          selectedTweet.urls?.some((u) => /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(u)) ||
                          (selectedTweet.text && /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(selectedTweet.text)) ||
                          selectedTweet.text?.startsWith('# ')
                      ) ? (
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
                      ) : Boolean(
                        selectedTweet.is_note_tweet ||
                          (selectedTweet.text && selectedTweet.text.length > 280) ||
                          (selectedTweet.text && /…\s*https:\/\/t\.co\/\S+$/i.test(selectedTweet.text.trim()))
                      ) ? (
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
                      @{selectedTweet.author_username} · {(() => {
                        try {
                          const d = new Date(selectedTweet.created_at);
                          return isNaN(d.getTime()) ? selectedTweet.created_at : d.toLocaleString('zh-CN', { hour12: false });
                        } catch {
                          return selectedTweet.created_at;
                        }
                      })()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px' }}
                    onClick={handleForceRefreshTweet}
                    disabled={isDetailLoading}
                    title="从 X 线上强制拉取该推文的完整 Note Tweet / 长文与媒体"
                  >
                    <span>{isDetailLoading ? '⏳ 同步中...' : '🔄 同步全文'}</span>
                  </button>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px' }}
                    onClick={handleRevealInFinder}
                    title="在系统访达/资源管理器中高亮定位该推文的 Markdown 归档包 (index.md & 配图)"
                  >
                    <span>本地文件</span>
                  </button>
                  <button
                    className="secondary-button"
                    style={{ fontSize: '12px' }}
                    onClick={handleOpenInX}
                    title="在系统默认浏览器中打开 X 原帖"
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
                    {exportPath || `output/${selectedTweet.author_username}/${selectedTweet.tweet_id}/index.md`}
                  </code>
                </div>
                <button
                  className="secondary-button"
                  style={{ fontSize: '11px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                  onClick={handleRevealInFinder}
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
                  (img) => setPreviewImage(img)
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
                      (img) => setPreviewImage(img)
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
                      (img) => setPreviewImage(img)
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
                const isVideo = isTweetVideo(selectedTweet);
                const videoUrl = selectedTweet.video_url || selectedTweet.media_urls?.find((m) => isVideoUrl(m));
                // 只有视频推文才提取 video_poster；非视频推文 posterUrl 必须为 undefined，严禁把首张配图排挤掉
                const posterUrl = isVideo
                  ? selectedTweet.video_poster ||
                    selectedTweet.media_urls?.find((m) => m.includes('ext_tw_video_thumb') || m.includes('video_thumb')) ||
                    selectedTweet.media_urls?.find((m) => !isVideoUrl(m)) ||
                    undefined
                  : undefined;
                // 非视频推文展示全部真实配图；视频推文若有 posterUrl 则在视频播放器展示封面
                const displayImages = (selectedTweet.media_urls || []).filter(
                  (m) => !isVideoUrl(m) && (isVideo && posterUrl ? m !== posterUrl : true)
                );

                return (
                  <>
                    {/* 现代化推特在线视频播放器 */}
                    {isVideo && videoUrl && (
                      <TweetVideoPlayer
                        videoUrl={videoUrl}
                        posterUrl={posterUrl}
                        tweetUrl={`https://x.com/${selectedTweet.author_username || 'i'}/status/${selectedTweet.tweet_id}`}
                        authorUsername={selectedTweet.author_username}
                        onToast={showToast}
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
                              onClick={() => setPreviewImage(img)}
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
                                showToast('✓ 配图直链已复制至剪贴板');
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
          <button id="btn-batch-delete" className="cta-button" style={{ padding: '4px 14px', fontSize: '12px' }} onClick={() => setBatchDeleteConfirmOpen(true)}>
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

      {/* 批量删除确认对话框 */}
      {batchDeleteConfirmOpen && (
        <div id="batch-delete-dialog" className="drawer-backdrop" onClick={() => setBatchDeleteConfirmOpen(false)}>
          <div
            className="surface"
            style={{ width: '420px', padding: '24px', margin: 'auto', background: 'var(--paper-raised)', border: '1px solid var(--line-strong)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="serif-title" style={{ fontSize: '17px', color: 'var(--cinnabar)', marginBottom: '10px' }}>
              确认批量删除推文？
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
              将从本地 SQLite 数据库与磁盘归档目录中彻底物理删除选中的 <strong>{checkedIds.size}</strong> 篇推文及其配图文件，此操作不可恢复。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="secondary-button" onClick={() => setBatchDeleteConfirmOpen(false)}>
                取消
              </button>
              <button id="btn-confirm-batch-delete" className="cta-button" onClick={handleBatchDelete}>
                确认删除 ({checkedIds.size})
              </button>
            </div>
          </div>
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

      {/* 图片放大预览灯箱 (Lightbox Modal) */}
      {previewImage && (
        <div
          id="image-preview-modal"
          className="drawer-backdrop"
          style={{
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(8px)',
            cursor: 'zoom-out',
            padding: '24px',
          }}
          onClick={() => setPreviewImage(null)}
        >
          {/* 顶部浮动工具栏 */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '24px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              zIndex: 10001,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(previewImage);
                showToast('✓ 图片直链已复制');
              }}
            >
              📋 复制直链
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                api.openExternal(previewImage);
              }}
            >
              🌐 系统浏览器打开 ↗
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setPreviewImage(null)}
              style={{ minWidth: '32px', height: '32px', padding: '0 8px', fontSize: '16px' }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              maxWidth: '92vw',
              maxHeight: '88vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'default',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt="Tweet Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '88vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
};
