import React, { useState, useEffect } from 'react';
import { Flame, RefreshCw, Sparkles, Search, TrendingUp } from 'lucide-react';
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
  const [category, setCategory] = useState('tech');
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

  return (
    <div style={{ height: 'calc(100vh - 68px)', overflowY: 'auto', padding: '32px 48px 80px' }} className="fade-in">
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <div className="eyebrow" style={{ marginBottom: '4px' }}>
          EXPLORE TRENDS DISCOVERY
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="serif-title" style={{ fontSize: '28px', color: 'var(--ink)' }}>
              全网热点趋势雷达
            </h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '4px' }}>
              无需前置设定关键词，全自动嗅探 X 全网高互动热门议题，通过大模型提炼核心搜索实体。
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() => fetchTrends(category)}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? '正在嗅探趋势...' : '刷新全网趋势'}</span>
          </button>
        </div>
      </div>

      {/* Category Pills Filter (§7.4) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        {[
          { id: 'tech', label: '科技前沿 (Tech)' },
          { id: 'all', label: '全网综合 (All Trends)' },
          { id: 'business', label: '商业金融 (Business)' },
          { id: 'news', label: '全球要闻 (News)' },
          { id: 'entertainment', label: '文娱体育 (Entertainment)' },
        ].map((item) => (
          <button
            key={item.id}
            className={`fmt-chip ${category === item.id ? 'active' : ''}`}
            onClick={() => setCategory(item.id)}
          >
            {category === item.id && <Flame size={13} style={{ color: 'var(--cinnabar)' }} />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Trends Grid */}
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
              className="surface surface-hover"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div>
                {/* Card Top: Rank & Volume */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className="serif-title"
                      style={{
                        fontSize: '20px',
                        color: index < 3 ? 'var(--cinnabar)' : 'var(--ink-faint)',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      #{rank}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                      <TrendingUp size={12} style={{ color: 'var(--cinnabar)' }} />
                      <span>{trend.category || category}</span>
                    </span>
                  </div>

                  <span className="badge badge-cinnabar" style={{ fontSize: '11.5px' }}>
                    {trend.tweet_count || '热门热议'}
                  </span>
                </div>

                {/* Topic Name */}
                <h3
                  className="serif-title"
                  style={{
                    fontSize: '17px',
                    color: 'var(--ink)',
                    marginBottom: '10px',
                    lineHeight: '1.35',
                  }}
                >
                  {trend.name}
                </h3>

                {/* Refined Search Query */}
                {trend.query && (
                  <div
                    style={{
                      background: 'var(--paper-sunken)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: 'var(--ink-soft)',
                      fontFamily: 'var(--font-mono)',
                      wordBreak: 'break-all',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)', marginBottom: '2px', textTransform: 'uppercase' }}>
                      AI 提炼检索短语:
                    </div>
                    {trend.query}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--line)',
                }}
              >
                <button
                  className="secondary-button"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '12.5px', justifyContent: 'center' }}
                  onClick={() => onSearchInStudio(trend.query || trend.name)}
                >
                  <Search size={13} />
                  <span>查看推文</span>
                </button>

                <button
                  className="cta-button"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '12.5px', justifyContent: 'center' }}
                  onClick={() => onGenerateDigestForTrend(trend)}
                >
                  <Sparkles size={13} />
                  <span>生成研报</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
