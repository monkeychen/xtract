import React, { useState } from 'react';
import { Sparkles, Calendar, FileText, Copy, ExternalLink, RefreshCw, Layers } from 'lucide-react';
import { ThinkingBlock } from '../components/ThinkingBlock.js';
import { MOCK_REPORTS } from '../types.js';
import type { ReportItem, StreamEvent } from '../types.js';
import { api } from '../services/api.js';

export const ReportsView: React.FC = () => {
  const [reports, setReports] = useState<ReportItem[]>(MOCK_REPORTS);
  const [selectedReport, setSelectedReport] = useState<ReportItem>(MOCK_REPORTS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<'daily' | 'trends' | null>(null);
  const [hours, setHours] = useState(24);
  const [thinkingText, setThinkingText] = useState('');
  const [currentStageText, setCurrentStageText] = useState('');
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (type: 'daily' | 'trends') => {
    setIsGenerating(true);
    setGeneratingType(type);
    setThinkingText('');
    setCurrentStageText('正在初始化任务...');
    setProgress(5);

    const onProgress = (evt: StreamEvent) => {
      if (evt.type === 'reasoning' && evt.text) {
        setThinkingText((prev) => prev + '\n' + evt.text);
      } else if (evt.text) {
        setCurrentStageText(evt.text);
      }
      if (evt.progress) {
        setProgress(evt.progress);
      }
    };

    try {
      if (type === 'daily') {
        const res = await api.generateDailyDigest({ hours, minLikes: 50 }, onProgress);
        if (res.success && res.content) {
          const newReport: ReportItem = {
            id: 'rep-' + Date.now(),
            title: `X 关注流每日深度早报 (${new Date().toLocaleDateString()})`,
            category: 'following',
            date: new Date().toLocaleString(),
            timeSpan: `过去 ${hours} 小时`,
            tweetCount: 95,
            provider: 'gemini-3.8-flash',
            summary: '自动从关注流提取高信噪比核心讨论，完成结构化归纳。',
            markdownContent: res.content,
            filePath: res.reportPath,
          };
          setReports([newReport, ...reports]);
          setSelectedReport(newReport);
        }
      } else {
        const res = await api.generateTrendsDigest({ category: 'tech', hours, top: 10, minLikes: 50 }, onProgress);
        if (res.success && res.content) {
          const newReport: ReportItem = {
            id: 'rep-trend-' + Date.now(),
            title: `全网趋势深度研报 (${new Date().toLocaleDateString()})`,
            category: 'tech',
            date: new Date().toLocaleString(),
            timeSpan: `过去 ${hours} 小时`,
            tweetCount: 160,
            provider: 'qwen3.8-flash',
            summary: '全网突发热点聚类研判完成，已提取核心争议与技术洞见。',
            markdownContent: res.content,
            filePath: res.reportPath,
          };
          setReports([newReport, ...reports]);
          setSelectedReport(newReport);
        }
      }
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const handleCopyMarkdown = () => {
    if (selectedReport) {
      navigator.clipboard.writeText(selectedReport.markdownContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 68px)', overflowY: 'auto', padding: '32px 48px 80px' }} className="fade-in">
      {/* Page Header (§6.2) */}
      <div style={{ marginBottom: '28px' }}>
        <div className="eyebrow" style={{ marginBottom: '4px' }}>
          INTELLIGENCE DIGEST & SYNTHESIS
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="serif-title" style={{ fontSize: '28px', color: 'var(--ink)' }}>
              智能研报与深度晨报
            </h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '4px' }}>
              基于信噪比过滤与多大模型 High 级长思维链推演，提取 X 上最具价值的商业与技术情报。
            </p>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', background: 'var(--paper-sunken)', borderRadius: '999px', padding: '2px' }}>
              <button
                className={`fmt-chip ${hours === 24 ? 'active' : ''}`}
                style={{ border: 'none', background: hours === 24 ? 'var(--paper-raised)' : 'transparent' }}
                onClick={() => setHours(24)}
              >
                24 小时
              </button>
              <button
                className={`fmt-chip ${hours === 72 ? 'active' : ''}`}
                style={{ border: 'none', background: hours === 72 ? 'var(--paper-raised)' : 'transparent' }}
                onClick={() => setHours(72)}
              >
                3 天
              </button>
              <button
                className={`fmt-chip ${hours === 168 ? 'active' : ''}`}
                style={{ border: 'none', background: hours === 168 ? 'var(--paper-raised)' : 'transparent' }}
                onClick={() => setHours(168)}
              >
                7 天
              </button>
            </div>

            <button
              className="secondary-button"
              onClick={() => handleGenerate('trends')}
              disabled={isGenerating}
            >
              <Sparkles size={15} style={{ color: 'var(--cinnabar)' }} />
              <span>生成全网趋势研报</span>
            </button>

            <button
              className="cta-button"
              onClick={() => handleGenerate('daily')}
              disabled={isGenerating}
            >
              <RefreshCw size={15} className={isGenerating && generatingType === 'daily' ? 'animate-spin' : ''} />
              <span>立即生成今日早报</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Generation Progress Area (§7.6) */}
      {isGenerating && (
        <div className="surface" style={{ padding: '20px 24px', marginBottom: '28px', borderLeft: '4px solid var(--cinnabar)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--cinnabar)' }}>
              {currentStageText || '正在调度大模型流式分析中...'}
            </span>
            <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              进度 {progress}%
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: '6px', background: 'var(--paper-sunken)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--cinnabar), var(--cinnabar-soft))',
                transition: 'width 0.35s ease',
              }}
            />
          </div>

          {/* Galley Proof Thinking Box */}
          <ThinkingBlock
            isThinking={isGenerating}
            thinkingText={thinkingText}
            elapsedSeconds={Math.round(progress / 5)}
          />
        </div>
      )}

      {/* Main Layout: History Grid + Selected Report Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
        {/* Left Column: Historical Reports Archive */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Layers size={16} style={{ color: 'var(--cinnabar)' }} />
            <h3 className="serif-title" style={{ fontSize: '16px' }}>
              研报归档列表
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>({reports.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reports.map((item) => {
              const isSelected = selectedReport?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`surface surface-hover ${isSelected ? 'selected' : ''}`}
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--cinnabar)' : undefined,
                    background: isSelected ? 'var(--cinnabar-wash)' : 'var(--paper-raised)',
                  }}
                  onClick={() => setSelectedReport(item)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="badge badge-cinnabar" style={{ fontSize: '11px', padding: '1px 8px' }}>
                      {item.category === 'tech' ? '🔥 趋势研报' : '🌅 关注流早报'}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                      {item.timeSpan}
                    </span>
                  </div>

                  <h4
                    className="serif-title"
                    style={{
                      fontSize: '14.5px',
                      lineHeight: '1.4',
                      marginBottom: '8px',
                      color: 'var(--ink)',
                    }}
                  >
                    {item.title}
                  </h4>

                  <p
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--ink-soft)',
                      lineHeight: '1.5',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: '10px',
                    }}
                  >
                    {item.summary}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                    <span>{item.date}</span>
                    <span>覆盖 {item.tweetCount} 篇推文</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Report Reading View (720px Center-spread §6.4) */}
        <div
          className="surface"
          style={{
            padding: '36px 44px',
            background: 'var(--paper-raised)',
            minHeight: '600px',
          }}
        >
          {selectedReport ? (
            <article style={{ maxWidth: '720px', margin: '0 auto' }}>
              {/* Reading Header */}
              <div style={{ borderBottom: '1px solid var(--line-strong)', paddingBottom: '20px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="eyebrow">XTRACT INTELLIGENCE PUBLICATION</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="secondary-button" onClick={handleCopyMarkdown} style={{ fontSize: '12px', padding: '4px 10px' }}>
                      <Copy size={13} />
                      <span>{copied ? '已复制 Markdown' : '复制全文'}</span>
                    </button>
                    {selectedReport.filePath && (
                      <div className="badge badge-neutral" style={{ fontSize: '11px' }}>
                        <FileText size={12} />
                        <span>已落盘归档</span>
                      </div>
                    )}
                  </div>
                </div>

                <h1 className="serif-title" style={{ fontSize: '26px', lineHeight: '1.3', marginBottom: '12px' }}>
                  {selectedReport.title}
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--ink-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={14} />
                    <span>{selectedReport.date}</span>
                  </div>
                  <span>•</span>
                  <span>覆盖高信噪比推文: {selectedReport.tweetCount} 篇</span>
                  <span>•</span>
                  <span className="badge badge-ok">{selectedReport.provider}</span>
                </div>
              </div>

              {/* Formatted Markdown Content */}
              <div
                style={{
                  fontSize: '15.5px',
                  lineHeight: '1.8',
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {selectedReport.markdownContent}
              </div>
            </article>
          ) : (
            <div className="empty-state">
              <div className="empty-stamp">🗞️</div>
              <div className="empty-title">暂未选择研报</div>
              <div className="empty-desc">请从左侧列表中选择一份既往研报，或点击右上角按钮即时生成最新深度研报。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
