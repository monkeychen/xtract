import React from 'react';
import type { XListInfo } from '../../types.js';
import type { CrawlProgress, DataSource } from './logic.js';

export interface StudioDataSourceBarProps {
  dataSource: DataSource;
  crawlLimit: number;
  crawlProgress: CrawlProgress | null;
  customListId: string;
  isLoading: boolean;
  isSyncingLists: boolean;
  minLikes: number;
  openMenu: string | null;
  searchQuery: string;
  selectedList: string;
  streamFilter: string;
  totalDbCount: number;
  userHandle: string;
  userLists: XListInfo[];
  onSwitchSource: (source: DataSource) => void;
  onCrawl: (source: DataSource) => void;
  onSyncOnlineLists: () => void;
  onSearchChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onStreamFilterChange: (value: string) => void;
  onCrawlLimitChange: (limit: number) => void;
  onMinLikesChange: (minLikes: number) => void;
  onOpenMenuChange: (menu: string | null) => void;
  onSelectedListChange: (listId: string) => void;
  onCustomListIdChange: (listId: string) => void;
  onReloadSearch: (query: string) => void;
  onReloadUser: (handle: string) => void;
  onReloadList: (cleanListId: string) => void;
}

/**
 * 顶栏：单行一体化智能工具条 (54px)。
 * 左侧四维数据源分段切换（关注流 / 博主追踪 / X 列表 / 全网搜索），
 * 中间为随数据源切换的上下文操作区，右侧为信噪比互动门槛药丸。
 */
