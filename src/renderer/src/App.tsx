import React, { useState, useEffect } from 'react';
import { Masthead } from './components/Masthead.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { StudioView } from './views/StudioView.js';
import { api } from './services/api.js';

export const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [xAuthStatus, setXAuthStatus] = useState<{ isValid: boolean; info?: string; screenName?: string }>({
    isValid: false,
  });
  const [proxyStatus, setProxyStatus] = useState<string | undefined>(undefined);
  const [fallbackMode, setFallbackMode] = useState(false);

  const loadStatus = async () => {
    const auth = await api.checkAuth();
    setXAuthStatus({
      isValid: auth.isValid,
      info: auth.info,
      screenName: auth.screenName || (auth.info?.startsWith('@') ? auth.info.slice(1) : undefined),
    });
    setProxyStatus(auth.proxy);
    setFallbackMode(api.isFallbackMode);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 68px Masthead Navigation Bar */}
      <Masthead
        onOpenSettings={() => setIsSettingsOpen(true)}
        xAuthStatus={xAuthStatus}
        proxyStatus={proxyStatus}
      />

      {/* 浏览器降级演示模式提示：当前页面未经 Electron 注入原生运行时，
          所有推文/研报/趋势均来自 types.ts 的示例数据集，并非真实情报。 */}
      {fallbackMode && (
        <div
          id="fallback-mode-banner"
          style={{
            padding: '8px 24px',
            background: 'var(--cinnabar-wash)',
            color: 'var(--cinnabar)',
            borderBottom: '1px solid var(--line)',
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️ 浏览器降级演示模式：当前展示的是示例数据，无法抓取 X 或调用大模型。</span>
          <span style={{ color: 'var(--ink-soft)' }}>请改用 <code style={{ fontFamily: 'var(--font-mono)' }}>pnpm dev</code> 启动桌面端。</span>
        </div>
      )}

      {/* 核心情报工作台视窗 */}
      <StudioView />

      {/* Slide-over Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigUpdated={loadStatus}
        screenName={xAuthStatus.screenName}
      />
    </div>
  );
};
