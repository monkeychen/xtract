import React, { useState, useEffect } from 'react';
import type { TrendTopic } from '../types.js';
import { api } from '../services/api.js';

interface TrendsViewProps {
  onSearchInStudio: (query: string) => void;
  onGenerateDigestForTrend: (topic: TrendTopic) => void;
}

export const TrendsView: React.FC<TrendsViewProps> = ({
  onSearchInStudio,
  onGenerateDigestForTrend,
}) => {
  const [category, setCategory] = useState<'tech' | 'all' | 'business' | 'news' | 'entertainment'>('tech');
  const [trends, setTrends] = useState<TrendTopic[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTrends = async (cat: string) => {
    setIsLoading(true);
    try {
      const data = await api.getTrends(cat, 12);
      setTrends(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends(category);
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
      {/* 标题 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h1 className="serif-title" style={{ fontSize: '28px' }}>
            全网趋势
          </h1>
          <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '4px' }}>
            当前 X 热门议题与讨论聚合
          </p>
        </div>

        <button className="secondary-button" onClick={() => fetchTrends(category)} disabled={isLoading}>
          <span>{isLoading ? '🔄 正在刷新...' : '🔄 刷新'}</span>
        </button>
      </div>

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
                  onClick={() => onSearchInStudio(trend.query || trend.name)}
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
