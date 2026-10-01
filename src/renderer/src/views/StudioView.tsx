import React from 'react';
import { useStudioData } from './studio/useStudioData.js';
import { StudioDataSourceBar } from './studio/StudioDataSourceBar.js';
import { TweetListPane } from './studio/TweetListPane.js';
import { TweetDetailPane } from './studio/TweetDetailPane.js';
import { BatchActionBar, BatchDeleteDialog, DeleteDialog } from './studio/BatchActions.js';
import { ImageLightbox } from './studio/ImageLightbox.js';

interface StudioViewProps {
  initialSearchQuery?: string;
  jumpAction?: import('../types.js').StudioJumpAction | null;
}

/**
 * XTRACT 情报工作台（Master-Detail 双栏视窗）。
 *
 * 本组件只负责布局：所有状态与业务编排由 useStudioData 提供，
 * 展示逻辑拆分为 views/studio/ 下的独立模块。
 */
export const StudioView: React.FC<StudioViewProps> = ({ initialSearchQuery, jumpAction }) => {
  const {
    dataSource, crawlLimit, crawlProgress, customListId, isLoading, isSyncingLists,
    minLikes, openMenu, searchQuery, selectedList, streamFilter, totalDbCount, userHandle, userLists,
    tweets, filteredTweets, selectedTweet, exportPath, isDetailLoading, checkedIds, allChecked,
    deleteConfirmOpen, batchDeleteConfirmOpen, previewImage, setPreviewImage, toastMessage,
    showToast, handleSyncOnlineLists, loadLocalTweets, handleSwitchDataSource, handleCrawl,
    handleSearchChange, handleUserChange, handleStreamFilterChange, handleSelectTweet,
    handleLoadMore, toggleCheck, handleToggleSelectAll, handleDeleteSingle, handleBatchDelete,
    handleBatchExport, handleRevealInFinder, handleOpenInX, handleForceRefreshTweet,
    setCrawlLimit, setMinLikes, setOpenMenu, setSelectedList, setCustomListId,
    setDeleteConfirmOpen, setBatchDeleteConfirmOpen, setCheckedIds,
  } = useStudioData({ initialSearchQuery, jumpAction });

  return (
    <main id="view-studio" className="view-container active">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast-message"
          role="status"
          style={{
            position: 'fixed',
            top: '76px',
            right: '24px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '12.5px',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            whiteSpace: 'pre-line',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 顶栏：单行一体化智能工具条 (54px) */}
      <StudioDataSourceBar
        dataSource={dataSource}
        crawlLimit={crawlLimit}
        crawlProgress={crawlProgress}
        customListId={customListId}
        isLoading={isLoading}
        isSyncingLists={isSyncingLists}
        minLikes={minLikes}
        openMenu={openMenu}
        searchQuery={searchQuery}
        selectedList={selectedList}
        streamFilter={streamFilter}
        totalDbCount={totalDbCount}
        userHandle={userHandle}
        userLists={userLists}
        onSwitchSource={handleSwitchDataSource}
        onCrawl={handleCrawl}
        onSyncOnlineLists={handleSyncOnlineLists}
        onSearchChange={handleSearchChange}
        onUserChange={handleUserChange}
        onStreamFilterChange={handleStreamFilterChange}
        onCrawlLimitChange={setCrawlLimit}
        onMinLikesChange={setMinLikes}
        onOpenMenuChange={setOpenMenu}
        onSelectedListChange={(val) => { setSelectedList(val); if (val !== 'custom') loadLocalTweets(50, 'lists', false, undefined, undefined, val); }}
        onCustomListIdChange={(val) => { setCustomListId(val); const m = val.match(/(\d{5,})/); if (m) loadLocalTweets(50, 'lists', false, undefined, undefined, m[1]); }}
        onReloadSearch={(q) => loadLocalTweets(50, 'search', false, q)}
        onReloadUser={(h) => loadLocalTweets(50, 'user', false, undefined, h)}
        onReloadList={(cleanId) => loadLocalTweets(50, 'lists', false, undefined, undefined, cleanId)}
      />

      {/* Master-Detail 双栏工作台 */}
      <div className="studio-layout">
        <TweetListPane
          tweets={tweets}
          filteredTweets={filteredTweets}
          totalDbCount={totalDbCount}
          selectedTweet={selectedTweet}
          checkedIds={checkedIds}
          allChecked={allChecked}
          dataSource={dataSource}
          streamFilter={streamFilter}
          searchQuery={searchQuery}
          userHandle={userHandle}
          isLoading={isLoading}
          crawlProgress={crawlProgress}
          onSelectTweet={handleSelectTweet}
          onToggleCheck={toggleCheck}
          onToggleSelectAll={handleToggleSelectAll}
          onLoadMore={handleLoadMore}
          onCrawl={handleCrawl}
        />

        {/* 右栏：自包含研读卡片 (Detail §2.2 & §2.4) */}
        <TweetDetailPane
          selectedTweet={selectedTweet}
          isDetailLoading={isDetailLoading}
          exportPath={exportPath || ''}
          onOpenInX={handleOpenInX}
          onRevealInFinder={handleRevealInFinder}
          onForceRefresh={handleForceRefreshTweet}
          onRequestDelete={() => setDeleteConfirmOpen(true)}
          onPreviewImage={setPreviewImage}
          onToast={showToast}
        />
      </div>

      {/* 底部浮动批量条 (§7.7) */}
      {checkedIds.size > 0 && (
        <BatchActionBar
          selectedCount={checkedIds.size}
          onExport={handleBatchExport}
          onRequestDelete={() => setBatchDeleteConfirmOpen(true)}
          onClearSelection={() => setCheckedIds(new Set())}
        />
      )}

      {/* 批量删除确认对话框 */}
      {batchDeleteConfirmOpen && (
        <BatchDeleteDialog
          selectedCount={checkedIds.size}
          onCancel={() => setBatchDeleteConfirmOpen(false)}
          onConfirm={handleBatchDelete}
        />
      )}

      {/* 删除确认对话框 */}
      {deleteConfirmOpen && (
        <DeleteDialog
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteSingle}
        />
      )}

      {/* 图片放大预览灯箱 (Lightbox Modal) */}
      {previewImage && <ImageLightbox imageUrl={previewImage} onClose={() => setPreviewImage(null)} onToast={showToast} />}
    </main>
  );
};
