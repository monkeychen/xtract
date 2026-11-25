import React from 'react';
import type { BatchExportMode } from '../../types.js';

export interface BatchActionBarProps {
  selectedCount: number;
  onExport: () => void;
  onRequestDelete: () => void;
  onClearSelection: () => void;
}

/** 底部浮动批量操作条 (§7.7)：仅在有勾选时出现。 */
export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  onExport,
  onRequestDelete,
  onClearSelection,
}) => (
  <div id="selbar" className="selbar">
    <span id="selbar-count" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--cinnabar)' }}>
      已选 {selectedCount} 篇
    </span>
    <button
      id="btn-batch-export"
      className="secondary-button"
      style={{ padding: '4px 12px', fontSize: '12px' }}
      onClick={onExport}
    >
      <span>导出 Markdown</span>
    </button>
    <button
      id="btn-batch-delete"
      className="cta-button"
      style={{ padding: '4px 14px', fontSize: '12px' }}
      onClick={onRequestDelete}
    >
      <span>删除所选</span>
    </button>
    <button
      className="secondary-button"
      style={{ padding: '4px 10px', fontSize: '12px', border: 'none', background: 'transparent' }}
      onClick={onClearSelection}
    >
      <span>取消</span>
    </button>
  </div>
);

export interface BatchDeleteDialogProps {
  selectedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 批量删除二次确认：数据库记录与磁盘归档目录的物理销毁均不可恢复。 */
export const BatchDeleteDialog: React.FC<BatchDeleteDialogProps> = ({
  selectedCount,
  onCancel,
  onConfirm,
}) => (
  <div id="batch-delete-dialog" className="drawer-backdrop" onClick={onCancel}>
    <div
      className="surface"
      style={{ width: '420px', padding: '24px', margin: 'auto', background: 'var(--paper-raised)', border: '1px solid var(--line-strong)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="serif-title" style={{ fontSize: '17px', color: 'var(--cinnabar)', marginBottom: '10px' }}>
        确认批量删除推文？
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
        将从本地 SQLite 数据库与磁盘归档目录中彻底物理删除选中的 <strong>{selectedCount}</strong> 篇推文及其配图文件，此操作不可恢复。
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button className="secondary-button" onClick={onCancel}>
          取消
        </button>
        <button id="btn-confirm-batch-delete" className="cta-button" onClick={onConfirm}>
          确认删除 ({selectedCount})
        </button>
      </div>
    </div>
  </div>
);

export interface DeleteDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/** 单篇推文删除二次确认。 */
export const DeleteDialog: React.FC<DeleteDialogProps> = ({ onCancel, onConfirm }) => (
  <div id="delete-dialog" className="drawer-backdrop" onClick={onCancel}>
    <div
      className="surface"
      style={{ width: '400px', padding: '24px', margin: 'auto', background: 'var(--paper-raised)', border: '1px solid var(--line-strong)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="serif-title" style={{ fontSize: '17px', color: 'var(--cinnabar)', marginBottom: '10px' }}>
        确认删除推文？
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
        将从本地数据库与归档目录中彻底删除该推文及配图，不可恢复。
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button className="secondary-button" onClick={onCancel}>
          取消
        </button>
        <button className="cta-button" onClick={onConfirm}>
          删除
        </button>
      </div>
    </div>
  </div>
);

export interface BatchExportDialogProps {
  selectedCount: number;
  mode: BatchExportMode;
  targetDir: string;
  autoDownloadVideos: boolean;
  isExporting: boolean;
  progress: { text: string; percent: number } | null;
  onModeChange: (mode: BatchExportMode) => void;
  onSelectDir: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 批量导出 Markdown 配置弹窗（v0.1.5）：支持导出至指定目录、可选合并为单一目录或按篇独立目录。 */
export const BatchExportDialog: React.FC<BatchExportDialogProps> = ({
  selectedCount,
  mode,
  targetDir,
  autoDownloadVideos,
  isExporting,
  progress,
  onModeChange,
  onSelectDir,
  onCancel,
  onConfirm,
}) => (
  <div
    id="batch-export-dialog"
    className="drawer-backdrop"
    onClick={() => {
      if (!isExporting) onCancel();
    }}
  >
    <div
      className="surface"
      style={{
        width: '460px',
        padding: '24px',
        margin: 'auto',
        background: 'var(--paper-raised)',
        border: '1px solid var(--line-strong)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="serif-title" style={{ fontSize: '17px', color: 'var(--ink)', marginBottom: '16px' }}>
        导出 Markdown（已选 {selectedCount} 篇）
      </h3>

      {/* 导出结构选择 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '8px' }}>
          导出结构
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            id="export-mode-merged"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '6px',
              border: `1px solid ${mode === 'merged' ? 'var(--ink)' : 'var(--line)'}`,
              background: mode === 'merged' ? 'var(--paper)' : 'transparent',
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="radio"
              name="batch-export-mode"
              value="merged"
              checked={mode === 'merged'}
              disabled={isExporting}
              onChange={() => onModeChange('merged')}
              style={{ marginTop: '2px' }}
            />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>合并为单一目录</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>
                生成 1 份合并 index.md 与统一素材子目录（images/、videos/）
              </div>
            </div>
          </label>
          <label
            id="export-mode-separate"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '6px',
              border: `1px solid ${mode === 'separate' ? 'var(--ink)' : 'var(--line)'}`,
              background: mode === 'separate' ? 'var(--paper)' : 'transparent',
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="radio"
              name="batch-export-mode"
              value="separate"
              checked={mode === 'separate'}
              disabled={isExporting}
              onChange={() => onModeChange('separate')}
              style={{ marginTop: '2px' }}
            />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>按篇独立目录</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>
                每篇生成独立 {'{作者}_{ID}/'} 目录，扁平存放在目标文件夹内
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 目标目录选择 */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '6px' }}>
          导出位置
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            id="export-target-dir-input"
            type="text"
            readOnly
            className="text-input"
            style={{ flex: 1, fontSize: '12px', color: targetDir ? 'var(--ink)' : 'var(--ink-faint)' }}
            value={targetDir}
            placeholder="点击右侧选择目录（或点下方导出时自动选择）"
          />
          <button
            id="btn-select-export-dir"
            type="button"
            className="secondary-button"
            style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
            onClick={onSelectDir}
            disabled={isExporting}
          >
            选择目录…
          </button>
        </div>
      </div>

      {/* 当前设置状态条（状态信息常驻可见） */}
      <div
        id="export-video-policy-status"
        style={{
          fontSize: '11.5px',
          color: 'var(--ink-faint)',
          marginBottom: isExporting ? '12px' : '20px',
        }}
      >
        缺全文将自动静默补齐 · 视频策略：{autoDownloadVideos ? '同步下载至 videos/（来自设置）' : '仅保留原视频链接（来自设置）'}
      </div>

      {/* 导出实时进度条 */}
      {isExporting && (
        <div id="batch-export-progress" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '6px' }}>
            <span>{progress?.text || '正在准备导出...'}</span>
            <span>{progress?.percent ?? 10}%</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress?.percent ?? 10}%`,
                height: '100%',
                background: 'var(--cinnabar)',
                transition: 'width 0.3s ease-out',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button className="secondary-button" onClick={onCancel} disabled={isExporting}>
          取消
        </button>
        <button id="btn-confirm-batch-export" className="cta-button" onClick={onConfirm} disabled={isExporting}>
          {isExporting ? '正在导出...' : `开始导出 (${selectedCount})`}
        </button>
      </div>
    </div>
  </div>
);
