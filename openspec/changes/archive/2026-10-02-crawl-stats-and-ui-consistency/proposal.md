# Proposal

> 事后补记（2026-10-02 归档时回填）：本增量由真机验收反馈驱动，涉及三组修复与一组 UI 一致性调整。

## Why

真机验收暴露三处用户可感知的缺陷：

1. **抓取统计谎报**：列表抓取完成提示「入库 13 条」，实为 13 条全部主键去重跳过（新增 0），引发用户对数据丢失的误判（「14+13 应该是 27」）。根因是 IPC 契约断裂——handler 返回裸 `Tweet[]`，渲染层按 `{ fetched, inserted, skipped }` 消费拿到全 undefined；user/search 两源则是把拉取数冒充新增数、skipped 写死 0。
2. **列表滚动不足**：固定滚 `ceil(limit/20)` 轮、每轮 2500px，慢加载列表 limit=50 实得 15 条（真机实测）。
3. **误导性 UI**：X 列表操作区显示「已存 N 篇」（实为全库计数），语境误导；关注流操作区布局/按钮文案与其他源不一致。

## What Changes

- **`FetchAndStoreResult` 统一契约**：`fetchUserAndStore` / `fetchListAndStore` / `fetchSearchAndStore` 返回 `{ tweets, fetched, inserted, skipped }`（`saveTweets` 真实统计），IPC 透传，完成提示只允许使用真实数字；
- **列表滚动按捕获量驱动**：`shouldScrollListTimeline` 纯函数三重停止判据（批次达目标页数 / 连续 3 屏无新增 / 硬上限），真实列表回归验证；
- **UI 一致性**：四维源顺序定为「关注流 / 博主追踪 / X 列表 / 全网搜索」；四源抓取按钮 label 统一为「🔄 抓取最新 N 条」（抓取中「⏳ 正在抓取...」）；关注流操作区对齐其他源（输入框在前、样式同源）；三源输入框 placeholder 统一 🔍 图标；删除「已存 N 篇」误导提示；
- **a11y**：InfoTip 由嵌套 `<button>` 改为 `span[role=button]`（HTML 禁止 button 嵌套，截图流程暴露）。

## Impact

- `src/main/pipeline/index.ts`（返回契约）、`src/main/ipc/index.ts`（三 handler 透传 + 诚实 done 消息）、`src/main/client/index.ts`（滚动判据）、`src/main/index.ts`（CLI 调用点解构）；
- `src/renderer/`：StudioDataSourceBar（布局/label/placeholder/删提示）、StudioView（props）、InfoTip；
- 测试：`tests/list-scroll.test.ts`（4 例新增）、E2E 布局顺序与四源 label 一致性断言（19 Flows）；
- 文档：`docs/detailed_design.md` §2.6（契约与滚动判据）、README/architecture（源顺序）、产品规格增量记录于 `docs/prd/v0.1.1.md` §2/§3。