export const StudioDataSourceBar: React.FC<StudioDataSourceBarProps> = ({
  dataSource, crawlLimit, crawlProgress, customListId, isLoading, isSyncingLists,
  minLikes, openMenu, searchQuery, selectedList, streamFilter, totalDbCount,
  userHandle, userLists,
  onSwitchSource, onCrawl, onSyncOnlineLists,
  onSearchChange, onUserChange, onStreamFilterChange,
  onCrawlLimitChange, onMinLikesChange, onOpenMenuChange,
  onSelectedListChange, onCustomListIdChange,
  onReloadSearch, onReloadUser, onReloadList,
}) => (
    <div
      style={{
        padding: '10px 24px',
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line-strong)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        minHeight: '54px',
      }}
    >
      {/* 左侧：数据源分段切换（顺序：关注流 → 博主追踪 → X 列表 → 全网搜索） */}
      <div id="studio-source-chips" style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
        <div
          id="chip-source-following"
          className={`fmt-chip ${dataSource === 'following' ? 'active' : ''}`}
          onClick={() => onSwitchSource('following')}
        >
          关注流
        </div>
        <div
          id="chip-source-user"
          className={`fmt-chip ${dataSource === 'user' ? 'active' : ''}`}
          onClick={() => onSwitchSource('user')}
        >
          博主追踪
        </div>
        <div
          id="chip-source-lists"
          className={`fmt-chip ${dataSource === 'lists' ? 'active' : ''}`}
          onClick={() => onSwitchSource('lists')}
        >
          X 列表
        </div>
        <div
          id="chip-source-search"
          className={`fmt-chip ${dataSource === 'search' ? 'active' : ''}`}
          onClick={() => onSwitchSource('search')}
        >
          全网搜索
        </div>
      </div>

      {/* 中间：自适应动态操作区 (按数据源切换) */}
      <div id="studio-context-zone" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        {/* 容器 1: 关注流操作区（与搜索/博主一致：先输入框、再抓取按钮，样式同源） */}
        {dataSource === 'following' && (
          <div id="zone-following" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <input
              id="stream-filter-input"
              className="text-input"
              style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
              type="text"
              placeholder="🔍 搜索关注流推文 (全库检索)..."
              value={streamFilter}
              onChange={(e) => onStreamFilterChange(e.target.value)}
            />
            <div className="split-btn-group">
              <button
                className="cta-button split-btn-main"
                onClick={() => onCrawl('following')}
                disabled={isLoading}
              >
                <span id="label-crawl-following">
                  {isLoading && crawlProgress?.source === 'following'
                    ? '⏳ 正在抓取...'
                    : `🔄 抓取最新 ${crawlLimit} 条`}
                </span>
              </button>
              <button
                className="cta-button split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMenuChange(openMenu === 'following' ? null : 'following');
                }}
              >
                <span>▾</span>
              </button>
              <div id="menu-following" className={`split-btn-menu ${openMenu === 'following' ? 'open' : ''}`}>
                <div
                  className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(20);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>20 条 · 日常极速 (~2秒)</span>
                  <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(50);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>50 条 · 近期汇总 (~6秒)</span>
                  <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(100);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>100 条 · 深度调研 (~15秒)</span>
                  <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 容器 2: 全网搜索操作区 */}
        {dataSource === 'search' && (
          <div id="zone-search" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <input
              id="search-query-input"
              className="text-input"
              style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
              type="text"
              placeholder="输入【关键词、推文链接或ID】即触发本地搜索"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onReloadSearch(e.currentTarget.value);
                }
              }}
            />
            <div className="split-btn-group">
              <button
                className="cta-button split-btn-main"
                onClick={() => onCrawl('search')}
                disabled={isLoading}
              >
                <span id="label-crawl-search">
                  {isLoading && crawlProgress?.source === 'search'
                    ? '⏳ 正在抓取...'
                    : `🔄 抓取最新 ${crawlLimit} 条`}
                </span>
              </button>
              <button
                className="cta-button split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMenuChange(openMenu === 'search' ? null : 'search');
                }}
              >
                <span>▾</span>
              </button>
              <div id="menu-search" className={`split-btn-menu ${openMenu === 'search' ? 'open' : ''}`}>
                <div
                  className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(20);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>20 条 · 快速搜索 (~2秒)</span>
                  <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(50);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>50 条 · 汇总搜索 (~6秒)</span>
                  <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(100);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>100 条 · 深度调研 (~15秒)</span>
                  <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 容器 3: 博主追踪操作区 */}
        {dataSource === 'user' && (
          <div id="zone-user" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <input
              id="user-handle-input"
              className="text-input"
              style={{ flex: 1, minWidth: '160px', fontSize: '13px' }}
              type="text"
              placeholder="输入【博主用户名或昵称】即触发本地搜索"
              value={userHandle}
              onChange={(e) => onUserChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const clean = e.currentTarget.value.trim().replace(/^@/, '');
                  onReloadUser(clean);
                }
              }}
            />
            <div className="split-btn-group">
              <button
                className="cta-button split-btn-main"
                onClick={() => onCrawl('user')}
                disabled={isLoading}
              >
                <span id="label-crawl-user">
                  {isLoading && crawlProgress?.source === 'user'
                    ? '⏳ 正在抓取...'
                    : `🔄 抓取最新 ${crawlLimit} 条`}
                </span>
              </button>
              <button
                className="cta-button split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMenuChange(openMenu === 'user' ? null : 'user');
                }}
              >
                <span>▾</span>
              </button>
              <div id="menu-user" className={`split-btn-menu ${openMenu === 'user' ? 'open' : ''}`}>
                <div
                  className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(20);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>20 条 · 最新推文 (~2秒)</span>
                  <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(50);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>50 条 · 近期主页 (~6秒)</span>
                  <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(100);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>100 条 · 历史全量 (~15秒)</span>
                  <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 容器 4: X 列表操作区 */}
        {dataSource === 'lists' && (
          <div id="zone-lists" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <select
              id="list-select"
              className="select-input"
              style={{ flex: 1, maxWidth: '260px', fontSize: '12.5px', padding: '6px 10px' }}
              value={selectedList}
              onChange={(e) => {
                const val = e.target.value;
                onSelectedListChange(val);
                if (val !== 'custom') {
                  onReloadList(val);
                }
              }}
            >
              {userLists.map((l) => (
                <option key={l.id} value={l.id}>
                  📑 {l.name} {l.member_count ? `(${l.member_count}人)` : ''}
                </option>
              ))}
              <option value="custom">+ 输入其他公开 List 链接...</option>
            </select>
            {selectedList === 'custom' && (
              <input
                id="custom-list-input"
                className="text-input"
                style={{ flex: 1, minWidth: '140px', fontSize: '12.5px', padding: '6px 10px' }}
                type="text"
                placeholder="输入 List ID 或链接 (回车搜索)..."
                value={customListId}
                onChange={(e) => {
                  const val = e.target.value;
                  onCustomListIdChange(val);
                  const match = val.match(/(\d{5,})/);
                  if (match) {
                    onReloadList(match[1]);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const match = customListId.match(/(\d{5,})/);
                    const clean = match ? match[1] : customListId.trim();
                    if (clean) onReloadList(clean);
                  }
                }}
              />
            )}
            <button
              className="secondary-button"
              style={{ fontSize: '12px', padding: '4px 8px', whiteSpace: 'nowrap' }}
              onClick={onSyncOnlineLists}
              disabled={isSyncingLists}
              title="从 X 线上同步账号自建与关注列表"
            >
              <span>{isSyncingLists ? '同步中...' : '☁️ 同步'}</span>
            </button>
            <span style={{ fontSize: '12px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>已存 {totalDbCount} 篇</span>
            <div className="split-btn-group">
              <button
                className="cta-button split-btn-main"
                onClick={() => onCrawl('lists')}
                disabled={isLoading}
              >
                <span id="label-crawl-lists">
                  {isLoading && crawlProgress?.source === 'lists'
                    ? '⏳ 正在抓取...'
                    : `🔄 抓取最新 ${crawlLimit} 条`}
                </span>
              </button>
              <button
                className="cta-button split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMenuChange(openMenu === 'lists' ? null : 'lists');
                }}
              >
                <span>▾</span>
              </button>
              <div id="menu-lists" className={`split-btn-menu ${openMenu === 'lists' ? 'open' : ''}`}>
                <div
                  className={`split-btn-item ${crawlLimit === 20 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(20);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>20 条 · 日常极速 (~2秒)</span>
                  <span className="limit-check">{crawlLimit === 20 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 50 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(50);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>50 条 · 近期汇总 (~6秒)</span>
                  <span className="limit-check">{crawlLimit === 50 ? '✓' : ''}</span>
                </div>
                <div
                  className={`split-btn-item ${crawlLimit === 100 ? 'active' : ''}`}
                  onClick={() => {
                    onCrawlLimitChange(100);
                    onOpenMenuChange(null);
                  }}
                >
                  <span>100 条 · 深度调研 (~15秒)</span>
                  <span className="limit-check">{crawlLimit === 100 ? '✓' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右侧：信噪比互动门槛药丸 */}
      <div style={{ display: 'flex', gap: '5px', flexShrink: 0, alignItems: 'center', borderLeft: '1px solid var(--line)', paddingLeft: '12px' }}>
        <div
          className={`fmt-chip ${minLikes === 0 ? 'active' : ''}`}
          onClick={() => onMinLikesChange(0)}
        >
          全部
        </div>
        <div
          className={`fmt-chip ${minLikes === 50 ? 'active' : ''}`}
          onClick={() => onMinLikesChange(50)}
        >
          50+ 赞
        </div>
        <div
          className={`fmt-chip ${minLikes === 200 ? 'active' : ''}`}
          onClick={() => onMinLikesChange(200)}
        >
          200+ 赞
        </div>
      </div>
    </div>
);
