# Tasks

## 1. 纯函数层 `src/main/auth/chrome-cookie.ts`（TDD）

- [x] 1.1 新建 `tests/chrome-cookie.test.ts`，为纯函数编写用例并确认**红灯**
- [x] 1.2 实现 `decryptCookieValue(key, encrypted, skip)`：校验 v10/v11/v20 前缀、AES-128-CBC 解密、按 skip 截取
- [x] 1.3 实现 `decryptCookieValueAuto(key, encrypted)`：在 skip 32/64 中择优（以「前缀无控制字符与 U+FFFD」为判据）
- [x] 1.4 实现 `sanitizeCookieValue(name, raw)`：NUL 截断；对 `auth_token`/`ct0`/`kdt` 做 hex 前缀裁剪
- [x] 1.5 实现 `isValidAuthToken(value)`：hex 且长度 20–128
- [x] 1.6 实现 `parseCookieDbPath(profileDir)`：兼容 `<profile>/Cookies` 与 `<profile>/Network/Cookies`
- [x] 1.7 实现纪元换算 SQL 片段常量，注释写明微秒单位与安全整数两个陷阱
- [x] 1.8 运行 `npx vitest run tests/chrome-cookie.test.ts` 确认全绿

## 2. 编排层 `src/main/auth/index.ts`

- [x] 2.1 实现 `listChromeProfiles()`：枚举 Default / Profile N
- [x] 2.2 实现 `readChromeSafeStorageKey()`：以 `-s` 指定 service 名调用 `security`，失败返回可操作中文提示
- [x] 2.3 实现 `collectXCookies()`：复制 cookie 库到临时目录只读、SQL 限定 x.com 域、读后删除临时文件
- [x] 2.4 实现 `importFromBrowser()`：平台校验 → 定位 → 解密 → `auth_token` 校验 → 注入 → 验证 → 刷盘 → 写 config.env → 回报
- [x] 2.5 注入时必须 `headless: false`（headless 会被 Cloudflare 拦截），并挂载代理
- [x] 2.6 注入后访问 `x.com/home` 验证，要求 HTTP 200 且主界面已渲染，否则判定失败且不写配置
- [x] 2.7 关闭 context 前等待刷盘
- [x] 2.8 失败路径统一返回中文可操作提示，不抛出原始英文异常

## 3. IPC 与 preload

- [x] 3.1 `src/preload/channels.ts` 新增 `AUTH_IMPORT_FROM_BROWSER`
- [x] 3.2 `src/preload/index.ts` 新增类型 `BrowserImportResult` 与方法 `importFromBrowser()`
- [x] 3.3 `src/main/ipc/index.ts` 注册 handler，调用编排层并透传结果
- [x] 3.4 断言 IPC 返回值**不含**任何 cookie 明文

## 4. 渲染层

- [x] 4.1 `src/renderer/src/services/api.ts` 封装 `importFromBrowser`
- [x] 4.2 `SettingsDrawer.tsx` 新增「从 Chrome 读取登录态」卡片：说明文案、成功/失败反馈、非 macOS 平台的降级提示
- [x] 4.3 现有「重新登录」入口补充提示：自动化登录可能被 X 限制，推荐改用导入通道

## 5. 消除 auth_state.json 双轨不一致

- [x] 5.1 `client/index.ts` 的 `createSession()` 移除对 `.env` cookie 的**无条件**注入，与 `setupContext()` 的优先级策略对齐
- [x] 5.2 确认 `fetchUserTimeline` 兜底轨与 `fetchTweetThread` 在仅有 profile 凭证时仍可工作
- [x] 5.3 评估 `auth_state.json` 的去留：若已无读取方则停止写入并在文档中说明

## 6. 实机验证与门禁

- [x] 6.1 实机验证导入编排层：返回 `{success:true, importedCount:28}`，且返回值不含任何 cookie 明文
- [x] 6.2 实机验证导入后的鉴权：`--check-auth` 返回「认证成功！会话有效：@cza55008」
- [x] 6.3 实机验证 config.env 同步：旧的注释占位行被清理，仅保留单行有效值
- [x] 6.4 `pnpm verify` — 262 tests passed / 0 failed，lint 0 error，tsc 0 error，build clean

## 7. 实施中额外修复（超出原 tasks 范围）

- [x] 7.1 `savePersistentConfig` 重复行缺陷：原正则 `^KEY=` 只匹配未注释行，遇到 `#KEY=` 占位行时走追加分支，产生重复键。改为先剥离该键的全部历史行（含注释）再写入。已由 `tests/config-persist.test.ts` 的 6 个用例锁定。
- [x] 7.2 探针期踩坑固化为代码注释：Keychain service 名必须用 `-s` 指定、`expires_utc` 是微秒且超出 JS 安全整数（换算必须在 SQL 侧）、Playwright cookie 不传 `expires` 会退化为 session cookie、headless 会被 Cloudflare 拦截。
