# Proposal

## Why

当前获取 X 登录凭证只有两条路，都不能接受：

1. **应用内自动化登录**（`--login` / 设置中心「重新登录」）：Playwright 启动浏览器 → 用户登录 → 捕获 cookie。
   **实测已确认不可行**：X 对空白 profile 的登录动作持续限流，返回「我们已临时限制你的登录」。
   探针记录：即使使用真实系统 Chrome（`channel: 'chrome'`）+ 全新独立 profile，仍在用户尚未输入任何凭据时即被限流。
2. **手工从 DevTools 复制** `auth_token` / `ct0`：能用，但用户需要开 DevTools 翻 Cookie 面板，且只能拿到两个字段。

第 2 条还有个更隐蔽的缺陷：仅注入 `auth_token` + `ct0` 是**残缺的会话**。用户日常 Chrome 中实际存在的 `kdt`（X 设备指纹）、`cf_clearance`（Cloudflare 通行凭证）、`twid` 等全部缺失，而这些都参与 X 的风控判定。探针实测表明：注入**完整** cookie 集后，X 主界面完整渲染并显示用户时间线。

## What Changes

新增「从浏览器读取既有登录态」通道：用户先在**自己日常浏览器**中登录 X（登录动作完全由真实浏览器完成，不与 X 的自动化风控对抗），应用在用户主动点击后读取并解密该浏览器的 cookie，注入到项目自己的持久化浏览器 profile 中。

- **主进程新增 `src/main/auth/chrome-cookie.ts`**：macOS Chrome cookie 的定位、解密（Keychain + PBKDF2-SHA1 + AES-128-CBC）、格式清洗与注入；
- **新增 IPC `auth:importFromBrowser`**：仅在用户主动触发时执行，返回导入结果与账号信息；
- **设置抽屉新增「从 Chrome 读取登录态」按钮**：一键完成，带明确的平台支持说明与失败诊断；
- **消除 `auth_state.json` 双轨不一致缺陷**：见下。

## 附带修复

### 硬编码 User-Agent（5 处）

`src/main/client/index.ts` 4 处 + `src/main/storage/index.ts` 1 处把 UA 硬编码为 `Chrome/133.0.0.0`，而实际运行的系统 Chrome 为 154。Playwright 启动真实浏览器时 TLS 握手携带的是真实版本指纹，HTTP 头却声明另一个版本——该矛盾本身即为明确的伪装信号。

修复：删除全部 UA 覆盖，让 Playwright 继承真实浏览器 UA；undici 下载图片时不再设 UA（实测 `pbs.twimg.com` 在有无 UA 时均返回 HTTP 200）。

**需要明确记录的结论**：本变更**未证明** UA 修复能解决登录限流——探针在修复后仍复现限流。但该修复独立成立（自相矛盾的 UA 是缺陷），故保留，并以 `tests/user-agent.test.ts` 防止回归。

### auth_state.json 双轨不一致

现状两条抓取轨道对凭证的来源处理不一致：

- `setupContext()`（主轨）：`auth_state.json` 存在则用，否则注入 `.env` cookie；
- `createSession()`（兜底轨，`fetchUserTimeline` 轨道 2 / `fetchTweetThread`）：`launchPersistentContext` **不读取** `auth_state.json`，且无条件注入 `.env` cookie。

后果：`--login` 产出的 `auth_state.json` 对兜底轨无效；且兜底轨会用 `.env` 中的旧 token 覆盖登录时捕获的会话。

修复：统一为「持久化 profile 单一来源」——凭证只存在于 `browser_profile`，不再需要 `auth_state.json` 作为中间产物。

## Non-goals

- **不做自动化登录**。探针已证明与 X 的 bot 检测对抗不可持续，本变更不引入任何自动化登录路径。现有 `--login` 保留但不作为推荐路径。
- **不做 Windows 支持**。Windows 的 Chrome cookie 受 DPAPI + app-bound encryption 双重保护，实现复杂度与风险远高于 macOS。本变更仅支持 macOS，其他平台在 UI 上明确提示。
- **不读取非 x.com 域的 cookie**。SQL 查询层即限定 `host_key LIKE '%x.com%'`，其余域不进入内存。

## Capabilities

### New Capabilities
<!-- 无新增顶级 capability，复用既有 gui-workbench 与 credential-management 能力树 -->

### Modified Capabilities
- `gui-workbench`: 新增「浏览器登录态导入」场景；扩展全局设置抽屉的凭证管理交互。

## Impact

- **主进程**：新增 `src/main/auth/chrome-cookie.ts`；`src/main/ipc/index.ts` 新增 IPC；`src/main/client/index.ts` 移除 UA 覆盖并统一 profile 凭证来源。
- **存储层**：`src/main/storage/index.ts` 移除图片下载的 UA header。
- **preload**：`src/preload/channels.ts` 与 `index.ts` 新增通道与类型。
- **渲染层**：`src/renderer/src/services/api.ts` 与 `SettingsDrawer.tsx` 新增导入入口。
- **测试**：新增 `tests/user-agent.test.ts`（4 例）与 `tests/chrome-cookie.test.ts`（解密/清洗/纪元换算的纯函数用例）。
- **平台**：功能仅在 macOS 可用；其他平台 UI 明确说明。
