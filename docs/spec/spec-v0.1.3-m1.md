---
doc: spec
product: v0.1.3
milestone: m1
date: 2026-11-23
status: approved
---

# Xtract M1 技术设计规格：拉取推文内容类型可配置（默认仅 X Article）

> **所属版本**：[v0.1.3 PRD](../prd/v0.1.3.md)  
> **里程碑**：M1  
> **状态**：✅ 已评审通过（Approved）

---

## 1. 本里程碑目标与覆盖的 F / AC

本里程碑将现有粗粒度二元开关（`FETCH_ONLY_LONG_TWEETS`）升级为三类内容（专栏文章 / 长推文 / 普通短推文）的细粒度多选配置，**默认仅拉取 X Article 专栏文章**，全链路打通配置、设置中心 UI、四维批量抓取过滤、CLI 覆盖以及精准单推/趋势研报的豁免契约。

- **覆盖功能**：`F5`
- **覆盖验收标准**：`AC5.1`、`AC5.2`、`AC5.3`、`AC5.4`、`AC5.5`

---

## 2. 关键功能设计思路

### 2.1 内容分类与过滤纯函数层 (`src/main/client/parser.ts`)
- 每条推文归属于且仅归属于一种内容类型 `TweetContentType = 'article' | 'note' | 'short'`：
  1. `classifyTweetContentType(tweet: Partial<Tweet>): TweetContentType`
     - 命中 `isArticleTweet(tweet)` → `'article'`（最高优先级，因为专栏文章正文也超过 280 字）
     - 否则命中 `isNoteTweet(tweet)` → `'note'`
     - 否则 → `'short'`
  2. `matchesContentTypes(tweet: Partial<Tweet>, allowedTypes: readonly TweetContentType[]): boolean`
     - 将 `classifyTweetContentType(tweet)` 与 `allowedTypes` 匹配。
     - 若 `allowedTypes` 包含全部 3 种类型，直接短路返回 `true`。
  3. `parseContentTypes(raw?: string | string[]): TweetContentType[]`（导出于 `src/main/config.ts` 或公共工具函数）
     - 支持逗号分隔字符串（如 `'article,note'`）或数组，去重并按固定顺序 `['article', 'note', 'short']` 归一化；
     - 严格模式（CLI 参数解析用）：遇到非法值（如 `video`、`foo`）抛错并列出合法值 `article, note, short`；空集合亦报错；
     - 宽松模式（读取配置文件/环境变量用）：过滤非法项，若结果为空则回退默认值 `['article']`，保证系统不崩溃且不静默失效。

### 2.2 配置持久化与兼容性 (`src/main/config.ts`)
- 新增配置键：`FETCH_CONTENT_TYPES`（持久化写入 `<storageRoot>/config.env`，例如 `FETCH_CONTENT_TYPES=article`）。
- 默认值常量：`DEFAULT_FETCH_CONTENT_TYPES: TweetContentType[] = ['article']`。
- 读取优先级（`Config.FETCH_CONTENT_TYPES`）：
  1. 若 `process.env.FETCH_CONTENT_TYPES` 非空：按宽松模式解析并归一化；
  2. 否则默认返回 `['article']`（确保升级到 v0.1.3 后符合「默认只拉取文章」的核心需求，不受旧版本默认写入的 `FETCH_ONLY_LONG_TWEETS=true` 干扰）。
- 旧属性 `Config.FETCH_ONLY_LONG_TWEETS` 保留只读派生兼容（`!types.includes('short')`），避免破坏可能引用它的辅助逻辑或旧测试。

### 2.3 四维批量抓取全链路与豁免契约 (`src/main/client/index.ts` & `src/main/pipeline/index.ts`)
- **统一透传参数**：`FetchFollowingOptions` / `FetchUserOptions` / `FetchSearchOptions` 与 `Pipeline` 对应方法新增 `contentTypes?: TweetContentType[]`。
- **判定逻辑收敛**：抽取内部辅助 `resolveContentTypes(options?: { contentTypes?: TweetContentType[]; onlyLongTweets?: boolean }): TweetContentType[]`：
  - 若显式传入 `options.contentTypes`（非空）→ 直接采用；
  - 否则若显式传入旧参数 `options.onlyLongTweets` → `true` 映射为 `['article', 'note']`，`false` 映射为 `['article', 'note', 'short']`（保证历史单测与调用方平滑过渡）；
  - 否则读取 `Config.FETCH_CONTENT_TYPES`（默认 `['article']`）。
