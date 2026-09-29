import React from 'react';
import type { ActiveTab } from '../types.js';

interface MastheadProps {
  activeTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  xAuthStatus: { isValid: boolean; info?: string; screenName?: string };
  proxyStatus?: string;
}

export const Masthead: React.FC<MastheadProps> = ({
  onOpenSettings,
  xAuthStatus,
  proxyStatus,
}) => {
  const displayUser = xAuthStatus.screenName
    ? `@${xAuthStatus.screenName}`
    : xAuthStatus.info
    ? (xAuthStatus.info.startsWith('@') ? xAuthStatus.info : `@${xAuthStatus.info.replace('Twitter User ', '').replace(/^@/, '')}`)
    : '@cza55008';

  return (
    <header className="masthead">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="serif-title" style={{ fontSize: '22px', letterSpacing: '0.04em' }}>
            XTRACT
          </span>
          <span style={{ fontSize: '13px', color: 'var(--ink-soft)', fontWeight: 600 }}>
            情报工作台
          </span>
        </div>
      </div>

      {/* 右侧状态指示胶囊与设置触发器 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* X 登录会话胶囊 */}
        <div
          className={`badge ${xAuthStatus.isValid ? 'badge-ok' : 'badge-amber'}`}
          style={{ cursor: 'pointer', border: '1px solid var(--line)', padding: '4px 10px' }}
          onClick={onOpenSettings}
          title="点击查看账号设置"
        >
          <span className="badge-dot" />
          <span>{xAuthStatus.isValid ? displayUser : '未登录 X'}</span>
        </div>

        {/* 代理直连/穿透胶囊 */}
        <div
          className="badge badge-neutral"
          style={{ border: '1px solid var(--line)', padding: '4px 10px' }}
          title={proxyStatus ? '网络代理已配置' : '直连模式'}
        >
          <span>🛡️ {proxyStatus || '直连模式'}</span>
        </div>

        {/* 设置抽屉按钮 */}
        <button className="secondary-button" onClick={onOpenSettings}>
          <span>⚙️ 设置</span>
        </button>
      </div>
    </header>
  );
};
