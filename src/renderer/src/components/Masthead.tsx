import React from 'react';
import type { ActiveTab } from '../types.js';

interface MastheadProps {
  activeTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  xAuthStatus?: { isValid: boolean; info?: string; screenName?: string };
  proxyStatus?: string;
}

export const Masthead: React.FC<MastheadProps> = ({
  onOpenSettings,
}) => {
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

      {/* 右侧设置触发器 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="secondary-button" onClick={onOpenSettings}>
          <span>⚙️ 设置</span>
        </button>
      </div>
    </header>
  );
};