- **生效范围（4 个批量流入口）**：
  - `fetchFollowingTimeline` / `fetchAndStore`：滚动早停计数与最终筛选均使用 `matchesContentTypes(t, contentTypes)`；
  - `fetchUserTimeline` / `fetchUserAndStore`：双轨（搜索流 + 主页备轨）均透传 `contentTypes`；
  - `fetchListTimeline` / `fetchListAndStore`：列表滚动捕获与入库筛选均使用 `contentTypes`；
  - `fetchSearchTimeline` / `fetchSearchAndStore`：搜索抓取与入库筛选均使用 `contentTypes`。
- **滚动收敛保障（边界处理）**：
  - 关注流/列表/搜索在仅拉取 `article` 时，文章密度低，滚动循环已有明确 `maxPages` / `maxRounds` / `stagnantRounds >= 3` 收敛条件，绝不会为凑够 `limit` 而无限死循环；
  - 日志输出准确描述当前生效的内容类型标签（例如 `过滤规则生效：仅抓取专栏文章 (X Article)`），而非硬编码旧文案。
- **双豁免契约（AC5.4）**：
  1. **单推精准同步豁免**：`fetchTweetThread` / `fetchTweetAndStore` / `IPC TWEETS_VIEW` / CLI `--view` 完全不应用 `FETCH_CONTENT_TYPES` 过滤；
  2. **趋势研报内部挖掘豁免**：`Pipeline.runTrendsDigest` 内部调用 `this.fetchSearchAndStore(targetQuery, { ..., contentTypes: ['article', 'note', 'short'] })`，确保全网热点讨论中的短推与长推不被「默认仅文章」过滤掉。

### 2.4 IPC 契约与设置面板 UI (`src/preload/index.ts`、`src/main/ipc/index.ts`、`SettingsDrawer.tsx`)
- `AppConfigView` 新增 `fetchContentTypes: TweetContentType[]`（同时保留 `onlyLongTweets: boolean` 派生字段确保兼容）。
- `IPC CONFIG_GET` 返回 `fetchContentTypes: Config.FETCH_CONTENT_TYPES`；`IPC CONFIG_UPDATE` 接收 `FETCH_CONTENT_TYPES`（如 `'article,note'`）持久化写入并同步更新 `FETCH_ONLY_LONG_TWEETS` 派生值以保持旧配置文件整洁。
- 设置抽屉「抓取过滤规则」：
  - 将「仅抓取长推文与专栏文章」开关卡片替换为「拉取内容类型」卡片：标题旁配 `InfoTip`（`i` 图标），下方并排 3 个可多选的 `.fmt-chip`：**专栏文章**、**长推文**、**普通短推文**；
  - 防呆机制：当仅剩 1 项被勾选时，再次点击该项不取消选中，在卡片内联展示一行暖琥珀色瞬态提示「至少保留一种拉取类型」（2.5 秒后自动淡出，不弹侵入式 alert）。
  - 顺带将相邻「抓取作者追评与追加回复」的两行常驻解释文案收敛至 `InfoTip`，严格践行 `GEMINI.md` 界面克制原则。

### 2.5 CLI 选项设计 (`src/main/index.ts`)
- 新增选项：`--content-types <types>`（说明：`指定批量拉取的内容类型，逗号分隔：article,note,short（默认按配置，未配置时仅拉取 article）`）。
- 兼容别名：`--all-tweets` 等价于 `--content-types article,note,short`。
- 优先级：`--content-types` > `--all-tweets` > `config.env / 环境变量 FETCH_CONTENT_TYPES` > 默认 `['article']`。
- 参数校验：若 `--content-types` 包含非法类型（如 `--content-types foo`），立即抛出可读中文错误并退出码 1。

---

## 3. 数据模型 / 接口定义

### 3.1 类型定义 (`src/main/types.ts` & `src/renderer/src/types.ts`)
```ts
export type TweetContentType = 'article' | 'note' | 'short';

export const ALL_TWEET_CONTENT_TYPES: readonly TweetContentType[] = ['article', 'note', 'short'];
export const DEFAULT_TWEET_CONTENT_TYPES: readonly TweetContentType[] = ['article'];
```

