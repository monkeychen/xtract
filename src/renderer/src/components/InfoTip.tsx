import React, { useEffect, useRef, useState } from 'react';

export interface InfoTipProps {
  /** 提示正文。遵循宪法「界面克制原则」：应自解释、简短，不堆砌多段。 */
  text: string;
  /** 无障碍标签，同时作为图标 title */
  label?: string;
}

/**
 * 轻量信息提示：标题旁的小 `i` 图标，仅在 hover / focus / 点击时展示。
 *
 * 依据工程宪法「用户体验最高准则 → 界面克制原则」：
 * 说明性文字默认不占据常驻版面，收敛到此处按需浮出。
 * 状态类信息（连接状态、操作结果、错误）不属于本组件的适用范围，
 * 那些必须常驻可见。
 */
export const InfoTip: React.FC<InfoTipProps> = ({ text, label = '说明' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  // 点击外部关闭：避免浮层在页面别处操作后仍悬挂
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', marginLeft: '5px', verticalAlign: 'middle' }}>
      {/* 用 span role=button 而非真 button：InfoTip 常嵌在 cta-button 内，HTML 禁止 button 嵌套 */}
      <span
        role="button"
        tabIndex={0}
        className="info-tip-trigger"
        aria-label={`${label}：${text}`}
        aria-expanded={open}
        title={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
      >
        i
      </span>
      {open && (
        <span className="info-tip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
};
