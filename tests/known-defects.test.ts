import { describe, it } from 'vitest';

/**
 * 已知缺陷登记
 *
 * 来源：openspec/changes/2026-09-30-test-regression-net/proposal.md
 *
 * 这些条目**不得**被写成"当前实现能通过"的断言——那等于把缺陷升级为受保护的
 * 回归基线。下方描述的是**期望语义**，供缺陷修复后转写为真实断言。
 */
describe('已知缺陷：待修复后转为真实断言', () => {
  it.todo(
    'allChecked 语义缺陷：当前实现为 checkedIds.size === filteredTweets.length（集合大小相等），' +
      '当 streamFilter 过滤导致 checkedIds 持有被过滤掉的 id 时会误判为"未全选"。' +
      '期望语义：应判断 filteredTweets 中每一项是否都包含在 checkedIds 中（集合包含关系），' +
      '而非比较两个集合的大小。位置：StudioView.tsx allChecked。'
  );

  it.todo(
    '批量导出为假实现：handleBatchExport 仅弹出 toast 并清空选中态，未调用任何导出 API，' +
      '用户以为导出成功但磁盘无产物。期望语义：应真实调用后端导出接口并返回落盘路径。' +
      '位置：StudioView.tsx handleBatchExport。'
  );

  it.todo(
    '切换数据源不重置删除确认弹窗：handleSwitchDataSource 重置了 streamFilter 与 checkedIds，' +
      '但未重置 deleteConfirmOpen / batchDeleteConfirmOpen / previewImage。' +
      '期望语义：切源时若弹窗处于开启态应一并关闭，否则弹窗确认会作用于新的 selectedTweet。' +
      '位置：StudioView.tsx handleSwitchDataSource。'
  );
});

/**
 * 以下为纯代码清理项，无用户可见行为差异，不占用 todo 槽位：
 *   - StudioView.tsx `limit` state：setter 从未被调用（死代码）
 *   - StudioView.tsx localStorage.setItem('xtract_last_user_handle')：全项目零处读取（死写入）
 *   - getTweetListDisplayTitle 的 matchSentence 分支：永不可达（死分支）
 *   - exportPath 渲染处 fallback 缺 `|| 'tweet'` 兜底，与 853/1169 行不一致
 *   - SettingsDrawer 硬编码假凭据 `'AIzaSyDummyKeyForPrototype12345'` 及 api.ts 的
 *     MOCK_TWEETS / MOCK_REPORTS / MOCK_TRENDS，与工程宪法红线第 3 条冲突（另立变更处理）
 */
