import React, { useState } from 'react';
import { MOCK_REPORTS } from '../types.js';
import type { ReportItem, StreamEvent } from '../types.js';
import { api } from '../services/api.js';

interface ReportsViewProps {
  onJumpToTweet?: (tweetIdOrHandle: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onJumpToTweet }) => {
  const [reports, setReports] = useState<ReportItem[]>(MOCK_REPORTS);
  const [selectedReport, setSelectedReport] = useState<ReportItem>(MOCK_REPORTS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hours, setHours] = useState(24);
  const [thinkingText, setThinkingText] = useState('');
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [currentStageText, setCurrentStageText] = useState('');
  const [progress, setProgress] = useState(0);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedOutline, setCopiedOutline] = useState(false);

  const handleGenerate = async (type: 'daily' | 'trends') => {
    setIsGenerating(true);
    setThinkingText('正在聚类推特全网长推...\n- 议题 1: Claude 3.7 混合推理对全行业开发模式的冲击 (权重 0.88)\n- 议题 2: 端侧多模态模型在 Mac Studio 上的性能测试\n- 剔除无实质信息的闲聊灌水 32 篇，保留核心讨论 142 篇\n- 正在按照「核心论点 - 关键分歧 - 精选推文」结构生成研报...');
    setCurrentStageText(type === 'daily' ? '正在过滤本地 24h 高信噪比推文...' : '正在抓取全网热度趋势并提炼核心议题...');
    setProgress(15);

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
            title: `X 关注流每日早报：轻量化架构与高信噪比阅读工具`,
            category: 'following',
            date: new Date().toLocaleDateString(),
            timeSpan: `过去 ${hours} 小时`,
            tweetCount: 88,
            provider: 'gemini-3.8-flash',
            summary: '关注博主集中讨论了嵌入式 SQLite 与纯 Node.js/Electron 单进程在个人生产力工具中的卓越体验。',
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
            title: `技术趋势研报：Claude 3.7 混合推理与开源生态大洗牌`,
            category: 'tech',
            date: new Date().toLocaleDateString(),
            timeSpan: `过去 ${hours} 小时`,
            tweetCount: 142,
            provider: 'qwen3.8-flash',
            summary: '全网核心讨论围绕测试时计算（Test-time compute）与长思维链自检展开，多位一线核心开发者参与讨论。',
            markdownContent: res.content,
            filePath: res.reportPath,
          };
          setReports([newReport, ...reports]);
          setSelectedReport(newReport);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyFull = () => {
    if (selectedReport) {
      navigator.clipboard.writeText(selectedReport.markdownContent);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    }
  };

  const handleCopyOutline = () => {
    const outline = `【选题与培训便签 - ${selectedReport?.title}】\n` +
      `• 公众号: 《混合推理模型爆发：为什么测试时计算是今年的主战场？》\n` +
      `• 培训案例: 企业级私有 Agent 开发中，如何通过嵌入式 SQLite 与 Page Bundle 消除云依赖？`;
    navigator.clipboard.writeText(outline);
    setCopiedOutline(true);
    setTimeout(() => setCopiedOutline(false), 2000);
  };

  return (
    <main id="view-reports" className="view-container active" style={{ overflowY: 'auto', padding: '32px 48px 80px' }}>
      {/* 标题与操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px' }}>
        <div>
          <h1 className="serif-title" style={{ fontSize: '28px' }}>
            智能研报
          </h1>
          <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '4px' }}>
            过去 24 小时高价值情报汇总与深度研判
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 时间跨度选择药丸 */}
          <div style={{ display: 'flex', background: 'var(--paper-sunken)', borderRadius: '999px', padding: '2px' }}>
            <div
              className={`fmt-chip ${hours === 24 ? 'active' : ''}`}
              style={{ border: 'none', padding: '3px 10px', background: hours === 24 ? 'var(--paper-raised)' : 'transparent' }}
              onClick={() => setHours(24)}
            >
              24 小时
            </div>
            <div
              className={`fmt-chip ${hours === 72 ? 'active' : ''}`}
              style={{ border: 'none', padding: '3px 10px', background: hours === 72 ? 'var(--paper-raised)' : 'transparent' }}
              onClick={() => setHours(72)}
            >
              3 天
            </div>
            <div
              className={`fmt-chip ${hours === 168 ? 'active' : ''}`}
              style={{ border: 'none', padding: '3px 10px', background: hours === 168 ? 'var(--paper-raised)' : 'transparent' }}
              onClick={() => setHours(168)}
            >
              7 天
            </div>
          </div>

          <button className="secondary-button" onClick={() => handleGenerate('trends')} disabled={isGenerating}>
            <span>生成趋势研报</span>
          </button>
          <button className="cta-button" onClick={() => handleGenerate('daily')} disabled={isGenerating}>
            <span>生成今日早报</span>
          </button>
        </div>
      </div>

      {/* 实时流式生成态进度条与思考链演示区 (默认隐藏，点击生成后显现) */}
      {isGenerating && (
        <div id="generation-box" className="surface" style={{ padding: '20px 24px', marginBottom: '28px', borderLeft: '4px solid var(--cinnabar)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span id="gen-status-text" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--cinnabar)' }}>
              {currentStageText || '正在深度思考...'}
            </span>
            <span id="gen-progress-text" style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              进度 {progress}%
            </span>
          </div>

          {/* 进度条 (§7.6) */}
          <div style={{ height: '6px', background: 'var(--paper-sunken)', borderRadius: '999px', overflow: 'hidden', marginBottom: '14px' }}>
            <div
              id="gen-progress-bar"
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--cinnabar), var(--cinnabar-soft))',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* 校样稿思考链容器 (ThinkingBlock) */}
          <div className="thinking-box">
            <div className="thinking-header" onClick={() => setIsThinkingOpen(!isThinkingOpen)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="thinking-pulse-dot" />
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>思考过程</span>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>14s</span>
            </div>
            {isThinkingOpen && (
              <div id="thinking-body" className="thinking-body">
                {thinkingText || '正在聚类推特全网长推...\n- 议题 1: Claude 3.7 混合推理对全行业开发模式的冲击\n- 剔除无实质信息的闲聊灌水 32 篇，保留核心讨论 142 篇\n- 正在生成研报...'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 研报阅读主体：左侧历史归档 + 右侧 720px 精读版心 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
        {/* 左列：研报历史卡片网格 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 className="serif-title" style={{ fontSize: '16px' }}>
              历史研报
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>共 {reports.length} 份</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reports.map((item) => {
              const isSelected = selectedReport?.id === item.id;
              const isTech = item.category === 'tech';
              return (
                <div
                  key={item.id}
                  className="surface"
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--cinnabar)' : undefined,
                    background: isSelected ? 'var(--cinnabar-wash)' : 'var(--paper-raised)',
                  }}
                  onClick={() => setSelectedReport(item)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className={`badge ${isTech ? 'badge-cinnabar' : 'badge-ok'}`} style={{ fontSize: '11px' }}>
                      {isTech ? '趋势研报' : '关注流早报'}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>24 小时内</span>
                  </div>
                  <h4 className="serif-title" style={{ fontSize: '14.5px', lineHeight: '1.4', marginBottom: '6px' }}>
                    {item.title}
                  </h4>
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.45', marginBottom: '10px' }}>
                    {item.summary}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                    <span>{item.date}</span>
                    <span>{item.tweetCount} 篇{isTech ? '高赞推文' : '推文'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右列：720px 版心精读视图 (§6.4) */}
        <article className="surface" style={{ padding: '36px 48px', minHeight: '580px' }}>
          {selectedReport && (
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <div style={{ borderBottom: '1px solid var(--line-strong)', paddingBottom: '18px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-faint)', fontWeight: 500 }}>研报精读</span>
                  <button className="secondary-button" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={handleCopyFull}>
                    <span>{copiedFull ? '✓ 已复制全文' : '📋 复制全文'}</span>
                  </button>
                </div>
                <h2 id="report-detail-title" className="serif-title" style={{ fontSize: '26px', lineHeight: '1.3', marginBottom: '12px' }}>
                  {selectedReport.title}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                  <span>📅 {selectedReport.date}</span>
                  <span>•</span>
                  <span>{selectedReport.tweetCount} 篇推文</span>
                  <span>•</span>
                  <span className="badge badge-ok">{selectedReport.provider}</span>
                </div>
              </div>

              {/* 💡 选题与培训便签栏 */}
              <div className="surface" style={{ padding: '16px 20px', background: 'var(--paper-sunken)', borderLeft: '3px solid var(--cinnabar)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--cinnabar)' }}>💡 选题与培训便签</span>
                  <button className="secondary-button" style={{ fontSize: '11.5px', padding: '2px 8px' }} onClick={handleCopyOutline}>
                    <span>{copiedOutline ? '✓ 已复制大纲' : '📋 复制大纲'}</span>
                  </button>
                </div>
                <ul style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', paddingLeft: '18px' }}>
                  <li><strong>公众号</strong>: 《混合推理模型爆发：为什么测试时计算是今年的主战场？》</li>
                  <li><strong>培训案例</strong>: 企业级私有 Agent 开发中，如何通过嵌入式 SQLite 与 Page Bundle 消除云依赖？</li>
                </ul>
              </div>

              {/* 研报正文 */}
              <div id="report-detail-content" style={{ fontSize: '16px', lineHeight: '1.85', color: 'var(--ink)' }}>
                <h3 className="serif-title" style={{ fontSize: '20px', margin: '24px 0 12px', color: 'var(--ink)' }}>
                  一、核心研判：混合推理从研究走向工程落地
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  过去 24 小时内，全网核心开发者对大模型长思维链（Long-horizon CoT）在复杂软件工程场景下的落地表现进行了密集推演。多数团队达成共识：动态测试时算力（Dynamic Test-time Compute）是未来 12 个月应用层的关键分水岭。
                </p>
                <div style={{ borderLeft: '3px solid var(--cinnabar)', background: 'var(--paper-sunken)', padding: '12px 16px', margin: '18px 0', borderRadius: '0 6px 6px 0' }}>
                  <div style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '14.5px', marginBottom: '6px' }}>
                    "The shift from training compute to test-time compute changes how we evaluate model benchmarks completely. If your agent burns 60k tokens on a greeting, you're burning cash." — @karpathy
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="secondary-button"
                      style={{ fontSize: '11.5px', padding: '3px 8px', color: 'var(--cinnabar)' }}
                      onClick={() => onJumpToTweet?.('karpathy')}
                    >
                      <span>定位原推 ↗</span>
                    </button>
                  </div>
                </div>

                <h3 className="serif-title" style={{ fontSize: '20px', margin: '24px 0 12px', color: 'var(--ink)' }}>
                  二、端侧部署与本地去中心化存储
                </h3>
                <p>
                  面对不断攀升的云端 Token 成本，以 SQLite 嵌入式去重落库与 Page Bundle 本地离线归档为代表的极客工具在圈内广受好评。用户更加珍视自包含且不依赖外部封闭云的私有情报资产。
                </p>
              </div>
            </div>
          )}
        </article>
      </div>
    </main>
  );
};
