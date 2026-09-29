import React, { useState, useEffect } from 'react';
import { Masthead } from './components/Masthead.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { StudioView } from './views/StudioView.js';
import { api } from './services/api.js';

export const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [xAuthStatus, setXAuthStatus] = useState<{ isValid: boolean; info?: string; screenName?: string }>({
    isValid: true,
    info: '@cza55008',
    screenName: 'cza55008',
  });
  const [proxyStatus, setProxyStatus] = useState<string | undefined>('127.0.0.1:7890');

  const loadStatus = async () => {
    const auth = await api.checkAuth();
    setXAuthStatus({
      isValid: auth.isValid,
      info: auth.info,
      screenName: auth.screenName || (auth.info?.startsWith('@') ? auth.info.slice(1) : undefined),
    });
    setProxyStatus(auth.proxy);
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
