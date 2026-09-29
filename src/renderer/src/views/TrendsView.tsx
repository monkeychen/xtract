import React, { useState, useEffect } from 'react';
import type { TrendTopic } from '../types.js';
import { api } from '../services/api.js';

interface TrendsViewProps {
  onSearchInStudio: (query: string, trend?: TrendTopic) => void;
  onGenerateDigestForTrend: (topic: TrendTopic) => void;
}

export function getCleanTrendSearchTerm(trend: TrendTopic): string {
  const raw = trend.name || trend.query || '';
  // 过滤推特搜索专有语法（如 lang:en, since:2026-xx, min_faves:xx 等）
  let cleaned = raw
    .replace(/\b(lang|since|until|min_faves|min_retweets|filter|url):[^\s]+/gi, '')
    .replace(/["“”'‘’]/g, ' ')
    .replace(/^#+/, '')
    .trim();
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || (trend.name || '').replace(/^#+/, '').trim() || trend.name;
}

export const TrendsView: React.FC<TrendsViewProps> = ({
  onSearchInStudio,
  onGenerateDigestForTrend,
}) => {
  const [category, setCategory] = useState<'tech' | 'all' | 'business' | 'news' | 'entertainment'>('tech');
  const [trends, setTrends] = useState<TrendTopic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(true);

  const formatTime = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const loadTrends = async (cat: string, refresh = false) => {
    setIsLoading(true);
    try {
      const data = await api.getTrends(cat, { top: 12, refresh });
      setTrends(data);
      setLastUpdated(data.updatedAt || null);
      setIsFromCache(Boolean(data.fromCache));
    } finally {
      setIsLoading(false);
    }
  };

  // On category switch, load cached data immediately without hitting the network
  useEffect(() => {
    loadTrends(category, false);
  }, [category]);

  const categories = [
    { id: 'tech', label: '科技' },
    { id: 'all', label: '综合' },
    { id: 'business', label: '商业' },
    { id: 'news', label: '要闻' },
    { id: 'entertainment', label: '文娱' },
  ] as const;

  return (
    <main id="view-trends" className="view-container" style={{ overflowY: 'auto', padding: '32px 48px 80px' }}>
      {/* 标题与缓存状态 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="serif-title" style={{ fontSize: '28px' }}>
              全网趋势
            </h1>
            {lastUpdated && (
              <span
                style={{
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isFromCache ? 'var(--paper-sunken)' : 'rgba(34, 197, 94, 0.1)',
                  color: isFromCache ? 'var(--ink-soft)' : '#16a34a',
                  border: '1px solid var(--line)',
                }}
              >
                {isFromCache ? `📦 本地缓存 (${formatTime(lastUpdated)})` : '⚡ 实时数据'}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '4px' }}>
            {trends.length > 0
              ? '已优先载入本地缓存趋势，可随时点击右侧按需刷新全网实时流'
              : '当前分类暂无本地缓存数据'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="secondary-button"
            onClick={() => loadTrends(category, true)}
            disabled={isLoading}
            title="通过真实浏览器向 X 发起实时拦截抓取"
          >
            <span>{isLoading ? '🔄 正在从 X 抓取...' : '🔄 刷新实时数据'}</span>
          </button>
        </div>
      </div>

      {/* 实时抓取提示横幅 */}
      {isLoading && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '20px',
            background: 'var(--paper-sunken)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--ink)',
          }}
        >
          <span style={{ fontSize: '16px' }}>⏳</span>
          <div>
            <strong>正在安全连接 X (Explore Trends) 网络流...</strong>
            <span style={{ color: 'var(--ink-soft)', marginLeft: '8px' }}>
              真实浏览器正在监听官方流，避免触发封控限制，大约需要 3-5 秒
            </span>
          </div>
        </div>
      )}

      {/* 分类药丸 (§7.4) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '26px' }}>
        {categories.map((item) => (
          <div
            key={item.id}
            className={`fmt-chip ${category === item.id ? 'active' : ''}`}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* 无缓存空状态 */}
      {trends.length === 0 && !isLoading && (
        <div
          className="surface"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--ink-soft)',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--line-strong)',
            marginBottom: '32px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📡</div>
          <h3 className="serif-title" style={{ fontSize: '18px', color: 'var(--ink)', marginBottom: '8px' }}>
            本地暂无【{categories.find((c) => c.id === category)?.label}】分类趋势缓存
          </h3>
          <p style={{ fontSize: '13px', marginBottom: '20px', maxWidth: '440px', margin: '0 auto 20px', lineHeight: '1.6' }}>
            系统遵循「本地优先」原则，默认不后台自动发起抓取。点击下方按钮即可连接 X 官方接口拉取最新实时热点榜单。
          </p>
          <button className="cta-button" onClick={() => loadTrends(category, true)} style={{ margin: '0 auto' }}>
            <span>⚡ 立即从 X 抓取最新趋势</span>
          </button>
        </div>
      )}

      {/* 趋势卡片网格 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '20px',
        }}
      >
        {trends.map((trend, index) => {
          const rank = String(trend.rank || index + 1).padStart(2, '0');
          return (
            <div
              key={trend.name + index}
              className="surface"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="serif-title" style={{ fontSize: '22px', color: 'var(--cinnabar)' }}>
                    #{rank}
                  </span>
                  <span className="badge badge-cinnabar">{trend.tweet_count || '100K+ 推文'}</span>
                </div>
                <h3 className="serif-title" style={{ fontSize: '18px', marginBottom: '8px' }}>
                  {trend.name}
                </h3>
                <div
                  style={{
                    background: 'var(--paper-sunken)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-soft)',
                    marginBottom: '16px',
                    wordBreak: 'break-all',
                  }}
                >
                  {trend.query || `"${trend.name}" lang:en`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                <button
                  className="secondary-button"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => onSearchInStudio(getCleanTrendSearchTerm(trend), trend)}
                >
                  <span>查看推文</span>
                </button>
                <button
                  className="cta-button"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => onGenerateDigestForTrend(trend)}
                >
                  <span>生成研报</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
};
