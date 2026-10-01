# Spec Delta

## ADDED Requirements

### Requirement: 浏览器登录态导入 (Browser Credential Import)
系统 MUST 提供从用户日常浏览器读取既有 X 登录态的通道。登录动作 MUST 完全由用户在真实浏览器中完成，系统 MUST NOT 尝试在自动化浏览器中执行 X 登录。

#### Scenario: 从 Chrome 一键导入登录态
- **GIVEN** 用户已在日常 Chrome 中登录 x.com，且未退出 Chrome
- **WHEN** 用户在设置抽屉点击「从 Chrome 读取登录态」
- **THEN** 系统 MUST 读取 Chrome 中 x.com 域的全部 cookie（含 `auth_token`、`kdt`、`cf_clearance` 等风控相关字段），注入到项目自身的持久化浏览器 profile，并验证登录态可用
- **AND** MUST 将 `auth_token` 与 `ct0` 同步写入配置文件，保持与手工填入通道一致
- **AND** 回报结果 MUST 仅包含导入数量与账号名，**严禁回传任何 cookie 明文**

#### Scenario: 导入时仅访问 x.com 域
- **WHEN** 系统读取浏览器 cookie
- **THEN** 查询 MUST 在数据库层面限定 `host_key` 为 x.com / twitter.com，其余域的 cookie MUST NOT 进入内存
- **AND** MUST 以只读副本方式访问 cookie 库，MUST NOT 写入或修改用户浏览器的任何文件

#### Scenario: 平台不支持时明确降级
- **GIVEN** 当前操作系统不是 macOS
- **WHEN** 用户查看或点击「从 Chrome 读取登录态」
- **THEN** 系统 MUST 明确提示该通道当前平台不可用，并引导使用手工填入通道
- **AND** MUST NOT 静默无响应

#### Scenario: 未登录时给出可操作提示
- **GIVEN** Chrome 中不存在 x.com 的 `auth_token`
- **WHEN** 用户触发导入
- **THEN** 系统 MUST 提示「请先在 Chrome 中登录 x.com」而非抛出底层异常

#### Scenario: 登录态失效时的失败诊断
- **GIVEN** 注入 cookie 后访问 x.com 仍被重定向至登录页或返回非 200
- **WHEN** 导入流程结束
- **THEN** 系统 MUST 判定导入失败并提示「登录态可能已失效，请在 Chrome 中重新登录」
- **AND** MUST NOT 将无效 cookie 写入配置文件

#### Scenario: 用户主动触发，无后台读取
- **WHEN** 系统运行
- **THEN** 浏览器 cookie 的读取 MUST 仅在用户显式点击导入按钮时发生
- **AND** 系统 MUST NOT 在后台定时或启动时自动读取浏览器凭证

## MODIFIED Requirements

### Requirement: 全局设置与原生免 Cookie 捕获
#### Scenario: 免 Cookie 弹窗登录捕获
- **WHEN** 用户点击设置抽屉中的「重新登录」按钮
- **THEN** 系统拉起原生隔离会话窗口供用户登录 X
- **AND** 系统 MUST 提示该方式在 X 的自动化风控下可能失败，推荐改用「从 Chrome 读取登录态」

#### Scenario: 浏览器降级演示模式的显式标识
（保持不变）
