import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Clock } from 'lucide-react';

interface ThinkingBlockProps {
  thinkingText?: string;
  isThinking: boolean;
  elapsedSeconds?: number;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  thinkingText = '',
  isThinking,
  elapsedSeconds = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!thinkingText && !isThinking) return null;

  return (
    <div className="thinking-box fade-in">
      <div
        className="thinking-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Brain size={14} style={{ color: 'var(--cinnabar)' }} />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {isThinking ? 'AI 正在深度思考与多角度研判...' : '思考推演链记录 (High Reasoning)'}
          </span>
          {isThinking && <span className="thinking-pulse-dot" />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', color: 'var(--ink-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            <span>{elapsedSeconds > 0 ? `${elapsedSeconds}s` : '实时'}</span>
          </div>
          <span style={{ color: 'var(--ink-faint)' }}>{isExpanded ? '点击折叠' : '展开详情'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="thinking-body">
          {thinkingText || (isThinking ? '正在分析推文多维互动指数与技术核心实体...' : '无详细思考文本。')}
        </div>
      )}
    </div>
  );
};
