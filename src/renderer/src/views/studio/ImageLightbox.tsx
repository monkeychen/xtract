import React from 'react';
import { api } from '../../services/api.js';

export interface ImageLightboxProps {
  imageUrl: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

/** 图片放大预览灯箱：高斯模糊背景、ESC 关闭、复制直链与系统浏览器打开。 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, onClose, onToast }) => (
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
    onClick={onClose}
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
          navigator.clipboard.writeText(imageUrl);
          onToast('✓ 图片直链已复制');
        }}
      >
        📋 复制直链
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => {
          api.openExternal(imageUrl);
        }}
      >
        🌐 系统浏览器打开 ↗
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onClose}
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
        src={imageUrl}
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
);
