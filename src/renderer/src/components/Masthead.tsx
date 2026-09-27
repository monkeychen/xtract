import React from 'react';
import { Newspaper, Flame, Box, Settings, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ActiveTab } from '../types.js';

interface MastheadProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  xAuthStatus: { isValid: boolean; info?: string };
  proxyStatus?: string;
}

export const Masthead: React.FC<MastheadProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
  xAuthStatus,
  proxyStatus,
}) => {
  return (
    <header className="masthead">
      {/* Brand & Eyebrow */}
      <div className="masthead-interactive" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span
              className="serif-title"
              style={{ fontSize: '22px', letterSpacing: '0.04em', cursor: 'pointer' }}
              onClick={() => onSelectTab('reports')}
            >
              XTRACT
            </span>
            <span className="eyebrow" style={{ fontSize: '10px' }}>
              INTELLIGENCE RADAR
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '-2px' }}>
            X 情报雷达 & AI 深度研报
          </span>
        </div>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '28px', background: 'var(--line)', margin: '0 8px' }} />

        {/* Primary Horizontal Navigation (§6.1) */}
        <nav style={{ display: 'flex', gap: '4px' }}>
          <div
            className={`masthead-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => onSelectTab('reports')}
          >
            <Newspaper size={16} />
            <span>智能研报</span>
          </div>

          <div
            className={`masthead-nav-item ${activeTab === 'trends' ? 'active' : ''}`}
            onClick={() => onSelectTab('trends')}
          >
            <Flame size={16} />
            <span>趋势雷达</span>
          </div>

          <div
            className={`masthead-nav-item ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => onSelectTab('studio')}
          >
            <Box size={16} />
            <span>情报工作台</span>
          </div>
        </nav>
      </div>

      {/* Right Controls & Status Capsules */}
      <div className="masthead-interactive" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* X Auth Capsule */}
        <div
          className="badge"
          style={{
            cursor: 'pointer',
            background: xAuthStatus.isValid ? 'var(--jade-wash)' : 'var(--amber-wash)',
            color: xAuthStatus.isValid ? 'var(--jade)' : 'var(--amber)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            fontSize: '12px',
          }}
          title={xAuthStatus.info || '点击配置 X 凭据'}
          onClick={onOpenSettings}
        >
          {xAuthStatus.isValid ? (
            <>
              <span className="badge-dot" style={{ background: 'var(--jade)' }} />
              <span>{xAuthStatus.info ? xAuthStatus.info.replace('Twitter User ', '') : 'X 会话有效'}</span>
            </>
          ) : (
            <>
              <AlertCircle size={12} />
              <span>未登录 X 会话</span>
            </>
          )}
        </div>

        {/* Proxy Bypass Capsule */}
        <div
          className="badge"
          style={{
            background: 'var(--paper-sunken)',
            color: 'var(--ink-soft)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            fontSize: '12px',
          }}
          title="代理设置"
        >
          <ShieldCheck size={12} style={{ color: 'var(--ink-faint)' }} />
          <span>{proxyStatus ? '代理已激活' : '直连模式'}</span>
        </div>

        {/* Settings Drawer Trigger Button */}
        <button
          className="secondary-button"
          onClick={onOpenSettings}
          style={{ padding: '6px 12px', fontSize: '13px' }}
          title="打开偏好设置抽屉"
        >
          <Settings size={15} />
          <span>偏好设置</span>
        </button>
      </div>
    </header>
  );
};