### 3.2 纯函数签名 (`src/main/client/parser.ts`)
```ts
export function classifyTweetContentType(tweet: Partial<Tweet>): TweetContentType;
export function matchesContentTypes(
  tweet: Partial<Tweet>,
  allowedTypes: readonly TweetContentType[]
): boolean;
export function parseContentTypes(
  raw: string | readonly string[] | undefined,
  options?: { strict?: boolean }
): TweetContentType[];
```

### 3.3 `AppConfigView` 增量字段 (`src/preload/index.ts` & `src/renderer/src/types.ts`)
```ts
export interface AppConfigView {
  // ...既有字段保留
  fetchContentTypes: TweetContentType[];
  /** @deprecated 由 fetchContentTypes 派生保留兼容 */
  onlyLongTweets: boolean;
}
```

### 3.4 `XClient` 选项扩展 (`src/main/client/index.ts`)
```ts
export interface FetchFollowingOptions {
  maxPages?: number;
  limit?: number;
  pageDelay?: number;
  timeout?: number;
  contentTypes?: TweetContentType[];
  /** @deprecated 请优先使用 contentTypes */
  onlyLongTweets?: boolean;
}
// FetchUserOptions 与 FetchSearchOptions 同理新增 contentTypes?: TweetContentType[]
```

---

## 4. 关键决策记录

| 决策点 | 选定方案 | 为什么这么选 | 对用户的影响 | 放弃了什么 |
| :--- | :--- | :--- | :--- | :--- |
| **配置形态** | 3 项多选数组 `FETCH_CONTENT_TYPES`（默认 `article`） | 三类内容是并列的内容形态，多选能一次覆盖「仅文章」「文章+长推」「全量」「仅短推」所有组合，零歧义 | 勾选直观，想看哪类就点哪类；默认即最高信噪比的专栏文章 | 放弃叠加第二个开关（如同时留「仅长文」+「仅文章」两个互斥开关导致理解负担） |
| **旧配置升级默认值** | 未显式配置 `FETCH_CONTENT_TYPES` 时一律默认 `['article']` | 旧版每个用户的 `config.env` 只要点过一次保存就会带 `FETCH_ONLY_LONG_TWEETS=true`；若按旧键迁移为 `article,note`，老用户升级后不会生效「默认仅拉取文章」 | 老用户升级即享默认只拉文章；需要长推/短推时在设置点一下即可开启 | 放弃从 `FETCH_ONLY_LONG_TWEETS=true` 自动映射为 `article,note` |
| **至少选 1 项防呆** | 拦截取消最后一项并内联轻提示 | 允许空选会导致所有批量抓取永远静默返回 0 条，用户无法定位原因 | 不可能配出「静默 0 结果」的死配置 | 放弃允许全不选再在保存时报错 |
| **趋势研报豁免** | `runTrendsDigest` 内部搜索显式传 `['article', 'note', 'short']` | 热点榜单刚爆发的实时讨论绝大部分是短推/长推，几乎没有刚写好的专栏文章 | 趋势研报依然能稳定抓到最新讨论并产出高质量研报 | 放弃让 `FETCH_CONTENT_TYPES` 一刀切影响趋势研报 |
| **界面克制** | 设置卡片用 `InfoTip` 收敛解释文案 | 严格遵循 `GEMINI.md`「界面是操作台，不是说明书」红线 | 设置抽屉更紧凑清爽，主操作一眼聚焦 | 放弃卡片内常驻大段解释小字 |

---

## 5. 测试策略

