import React, { useState, useEffect } from 'react';
import { Masthead } from './components/Masthead.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { ReportsView } from './views/ReportsView.js';
import { TrendsView } from './views/TrendsView.js';
import { StudioView } from './views/StudioView.js';
import type { ActiveTab, TrendTopic, StudioJumpAction, ReportJumpAction } from './types.js';
import { api } from './services/api.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('reports');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [xAuthStatus, setXAuthStatus] = useState<{ isValid: boolean; info?: string; screenName?: string }>({
    isValid: true,
    info: '@cza55008',
    screenName: 'cza55008',
  });
  const [proxyStatus, setProxyStatus] = useState<string | undefined>('127.0.0.1:7890');
  const [studioAction, setStudioAction] = useState<StudioJumpAction | null>(null);
  const [reportAction, setReportAction] = useState<ReportJumpAction | null>(null);

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

  const handleSearchInStudio = (query: string, _trend?: TrendTopic) => {
    setStudioAction({
      query,
      autoFetch: true,
      timestamp: Date.now(),
    });
    setActiveTab('studio');
  };

  const handleJumpToTweet = (tweetIdOrHandle: string) => {
    setStudioAction({
      query: tweetIdOrHandle,
      autoFetch: false,
      timestamp: Date.now(),
    });
    setActiveTab('studio');
  };

  const handleGenerateDigestForTrend = (topic: TrendTopic) => {
    setReportAction({
      type: 'trends',
      category: topic.category || 'tech',
      topic,
      timestamp: Date.now(),
    });
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
      {activeTab === 'reports' && (
        <ReportsView
          onJumpToTweet={handleJumpToTweet}
          initialAction={reportAction}
        />
      )}
      {activeTab === 'trends' && (
        <TrendsView
          onSearchInStudio={handleSearchInStudio}
          onGenerateDigestForTrend={handleGenerateDigestForTrend}
        />
      )}
      {activeTab === 'studio' && (
        <StudioView
          jumpAction={studioAction}
          initialSearchQuery={studioAction?.query || ''}
        />
      )}

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
