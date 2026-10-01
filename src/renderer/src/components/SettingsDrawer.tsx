import React, { useState, useEffect } from 'react';
import type { AppConfigView } from '../types.js';
import { api } from '../services/api.js';

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
  const [onlyLongTweets, setOnlyLongTweets] = useState(true);
  const [fetchAuthorReplies, setFetchAuthorReplies] = useState(false);
  const [storageRoot, setStorageRoot] = useState('~/Documents/Xtract');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

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
        setOnlyLongTweets(cfg.onlyLongTweets !== false);
        setFetchAuthorReplies(cfg.fetchAuthorReplies === true);
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

  const handleSave = async () => {
    setIsSaving(true);
    await api.updateConfig({
      HTTP_PROXY: proxy,
      LLM_PROVIDER: provider,
      LLM_AUTH_MODE: authMode,
      LLM_MODEL: model,
      LLM_REASONING_ENABLED: String(reasoningEnabled),
      LLM_REASONING_EFFORT: reasoningEffort,
      FETCH_ONLY_LONG_TWEETS: String(onlyLongTweets),
      FETCH_AUTHOR_REPLIES: String(fetchAuthorReplies),
      XTRACT_STORAGE_ROOT: storageRoot,
    });
    setIsSaving(false);
    onConfigUpdated();
    onClose();
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginMsg('正在拉起登录窗口，请在弹出的浏览器中登录...');
    try {
      const res = await api.login('x');
      if (res.success) {
        setLoginMsg('登录成功！已保存会话');
        const cfg = await api.getConfig();
        setConfig(cfg);
        onConfigUpdated();
        setTimeout(() => setLoginMsg(null), 3000);
      } else {
        setLoginMsg(res.error || '登录已取消');
        setTimeout(() => setLoginMsg(null), 4000);
      }
    } catch (err: any) {
      setLoginMsg(err?.message || '登录出错');
      setTimeout(() => setLoginMsg(null), 4000);
    } finally {
      setIsLoggingIn(false);
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
          <div>
            <h2 className="serif-title" style={{ fontSize: '18px' }}>
              设置
            </h2>
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
              <button
                className="secondary-button"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={isLoggingIn}
                onClick={handleLogin}
              >
                <span>{isLoggingIn ? '正在登录中（请在弹窗操作）...' : '重新登录'}</span>
              </button>
              {loginMsg && (
                <div style={{ fontSize: '11px', color: loginMsg.includes('成功') ? 'var(--green-moss)' : 'var(--amber)', marginTop: '8px', textAlign: 'center' }}>
                  {loginMsg}
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
            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ paddingRight: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    仅抓取长推文与专栏文章
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: 1.4 }}>
                    默认开启。自动过滤普通短推文与闲聊碎碎念，仅保留长推文 (Note Tweet) 和专栏文章 (X Article)
                  </div>
                </div>
                <label className="switch" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    id="only-long-tweets-toggle"
                    checked={onlyLongTweets}
                    onChange={(e) => setOnlyLongTweets(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            <div className="surface" style={{ padding: '14px', background: 'var(--paper-sunken)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ paddingRight: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    抓取作者追评与追加回复
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: 1.4 }}>
                    单篇推文抓取时，是否一并拉取作者本人在下方追加的连续回复/长串推文（默认关闭，仅抓取推文本体）
                  </div>
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
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--paper)' }}>
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="cta-button" onClick={handleSave} disabled={isSaving}>
            {saveSuccess ? '已保存' : isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
