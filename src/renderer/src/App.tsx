import React, { useState, useEffect } from 'react';
import { Masthead } from './components/Masthead.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { ReportsView } from './views/ReportsView.js';
import { TrendsView } from './views/TrendsView.js';
import { StudioView } from './views/StudioView.js';
import type { ActiveTab, TrendTopic } from './types.js';
import { api } from './services/api.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('reports');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [xAuthStatus, setXAuthStatus] = useState<{ isValid: boolean; info?: string }>({
    isValid: true,
    info: 'Twitter User @demo_investor',
  });
  const [proxyStatus, setProxyStatus] = useState<string | undefined>('127.0.0.1:7890');
  const [studioQuery, setStudioQuery] = useState('');

  const loadStatus = async () => {
    const auth = await api.checkAuth();
    setXAuthStatus({ isValid: auth.isValid, info: auth.info });
    setProxyStatus(auth.proxy);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSearchInStudio = (query: string) => {
    setStudioQuery(query);
    setActiveTab('studio');
  };

  const handleJumpToTweet = (_tweetIdOrHandle: string) => {
    setActiveTab('studio');
  };

  const handleGenerateDigestForTrend = (_topic: TrendTopic) => {
    setActiveTab('reports');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 68px Masthead Navigation Bar */}
      <Masthead
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        xAuthStatus={xAuthStatus}
        proxyStatus={proxyStatus}
      />

      {/* Primary Views (100% matched to prototype.html) */}
      {activeTab === 'reports' && <ReportsView onJumpToTweet={handleJumpToTweet} />}
      {activeTab === 'trends' && (
        <TrendsView
          onSearchInStudio={handleSearchInStudio}
          onGenerateDigestForTrend={handleGenerateDigestForTrend}
        />
      )}
      {activeTab === 'studio' && <StudioView initialSearchQuery={studioQuery} />}

      {/* Slide-over Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigUpdated={loadStatus}
      />
    </div>
  );
};
