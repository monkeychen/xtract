# Technical Design

> 本文档定义「从浏览器读取既有登录态」的模块边界、算法契约与**已验证的陷阱清单**。
> 所有技术选型均由 `scratch/` 下的探针实跑验证得出，未经验证的假设一律不写入实现。

## 1. 已验证的前提（探针结论）

| 探针 | 结论 |
| :--- | :--- |
| 探针 1：持久化 profile 自动化登录 | ❌ X 对空白 profile 的登录动作持续限流，且在用户未输入凭据前即触发。**方案 A 废弃** |
| 探针 2：Chrome cookie 解密 | ✅ 可解。Keychain 条目名必须用 `-s` 指定（`security find-generic-password -s "Chrome Safe Storage" -w`） |
| 探针 3：解密 → 注入 → 访问 | ✅ `x.com/home` HTTP 200，主界面完整渲染并显示用户时间线；cookie 落盘 23 条 |
| 探针 4：headless vs headful | ✅ **headless 被 Cloudflare 拦截，headful 正常**。所有 X 访问必须 `headless: false` |

## 2. 模块结构

```
src/main/auth/chrome-cookie.ts     # 纯逻辑层：定位 / 解密 / 清洗 / 纪元换算（无 Playwright 依赖）
src/main/auth/index.ts             # 编排层：读取 → 解密 → 注入到持久化 profile → 验证
```

拆两层的原因：解密与清洗是**可单测的纯函数**，必须能在不触碰真实 Keychain 和浏览器的情况下测试；编排层才允许有副作用。

## 3. 解密算法（macOS Chrome）

### 3.1 密钥派生

```
password = security find-generic-password -s "Chrome Safe Storage" -w
key      = PBKDF2-SHA1(password, salt="saltysalt", iterations=1003, dkLen=16)
```

`iterations=1000` 是历史值，Chrome 实际使用 **1003**。

### 3.2 值解密

```
encrypted_value 前 3 字节 = 版本前缀（v10 / v11 / v20），不是密文的一部分
密文 = encrypted_value.slice(3)
明文 = AES-128-CBC-Decrypt(key, 密文, IV = 16 × 0x20)
值   = 明文[skip:]      # skip 见 §3.3
```

### 3.3 明文布局（★ 陷阱）

Chrome 各版本布局不同，且**无法通过读取版本号可靠判断**：

| 版本 | 布局 |
| :--- | :--- |
| 旧 | `[32B domain][value]` |
| 新 | `[32B domain][32B SHA256(domain)][value]` |

**契约**：实现 MUST 同时尝试 `skip = 32` 与 `skip = 64`，取「解出的前缀不含控制字符与替换字符 `�`」的那个；两者都不干净时取 `skip=32` 的结果。该启发式在本机 Chrome 154 上验证通过。

### 3.4 过期时间换算（★ 陷阱）

`expires_utc` 是 **1601-01-01 纪元的微秒**，有两个独立的坑：

1. **量级超出 JS 安全整数**：`1.3e16 > 2^53 ≈ 9.0e15`。在 JS 侧做算术会静默精度丢失。
2. **单位是微秒不是毫秒**：除以 1000 会得到 `1.3e13` 的荒谬时间戳（公元 42 万年），Playwright 会直接抛 `Cookie should have a valid expires`。

**契约**：换算 MUST 在 SQL 侧完成，JS 只接收结果。

```sql
CASE WHEN is_persistent = 1 AND expires_utc > 0
     THEN expires_utc / 1000000 - 11644473600   -- 微秒 → 秒，且减 1601→1970 偏移
     ELSE 0 END AS expires_unix
```

### 3.5 持久化必要性（★ 陷阱）

Playwright 的 `addCookies` 若不传 `expires`，注入的是 **session cookie**：内存中有效（所以访问成功），但浏览器一关即消失。

**契约**：MUST 传递 `expires_unix`；仅当 `expires_unix <= 当前时间` 时才省略 `expires`（视为已过期的 session cookie，不注入）。

### 3.6 落盘延迟（★ 陷阱）