### 5.1 单元测试清单（TDD 红阶段基准）
| 编号 | 测试文件 | 类型 | 测试用例点 | 覆盖 AC |
| :--- | :--- | :---: | :--- | :---: |
| UT-1 | `tests/content-type-filter.test.ts` | 单元 | `classifyTweetContentType` 正确区分 `article`（含正文 > 280 字的专栏优先归为 `article` 而非 `note`）、`note`（> 280 字 / `is_note_tweet` / 截断体）、`short` | AC5.1 |
| UT-2 | `tests/content-type-filter.test.ts` | 单元 | `matchesContentTypes` 在单选 `['article']`、双选 `['article','note']`、三选全量、`['short']` 下的精准过滤 | AC5.1 |
| UT-3 | `tests/content-type-filter.test.ts` | 单元 | `parseContentTypes` 宽松模式（空值回退 `['article']`、去重、归一化顺序、过滤非法项）与严格模式（非法值/空值抛错） | AC5.1, AC5.5 |
| UT-4 | `tests/content-type-filter.test.ts` | 单元 | `Config.FETCH_CONTENT_TYPES` 默认值为 `['article']`，忽略旧 `FETCH_ONLY_LONG_TWEETS=true`；设置 `FETCH_CONTENT_TYPES=article,note` 正确持久化读取 | AC5.1 |
| UT-5 | `tests/pipeline.test.ts` | 单元/集成 | `Pipeline.fetchAndStore` / `fetchUserAndStore` / `fetchListAndStore` / `fetchSearchAndStore` 按 `FETCH_CONTENT_TYPES` 透传 `contentTypes` 并只落库匹配类型（默认仅 `article` 过滤掉 `note` 与 `short`） | AC5.3 |
| UT-6 | `tests/pipeline.test.ts` | 单元/集成 | 豁免契约：`fetchTweetAndStore` 抓取单条短推文照常入库；`runTrendsDigest` 内部调用搜索时显式传入 `['article','note','short']` 不受默认仅文章限制 | AC5.4 |
| UT-7 | `tests/ipc.test.ts` | 集成 | `CONFIG_GET` 返回 `fetchContentTypes`（默认 `['article']`）；`CONFIG_UPDATE` 持久化 `FETCH_CONTENT_TYPES=article,note` 后 `CONFIG_GET` 立即反映更新 | AC5.1, AC5.2 |
| UT-8 | `tests/cli-argv.test.ts` | 单元/集成 | CLI `--content-types` 合法解析、非法值报错、`--all-tweets` 映射为全量、优先级 `--content-types` > `--all-tweets` | AC5.5 |

### 5.2 端到端测试场景 (`tests/gui-workbench.e2e.test.ts`)
| 编号 | 场景 | 验证内容 | 覆盖 AC |
| :--- | :--- | :--- | :---: |
| E2E-1 | 设置抽屉内容类型配置交互 | 打开设置抽屉 → 验证默认仅「专栏文章」处于选中态 → 点击「专栏文章」尝试取消最后一项时被拦截且显示提示 → 勾选「长推文」并保存 → 验证 `updateConfig` 收到 `FETCH_CONTENT_TYPES: 'article,note'` 且再次打开抽屉保持两项选中 | AC5.2 |

---

## 6. Task 拆分

| 编号 | 内容 | 覆盖 AC | 依赖 | 状态 |
| :--- | :--- | :--- | :--- | :---: |
| **T1.1** | 新增 `TweetContentType` 类型、`classifyTweetContentType` / `matchesContentTypes` / `parseContentTypes` 纯函数与 `Config.FETCH_CONTENT_TYPES`（TDD） | AC5.1 | 无 | ✅ 完成（`vitest content-type-filter.test.ts` 5/5 pass, `eslint` 0 err, `tsc` 0 err） |
| **T1.2** | `XClient` 与 `Pipeline` 四维批量抓取升级为 `contentTypes` 透传过滤，并落实单推同步 & 趋势研报双豁免契约（TDD） | AC5.3, AC5.4 | T1.1 | ✅ 完成（`vitest pipeline.test.ts` 7/7 pass, `eslint` 0 err, `tsc` 0 err） |
| **T1.3** | CLI 新增 `--content-types <types>` 校验解析与 `--all-tweets` 兼容别名（TDD） | AC5.5 | T1.1, T1.2 | ✅ 完成（`vitest cli-argv.test.ts` 20/20 pass, CLI `--content-types bogus` 准确报错 exit 1） |
| **T1.4** | IPC 契约（`preload`/`ipc`/`renderer api`）与 `SettingsDrawer` 多选芯片 + 防呆拦截 + `InfoTip` 精简，并补齐单元测试与 GUI E2E（TDD） | AC5.2 | T1.1 | ✅ 完成（`ipc.test.ts` 9/9 + `gui-workbench.e2e.test.ts` 19/19 pass, `eslint` 0 err, `tsc` 0 err） |
| **T1.5** | M1 自动化门禁验收（`pnpm verify` 全量通过并补充验收记录） | AC5.1–AC5.5 | T1.1–T1.4 | ✅ 完成（`pnpm verify` 5/5 门禁全绿，332/332 测试通过，Smoke 4/4 通过） |

---

## 7. 界面与 F / AC 映射

对应高保真原型文件：[prototype-v0.1.3-m1.html](../prototype/prototype-v0.1.3-m1.html)

