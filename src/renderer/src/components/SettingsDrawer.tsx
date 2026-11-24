import React, { useState, useEffect, useRef } from 'react';
import type { AppConfigView, TweetContentType } from '../types.js';
import { api } from '../services/api.js';
import { InfoTip } from './InfoTip.js';

const CONTENT_TYPE_OPTIONS: Array<{ value: TweetContentType; label: string }> = [
  { value: 'article', label: '专栏文章' },
  { value: 'note', label: '长推文' },
  { value: 'short', label: '普通短推文' },
];

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
  screenName?: string;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
  screenName,
}) => {
  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [proxy, setProxy] = useState('http://127.0.0.1:8118');
  const [provider, setProvider] = useState('gemini');
  const [authMode, setAuthMode] = useState<'api_key' | 'account'>('api_key');
  const [model, setModel] = useState('gemini-3.8-flash');
  const [apiKey, setApiKey] = useState('');
  const [reasoningEnabled, setReasoningEnabled] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('high');
  const [contentTypes, setContentTypes] = useState<TweetContentType[]>(['article']);
  const [contentTypeGuardMsg, setContentTypeGuardMsg] = useState(false);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fetchAuthorReplies, setFetchAuthorReplies] = useState(false);
  const [autoDownloadVideos, setAutoDownloadVideos] = useState(false);
  const [storageRoot, setStorageRoot] = useState('~/Documents/Xtract');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>('');
  const [isCreatingShortcut, setIsCreatingShortcut] = useState(false);
  const [shortcutMsg, setShortcutMsg] = useState<string>('');
  const [xAuthToken, setXAuthToken] = useState('');
  const [xCt0, setXCt0] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.getConfig().then((cfg) => {
        setConfig(cfg);
        setProxy(cfg.httpProxy || 'http://127.0.0.1:8118');
        setProvider(cfg.llmProvider || 'gemini');
        setAuthMode((cfg.llmAuthMode as 'api_key' | 'account') || 'api_key');
        setModel(cfg.llmModel || 'gemini-3.8-flash');
        setReasoningEnabled(cfg.reasoningEnabled !== false);
        setReasoningEffort(cfg.reasoningEffort || 'high');
        setContentTypes(
          Array.isArray(cfg.fetchContentTypes) && cfg.fetchContentTypes.length > 0
            ? cfg.fetchContentTypes
            : ['article']
        );
        setContentTypeGuardMsg(false);
        setFetchAuthorReplies(cfg.fetchAuthorReplies === true);
        setAutoDownloadVideos(cfg.autoDownloadVideos === true);
        setStorageRoot(cfg.storageRoot || '~/Documents/Xtract');
      });
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (val: string) => {
    setProvider(val);
    const defaults: Record<string, string> = {
      gemini: 'gemini-3.8-flash',
      openai: 'gpt-5.6-sol',
      deepseek: 'deepseek-flash',
      'qwen-token-plan': 'qwen3.8-flash',
      'zhipu-code-plan': 'glm-5.3-flash',
      minimax: 'MiniMax-M3',
      kimi: 'kimi-k3',
    };
    if (defaults[val]) {
      setModel(defaults[val]);
    }
  };

  const handleSelectDirectory = async () => {
    const selected = await api.selectDirectory(storageRoot);
    if (selected) {
      setStorageRoot(selected);
    }
  };

  const handleToggleContentType = (type: TweetContentType) => {
    if (contentTypes.includes(type)) {
      if (contentTypes.length === 1) {
        setContentTypeGuardMsg(true);
        if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
        guardTimerRef.current = setTimeout(() => setContentTypeGuardMsg(false), 2500);
        return;
      }
      setContentTypes(contentTypes.filter((t) => t !== type));
    } else {
      const next = CONTENT_TYPE_OPTIONS.map((o) => o.value).filter(
        (v) => v === type || contentTypes.includes(v)
      );
      setContentTypes(next);
    }
    setContentTypeGuardMsg(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const orderedTypes = CONTENT_TYPE_OPTIONS.map((o) => o.value).filter((v) =>
      contentTypes.includes(v)
    );
    const effectiveTypes: TweetContentType[] = orderedTypes.length > 0 ? orderedTypes : ['article'];
    const updates: Record<string, string> = {
      HTTP_PROXY: proxy,
      LLM_PROVIDER: provider,
      LLM_AUTH_MODE: authMode,
      LLM_MODEL: model,
      LLM_REASONING_ENABLED: String(reasoningEnabled),
      LLM_REASONING_EFFORT: reasoningEffort,
      FETCH_CONTENT_TYPES: effectiveTypes.join(','),
      FETCH_ONLY_LONG_TWEETS: String(!effectiveTypes.includes('short')),
      FETCH_AUTHOR_REPLIES: String(fetchAuthorReplies),
      AUTO_DOWNLOAD_VIDEOS: String(autoDownloadVideos),
      XTRACT_STORAGE_ROOT: storageRoot,
    };
    if (xAuthToken.trim()) {
      updates.X_AUTH_TOKEN = xAuthToken.trim();
    }
    if (xCt0.trim()) {
      updates.X_CT0 = xCt0.trim();
    }
    await api.updateConfig(updates);
    setIsSaving(false);
    onConfigUpdated();
    onClose();
  };

  const handleImportFromBrowser = async () => {
    setIsImporting(true);
    setImportMsg('');
    try {
      const res = await api.importFromBrowser();
      setImportMsg(res.message || (res.success ? '导入完成' : '导入失败'));
      if (res.success) onConfigUpdated();
    } catch (err: any) {
      setImportMsg(`导入失败：${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateCliShortcut = async () => {
    setIsCreatingShortcut(true);
    setShortcutMsg('');
    try {
      const res = await api.createCliShortcut();
      setShortcutMsg(res.message || (res.ok ? '完成' : '失败'));
    } catch (err: any) {
      setShortcutMsg(`创建失败：${err?.message || String(err)}`);
    } finally {
      setIsCreatingShortcut(false);
    }
  };

  return (
    <div id="settings-drawer" className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--paper)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="serif-title" style={{ fontSize: '18px', margin: 0 }}>
              设置
            </h2>
            {config?.appVersion && (
              <span
                id="settings-app-version"
                style={{
                  fontSize: '11px',
                  color: 'var(--ink-muted)',
                  fontFamily: 'monospace',
                  background: 'var(--surface)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  lineHeight: '1.4',
                }}
              >
                v{config.appVersion}
              </span>
            )}
          </div>
          <button className="secondary-button" style={{ padding: '4px 8px' }} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* X 账号 */}
          <div style={{ marginBottom: '24px' }}>
            <h3 className="serif-title" style={{ fontSize: '15px', margin: '0 0 10px 0', color: 'var(--ink)' }}>
              X 账号
            </h3>
            <div className="surface" style={{ padding: '14px', background: 'var(--paper)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>连接状态:</span>
                <span className={`badge ${config?.hasXCredentials ? 'badge-ok' : 'badge-amber'}`}>
                  <span className="badge-dot" />
                  {config?.hasXCredentials ? '已连接' : '未连接'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
                {screenName ? `@${screenName}` : '未检测到 X 会话'}
              </div>
              {/* 从日常浏览器读取登录态。登录动作由真实浏览器完成，应用只读取既有会话，
                  不与 X 的自动化风控对抗——自动化登录已实测不可行。 */}
              <div style={{ marginTop: '4px' }}>
                <button
                  className="cta-button"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={isImporting}
                  onClick={handleImportFromBrowser}
                >
                  <span>{isImporting ? '正在读取并验证...' : '从 Chrome 读取登录态'}</span>
                  <InfoTip text="先在日常 Chrome 中登录 x.com，再点此按钮导入完整会话（含设备指纹与 Cloudflare 凭证），无需打开开发者工具。仅 macOS 可用。" />
                </button>
                {importMsg && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: importMsg.includes('已从浏览器导入') ? 'var(--green-moss)' : 'var(--amber)',
                      marginTop: '8px',
                      lineHeight: '1.5',
                    }}
                  >
                    {importMsg}
                  </div>
                )}
              </div>

              {/* 手动 Cookie 凭据输入（备用通道） */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed var(--line-strong)' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: '6px' }}>
                  手动填入 Cookie
                  <InfoTip
                    label="取值方法"
                    text="在系统浏览器登录 x.com 后，打开 DevTools → Application → Cookies → https://x.com，复制 auth_token 与 ct0 填入下方，保存即生效。"
                  />
                </label>
                <input
                  className="text-input"
                  type="password"
                  placeholder="auth_token"
                  value={xAuthToken}
                  onChange={(e) => setXAuthToken(e.target.value)}
                  style={{ marginBottom: '6px', fontSize: '12px' }}
                />
                <input
                  className="text-input"
                  type="password"
                  placeholder="ct0"
                  value={xCt0}
                  onChange={(e) => setXCt0(e.target.value)}
                  style={{ fontSize: '12px' }}
                />
              </div>
            </div>
          </div>

          {/* 命令行快捷方式：为安装版用户提供免 pnpm 的 CLI 入口 */}
          <div style={{ marginBottom: '24px' }}>
            <h3 className="serif-title" style={{ fontSize: '15px', margin: '0 0 10px 0', color: 'var(--ink)' }}>
              命令行
            </h3>
            <div className="surface" style={{ padding: '14px', background: 'var(--paper)' }}>
              <button
                className="cta-button"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={isCreatingShortcut}
                onClick={handleCreateCliShortcut}
              >
                <span>{isCreatingShortcut ? '正在创建...' : '创建命令行快捷方式'}</span>
                <InfoTip text="在 ~/bin 下创建 xtract 命令并自动配置 PATH。创建后在终端直接运行 xtract 即可使用全部 CLI 能力（如 xtract --list）。仅安装版可用。" />
              </button>
              {shortcutMsg && (
                <div
                  style={{
                    fontSize: '11px',
                    color: shortcutMsg.startsWith('已创建') || shortcutMsg.startsWith('命令已存在') ? 'var(--green-moss)' : 'var(--amber)',
                    marginTop: '8px',
                    lineHeight: '1.5',
                    wordBreak: 'break-all',
                  }}
                >
                  {shortcutMsg}
                </div>
              )}
            </div>
          </div>

          {/* 模型服务 */}
          <div style={{ marginBottom: '24px' }}>
            <h3 className="serif-title" style={{ fontSize: '15px', margin: '0 0 10px 0', color: 'var(--ink)' }}>
              模型服务
            </h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                提供商
              </label>
              <select
                className="select-input"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
                <option value="deepseek">DeepSeek</option>
                <option value="qwen-token-plan">阿里通义千问</option>
                <option value="zhipu-code-plan">智谱清言</option>
                <option value="minimax">MiniMax</option>
                <option value="kimi">月之暗面 Kimi</option>
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                认证方式
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div
                  className={`fmt-chip ${authMode === 'api_key' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setAuthMode('api_key')}
                >
                  API Key
                </div>
                <div
                  className={`fmt-chip ${authMode === 'account' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setAuthMode('account')}
                >
                  账号免 Key
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                模型名称
              </label>
              <input
                id="input-model-name"
                className="text-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                API Key
              </label>
              <input
                className="text-input"
                type="password"
                placeholder="sk-••••••••••••••••"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            {/* 深度思考开关与分级配置 */}
            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    深度思考
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    id="reasoning-toggle"
                    checked={reasoningEnabled}
                    onChange={(e) => setReasoningEnabled(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              {reasoningEnabled && (
                <div id="reasoning-effort-container" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--line-strong)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: '6px' }}>
                    思考深度
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div
                      className={`fmt-chip ${reasoningEffort === 'low' ? 'active' : ''}`}
                      onClick={() => setReasoningEffort('low')}
                    >
                      轻量
                    </div>
                    <div
                      className={`fmt-chip ${reasoningEffort === 'medium' ? 'active' : ''}`}
                      onClick={() => setReasoningEffort('medium')}
                    >
                      标准
                    </div>
                    <div
                      className={`fmt-chip ${reasoningEffort === 'high' ? 'active' : ''}`}
                      onClick={() => setReasoningEffort('high')}
                    >
                      深度
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 抓取过滤规则 */}
          <div style={{ marginBottom: '24px' }}>
            <h3 className="serif-title" style={{ fontSize: '15px', margin: '0 0 10px 0', color: 'var(--ink)' }}>
              抓取过滤规则
            </h3>
            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>拉取内容类型</span>
                  <InfoTip text="控制关注流、博主追踪、列表与关键词搜索批量拉取的推文形态（默认仅拉取 X Article 专栏文章）。单推链接精准同步与趋势研报热点挖掘不受此过滤限制。" />
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                  已选 {contentTypes.length} 项
                </span>
              </div>

              <div
                role="group"
                aria-label="拉取内容类型多选"
                style={{ display: 'flex', gap: '8px', marginTop: '10px' }}
              >
                {CONTENT_TYPE_OPTIONS.map((opt) => {
                  const active = contentTypes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      id={`content-type-${opt.value}`}
                      className={`fmt-chip ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      style={{ flex: 1, justifyContent: 'center', padding: '6px 10px' }}
                      onClick={() => handleToggleContentType(opt.value)}
                    >
                      <span style={{ fontSize: '11px', display: 'inline-block', width: '11px', textAlign: 'center' }}>
                        {active ? '✓' : ''}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {contentTypeGuardMsg && (
                <div
                  id="content-type-guard-msg"
                  role="alert"
                  style={{
                    marginTop: '8px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--amber-wash)',
                    color: 'var(--amber)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>⚠️</span>
                  <span>至少保留一种拉取类型</span>
                </div>
              )}
            </div>

            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>抓取作者追评与追加回复</span>
                  <InfoTip text="单篇推文抓取时，是否一并拉取作者本人在下方追加的连续回复/长串推文（默认关闭，仅保留主推文本体）。" />
                </div>
                <label className="switch" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    id="fetch-author-replies-toggle"
                    checked={fetchAuthorReplies}
                    onChange={(e) => setFetchAuthorReplies(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>导出归档时自动下载视频</span>
                  <InfoTip text="默认关闭（推荐按需在播放器内点击下载）。开启后，生成单推 Page Bundle 或批量导出时将自动流式下载推文及文章内嵌视频到 videos/ 目录。" />
                </div>
                <label className="switch" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    id="auto-download-videos-toggle"
                    checked={autoDownloadVideos}
                    onChange={(e) => setAutoDownloadVideos(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>

          {/* 数据存储位置 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 className="serif-title" style={{ fontSize: '15px', margin: 0, color: 'var(--ink)' }}>
                数据存储位置
              </h3>
              {storageRoot !== '~/Documents/Xtract' && (
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: '11px', padding: '2px 8px', height: '22px' }}
                  onClick={() => setStorageRoot('~/Documents/Xtract')}
                  title="恢复默认路径 ~/Documents/Xtract"
                >
                  恢复默认
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div
                id="storage-root-picker"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--paper)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  minWidth: 0,
                }}
                onClick={handleSelectDirectory}
                title="点击选择存储目录"
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>📁</span>
                <input
                  id="storage-root-input"
                  className="text-input"
                  style={{
                    flex: 1,
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                  type="text"
                  value={storageRoot}
                  readOnly
                  placeholder="~/Documents/Xtract"
                />
              </div>
              <button
                type="button"
                id="select-dir-btn"
                className="secondary-button"
                style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                onClick={handleSelectDirectory}
              >
                选择目录...
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ fontSize: '12px', padding: '6px 10px', whiteSpace: 'nowrap' }}
                onClick={() => api.openPath(storageRoot)}
                title="在访达 (Finder) 中打开当前目录"
              >
                打开 ↗
              </button>
            </div>
          </div>

          {/* 网络代理 */}
          <div>
            <h3 className="serif-title" style={{ fontSize: '15px', margin: '0 0 10px 0', color: 'var(--ink)' }}>
              网络代理
            </h3>
            <input
              className="text-input"
              type="text"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            />
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)' }}>
          <div id="settings-footer-version" style={{ fontSize: '12px', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
            {config?.appVersion ? `Xtract v${config.appVersion}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="cta-button" onClick={handleSave} disabled={isSaving}>
              {saveSuccess ? '已保存' : isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