Chrome 的 cookie 写入是异步的。`context.close()` 后立即读磁盘文件会读到旧内容（探针误判为「未落盘」，数分钟后再查则 23 条齐全）。

**契约**：注入后 MUST 等待足够时间再关闭 context，让 Chrome 完成刷盘。

## 4. 已知异常值与处理策略

探针实测发现，即使注入**完整** cookie 集仍有两个异常值：

| cookie | 异常 | 实测行为 |
| :--- | :--- | :--- |
| `kdt` | 解出 1 字符（标准 40 hex） | 不影响登录，X 主界面正常渲染 |
| `ct0` | 解出 160 字符（标准 32 hex） | 不影响登录 |

**结论**：X 的实际校验以 `auth_token` 为主，这两个字段并非登录的必要条件。

**契约**：
- MUST 注入全部读取到的 cookie（不因格式异常丢弃，保留会话完整性）；
- 但 MUST 对 `auth_token` 做**格式校验**（hex 串、长度 20–128），不通过则判定导入失败并给出可操作提示，绝不把畸形 token 写入配置。

## 5. 编排流程

```
用户点击「从 Chrome 读取登录态」
  ↓
[平台校验] 非 macOS → 返回明确提示，不做任何操作
  ↓
[定位] 枚举 Default / Profile N，取 cookie 库（兼容 Cookies 与 Network/Cookies 两种位置）
  ↓
[读取] 复制到临时目录（只读副本，不触碰用户文件）→ SQL 查询 x.com 域 → 删除临时文件
  ↓
[解密] Keychain 取密钥 → 逐条解密 → 清洗 → 计算 expires
  ↓
[校验] auth_token 必须为合法 hex；不合法则中止并报告
  ↓
[注入] 启动持久化 profile（headful、挂代理）→ addCookies → 验证访问 x.com/home
  ↓
[持久化] 等待刷盘 → 关闭 → 同步写入 config.env（保持与既有配置通道一致）
  ↓
[回报] 返回 { success, importedCount, account } —— 绝不回传任何 cookie 明文
```

## 6. 安全边界

| 约束 | 实现 |
| :--- | :--- |
| 只读 x.com 域 | SQL `WHERE host_key LIKE '%x.com%' OR host_key LIKE '%twitter%'`，其余域不进入内存 |
| 不回传明文 | IPC 返回值只含计数与账号名，不含任何 cookie 值 |
| 不改用户浏览器 | cookie 库复制到临时目录只读，读完立即 `unlink` |
| 仅用户主动触发 | 不做后台定时读取；IPC 只在按钮点击时调用 |
| 密钥不落盘 | PBKDF2 派生结果仅存在于函数作用域的局部变量 |

## 7. 失败诊断

所有失败路径 MUST 返回**可操作的中文提示**，禁止抛出原始英文异常：

| 失败点 | 提示方向 |
| :--- | :--- |
| 非 macOS | 当前平台暂不支持，请使用手工填入通道 |
| 找不到 Chrome | 未检测到 Chrome 浏览器 |
| Keychain 读取失败 | 需授权访问钥匙串；说明在弹窗中点「允许」 |
| 找不到 cookie 库 | Chrome 未存储过 cookie，或使用了不受支持的 profile |
| 无 auth_token | Chrome 中没有 x.com 登录态，请先在 Chrome 登录 x.com |
| auth_token 格式非法 | 解密结果异常，建议在 Chrome 中重新登录后重试 |
| 注入后访问失败 | 登录态可能已失效，请在 Chrome 中重新登录 |

## 8. 测试策略

纯函数层（可单测，无副作用）：
- `decryptCookieValue`：v10/v11/v20 前缀、skip=32/64 择优、损坏密文
- `sanitizeCookieValue`：NUL 截断、hex 裁剪
- `isValidAuthToken`：合法 hex、长度边界、含非 hex 字符
- `parseCookieDbPath`：两种 Chrome 存储位置

编排层：以 IPC 契约测试为主，断言返回值**不含**明文 cookie。