### 7.1 界面元素与 AC 映射
| 原型区块 | 控件与 ID | 对应 F / AC | 交互说明 |
| :--- | :--- | :--- | :--- |
| 设置抽屉 → 「抓取过滤规则」卡片 1 | 标题「拉取内容类型」 + `InfoTip` + 3 个 `.fmt-chip`（`#content-type-article`、`#content-type-note`、`#content-type-short`） | F5 / AC5.2 | 点击切换选中/取消；默认仅 `article` 激活（朱砂底框）；仅剩 1 项时点击触发防呆提示 `#content-type-guard-msg`（琥珀色，2.5s 自动消失）；支持多选任意组合 |
| 设置抽屉 → 「抓取过滤规则」卡片 2 | 「抓取作者追评与追加回复」 + `InfoTip` + `.switch` | F5 / AC5.2（界面克制同步整理） | 移除常驻解释小字，改由标题旁 `i` 图标 hover/click 浮层展示 |
| 设置抽屉底栏 | 「保存」按钮 | F5 / AC5.2 | 序列化为 `FETCH_CONTENT_TYPES`（如 `article,note`）调用 `api.updateConfig` |

### 7.2 视觉规范（对齐 `src/renderer/src/index.css`）
- **配色令牌**：暖白纸底 `--paper: #faf7f0`、凹陷卡底 `--paper-sunken: #f3ede1`、墨黑主字 `--ink: #211c15`、朱砂选中态 `--cinnabar: #b5462f` / `--cinnabar-wash: #f6e7df`、琥珀防呆提示 `--amber: #9a6b1e` / `--amber-wash: #f3e9d4`。
- **字体与间距**：标题 `15px` 衬线（`--font-serif`），项标签 `13px` `font-weight: 600`，多选芯片 `12.5px`、`padding: 6px 12px`、圆角 `999px`、横向 `gap: 8px` 均分三列（`flex: 1`），选中项左侧带 `✓` 勾选符号增强辨识度。

---

## 8. 验收记录

- **验收日期**：2026-11-24
- **验收命令**：`pnpm verify`（依次执行 `pnpm lint && pnpm test && tsc --noEmit && pnpm build && pnpm pack:dir && pnpm smoke`）
- **额外 CLI 边界校验**：`pnpm dev:cli -- --list 1 --content-types bogus --json`

### 门禁与测试结果
| 门禁项 | 命令 | 结果 | 详情 |
| :--- | :--- | :---: | :--- |
| 代码风格 | `pnpm lint` | ✅ 通过 | 0 Error（14 条存量 React Hooks warning，未新增 warning） |
| 自动化测试 | `pnpm test` | ✅ 通过 | **26/26 文件，332/332 用例通过（100%）**，含新增 13 条单测/集成用例与更新后的 Flow 9 真实浏览器 E2E |
| 静态类型 | `tsc --noEmit` | ✅ 通过 | 0 Error |
| 生产构建 | `pnpm build` | ✅ 通过 | Vite 渲染层 + Electron 主进程 + Preload 均 0 Error |
| 打包 Smoke | `pnpm pack:dir && pnpm smoke` | ✅ 通过 | **4/4 全通过**（`--version`、`--help`、`--list 1` 读 SQLite、无参启动 GUI 存活） |
| CLI 非法枚举边界 | `--content-types bogus --json` | ✅ 通过 | 返回标准 JSON 错误并退出码 `1` |

### 覆盖 AC 核对
- `AC5.1`：分类优先级 `article > note > short`、宽松/严格解析、`Config.FETCH_CONTENT_TYPES` 默认 `['article']` → 已由 `tests/content-type-filter.test.ts` 验证；
- `AC5.2`：设置抽屉多选芯片、防呆拦截至少留 1 项、`InfoTip` 收敛文案、保存持久化 → 已由 `tests/ipc.test.ts` 与 `tests/gui-workbench.e2e.test.ts` Flow 9 验证；
- `AC5.3`：四维批量抓取全链路 `contentTypes` 透传过滤 → 已由 `tests/pipeline.test.ts` UT-5 验证；
- `AC5.4`：单推精准同步与趋势研报内部挖掘豁免 → 已由 `tests/pipeline.test.ts` UT-6 验证；
- `AC5.5`：CLI `--content-types` 校验与 `--all-tweets` 兼容别名 → 已由 `tests/cli-argv.test.ts` UT-8 与真实 CLI 运行验证。

### 遗留问题
- 无（M1 范围内 0 遗留问题；版本号 `0.1.3` 统一在全部里程碑完成后交付阶段升级）。
