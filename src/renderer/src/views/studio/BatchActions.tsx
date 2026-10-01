import React from 'react';

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
    <button className="secondary-button" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={onExport}>
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
