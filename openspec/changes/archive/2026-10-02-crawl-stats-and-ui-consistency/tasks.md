# Tasks

## 1. 统计契约（TDD）

- [x] 1.1 pipeline 三方法统一返回 `FetchAndStoreResult`（真实 inserted/skipped）
- [x] 1.2 IPC 三 handler 透传 + done 消息如实报告（`新增入库 X 条，跳过重复 Y 条`）
- [x] 1.3 CLI 调用点解构适配；`tests/pipeline.test.ts` 断言更新；真实列表回归（重复抓取显示 `新增 0 / 跳过 15`）

## 2. 列表滚动（TDD）

- [x] 2.1 `tests/list-scroll.test.ts` 先红（4 例：达量停 / 继续滚 / 到底提前停 / 硬上限）
- [x] 2.2 `shouldScrollListTimeline` 纯函数 + fetchListTimeline 滚动段改造，转绿
- [x] 2.3 真实列表验证：日志按批次推进、列表到底时 stagnant 提前停止

## 3. UI 一致性

- [x] 3.1 四维源顺序：关注流 / 博主追踪 / X 列表 / 全网搜索（E2E id 选择器无位置依赖，19 Flows 过）
- [x] 3.2 关注流操作区对齐（输入框在前、13px/minWidth 160px、gap 8px）+ E2E 顺序断言
- [x] 3.3 四源按钮 label 统一「🔄 抓取最新 N 条」/「⏳ 正在抓取...」+ E2E 一致性断言（循环遍历四源钉死）
- [x] 3.4 placeholder 统一 🔍 图标；关注流文案改为「输入【关键词】即触发本地搜索关注流推文」
- [x] 3.5 删除「已存 N 篇」误导提示（全库计数错放列表语境）+ E2E 反向断言

## 4. a11y 与截图

- [x] 4.1 InfoTip 嵌套 button → span[role=button]（键盘支持），嵌套警告清零
- [x] 4.2 README 截图（scripts/capture-shots.ts，纯 JS 字符串注入绕开 tsx `__name` 陷阱）
