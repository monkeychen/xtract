import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api.js';

/**
 * 推特高清视频在线播放器：免落盘流式播放 + 代理防盗链穿透。
 * 保持 preload="none"，未点击播放前零流量消耗、零未播转圈。
 */

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
