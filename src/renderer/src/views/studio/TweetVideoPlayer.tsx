import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api.js';
import type { LocalVideoStatus } from '../../types.js';

/**
 * 推特高清视频播放器：支持在线流式播放（免落盘/代理穿透）+ 按需流式下载至本地 Page Bundle + 本地离线秒播。
 * 保持 preload="none"，未点击播放前零流量消耗、零未播转圈。
 */

export interface TweetVideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  tweetId?: string;
  tweetUrl?: string;
  authorUsername?: string;
  containerId?: string;
  localVideo?: LocalVideoStatus;
  onVideoDownloaded?: (videoUrl: string, status: LocalVideoStatus) => void;
  onToast?: (msg: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export const TweetVideoPlayer: React.FC<TweetVideoPlayerProps> = ({
  videoUrl,
  posterUrl,
  tweetId,
  tweetUrl,
  authorUsername,
  containerId = 'tweet-detail-video',
  localVideo,
  onVideoDownloaded,
  onToast,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // 本地下载三态：idle | downloading | error（已下载由 localVideo?.downloaded 驱动）
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadError, setDownloadError] = useState('');

  const isDownloaded = Boolean(localVideo?.downloaded && localVideo?.localPath);
  const effectiveSrc = isDownloaded && localVideo?.mediaUrl ? localVideo.mediaUrl : videoUrl;

  useEffect(() => {
    setIsPlaying(false);
    setIsBuffering(false);
    setHasError(false);
    setErrorMessage('');
    setDownloadState('idle');
    setProgressPercent(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadError('');
  }, [videoUrl]);

  // 订阅主进程推送的当前视频下载进度事件
  useEffect(() => {
    const unsubscribe = api.onStreamEvent((event) => {
      if (!event || event.stage !== 'video_download') return;
      const meta = event.meta || {};
      if (meta.videoUrl !== videoUrl) return;

      const status = String(meta.status || '');
      if (status === 'downloading') {
        setDownloadState('downloading');
        setProgressPercent(typeof meta.percent === 'number' ? meta.percent : event.progress || 0);
        setDownloadedBytes(typeof meta.downloadedBytes === 'number' ? meta.downloadedBytes : 0);
        setTotalBytes(typeof meta.totalBytes === 'number' ? meta.totalBytes : 0);
        setDownloadError('');
      } else if (status === 'done') {
        setDownloadState('idle');
        setProgressPercent(100);
        setDownloadError('');
        if (meta.localPath && onVideoDownloaded) {
          onVideoDownloaded(videoUrl, {
            downloaded: true,
            localPath: String(meta.localPath),
            mediaUrl: meta.mediaUrl ? String(meta.mediaUrl) : undefined,
            sizeBytes: typeof meta.sizeBytes === 'number' ? meta.sizeBytes : undefined,
          });
        }
      } else if (status === 'canceled') {
        setDownloadState('idle');
        setProgressPercent(0);
        setDownloadError('');
      } else if (status === 'error') {
        setDownloadState('error');
        setDownloadError(String(meta.error || '视频下载失败'));
      }
    });

    return () => unsubscribe();
  }, [videoUrl, onVideoDownloaded]);

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

  const handleStartDownload = async () => {
    if (!tweetId) {
      onToast?.('缺少推文上下文，无法定位本地归档目录');
      return;
    }
    setDownloadState('downloading');
    setProgressPercent(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadError('');

    try {
      const res = await api.downloadVideo({
        tweetId,
        authorUsername: authorUsername || 'unknown',
        videoUrl,
      });

      if (res.success && res.localPath) {
        setDownloadState('idle');
        setProgressPercent(100);
        onVideoDownloaded?.(videoUrl, {
          downloaded: true,
          localPath: res.localPath,
          mediaUrl: res.mediaUrl,
          sizeBytes: res.sizeBytes,
        });
        onToast?.(
          res.alreadyExisted
            ? '✓ 该视频已在本地归档，已切换为离线播放'
            : '✓ 视频已下载至本地 Page Bundle，已切换为离线播放'
        );
      } else if (res.canceled) {
        setDownloadState('idle');
        onToast?.('已取消视频下载');
      } else {
        setDownloadState('error');
        setDownloadError(res.error || '视频下载失败，请检查代理后重试');
        onToast?.(`下载失败：${res.error || '请检查网络连接'}`);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setDownloadState('error');
      setDownloadError(msg);
      onToast?.(`下载失败：${msg}`);
    }
  };

  const handleCancelDownload = async () => {
    await api.cancelVideoDownload(videoUrl);
    setDownloadState('idle');
    setProgressPercent(0);
    setDownloadError('');
    onToast?.('已取消下载并清理临时文件');
  };

  const handleRevealLocalVideo = async () => {
    if (!localVideo?.localPath) return;
    const res = await api.showItemInFolder(localVideo.localPath);
    if (res.success) {
      onToast?.(`已在文件管理器中定位本地视频`);
    } else {
      onToast?.(`定位失败：${res.error || '文件不存在'}`);
    }
  };

  const downloadingLabel = (() => {
    const dl = formatBytes(downloadedBytes);
    const total = formatBytes(totalBytes);
    if (totalBytes > 0) {
      return `下载中 ${progressPercent}% · ${dl || '0 B'} / ${total}`;
    }
    if (downloadedBytes > 0) {
      return `下载中 ${dl}`;
    }
    return '连接下载中...';
  })();

  return (
    <div
      id={containerId}
      className="tweet-video-player"
      data-video-url={videoUrl}
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
          key={effectiveSrc}
          ref={videoRef}
          controls
          playsInline
          preload="none"
          poster={posterUrl}
          src={effectiveSrc}
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
            let msg = isDownloaded
              ? '本地视频解码受阻，可点击「访达定位」使用系统播放器打开'
              : '推特视频流连接超时或受阻（需代理畅通）';
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
            title={isDownloaded ? '点击本地离线播放视频' : '点击在线播放视频'}
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
            <span>{isDownloaded ? '本地视频加载中...' : '流媒体连接缓冲中...'}</span>
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
              {isDownloaded ? '本地视频解码受阻' : '在线播放遇到网络或解码受阻'}
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
                title="一键在系统默认浏览器中高速播放"
              >
                🌐 在系统浏览器播放 ↗
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 纤细下载进度条 (3px) */}
      {downloadState === 'downloading' && (
        <div
          className="video-download-progress"
          style={{
            height: '3px',
            width: '100%',
            background: 'rgba(33, 28, 21, 0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(4, progressPercent)}%`,
              background: 'var(--cinnabar)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}

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
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px' }}>🎬</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>推特视频 (MP4)</span>
          {downloadState === 'downloading' ? (
            <span className="badge badge-cinnabar video-download-status-text">{downloadingLabel}</span>
          ) : isDownloaded ? (
            <span className="badge badge-ok video-offline-badge">
              <span className="badge-dot" />
              本地离线{localVideo?.sizeBytes ? ` · ${formatBytes(localVideo.sizeBytes)}` : ''}
            </span>
          ) : downloadState === 'error' ? (
            <span className="badge badge-cinnabar">下载失败</span>
          ) : (
            <span className="badge badge-neutral">在线流式</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {tweetId && downloadState === 'downloading' ? (
            <button
              type="button"
              className="secondary-button video-cancel-btn"
              style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
              onClick={handleCancelDownload}
              title="取消下载并清理未完成的临时文件"
            >
              <span>✕ 取消</span>
            </button>
          ) : tweetId && isDownloaded ? (
            <button
              type="button"
              className="secondary-button video-reveal-btn"
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                height: '28px',
                borderColor: 'rgba(63, 107, 81, 0.35)',
                background: 'var(--jade-wash)',
                color: 'var(--jade)',
                fontWeight: 600,
              }}
              onClick={handleRevealLocalVideo}
              title={`在文件管理器中定位本地视频：${localVideo?.localPath || ''}`}
            >
              <span>✓ 已下载 · 访达定位</span>
            </button>
          ) : tweetId ? (
            <button
              type="button"
              className="secondary-button video-download-btn"
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                height: '28px',
                borderColor: 'var(--cinnabar)',
                background: 'var(--cinnabar-wash)',
                color: 'var(--cinnabar)',
                fontWeight: 600,
              }}
              onClick={handleStartDownload}
              title="流式下载高清 MP4 到本地 Page Bundle 目录，支持离线播放"
            >
              <span>{downloadState === 'error' ? '🔄 重试下载' : '⬇️ 下载视频'}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="secondary-button"
            style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
            onClick={handleCopy}
            title="复制该视频原源 MP4 下载/播放直链"
          >
            <span>{copied ? '✓ 已复制直链' : '📋 复制直链'}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
            onClick={() => api.openExternal(videoUrl)}
            title="在系统默认浏览器（如 Safari / Chrome）中高速播放原视频"
          >
            <span>🌐 在系统浏览器播放 ↗</span>
          </button>
          {tweetUrl && (
            <button
              type="button"
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

      {/* 下载失败清晰错误反馈条 */}
      {downloadState === 'error' && downloadError && (
        <div
          className="video-download-error-strip"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '8px 16px',
            background: 'var(--cinnabar-wash)',
            borderTop: '1px solid rgba(181, 70, 47, 0.25)',
            color: 'var(--cinnabar)',
            fontSize: '12px',
          }}
        >
          <span>⚠️ {downloadError}</span>
          {tweetId && (
            <button
              type="button"
              className="secondary-button"
              style={{ fontSize: '11.5px', padding: '2px 10px', height: '24px' }}
              onClick={handleStartDownload}
            >
              🔄 重试下载
            </button>
          )}
        </div>
      )}
    </div>
  );
};
