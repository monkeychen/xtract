import React, { useState, useEffect } from 'react';
import { X, Check, Globe, Key, Shield, RefreshCw } from 'lucide-react';
import type { AppConfigView } from '../types.js';
import { api } from '../services/api.js';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [proxy, setProxy] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [authMode, setAuthMode] = useState('api_key');
  const [model, setModel] = useState('gemini-3.8-flash');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getConfig().then((cfg) => {
        setConfig(cfg);
        setProxy(cfg.httpProxy || '');
        setProvider(cfg.llmProvider || 'gemini');
        setAuthMode(cfg.llmAuthMode || 'api_key');
        setModel(cfg.llmModel || 'gemini-3.8-flash');
      });
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    switch (newProvider) {
      case 'gemini':
        setModel('gemini-3.8-flash');
        break;
      case 'openai':
        setModel('gpt-5.6-sol');
        break;
      case 'deepseek':
        setModel('deepseek-flash');
        break;
      case 'qwen':
      case 'qwen-token-plan':
        setModel('qwen3.8-flash');
        break;
      case 'zhipu':
      case 'zhipu-code-plan':
        setModel('glm-5.3-flash');
        break;
      case 'minimax':
        setModel('MiniMax-M3');
        break;
      case 'kimi':
        setModel('kimi-k3');
        break;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const updates: Record<string, string> = {
      HTTP_PROXY: proxy,
      LLM_PROVIDER: provider,
      LLM_AUTH_MODE: authMode,
      LLM_MODEL: model,
    };
    if (apiKey.trim()) {
      // Map API key to corresponding env key
      const keyMap: Record<string, string> = {
        gemini: 'GEMINI_API_KEY',
        openai: 'OPENAI_API_KEY',
        deepseek: 'DEEPSEEK_API_KEY',
        qwen: 'DASHSCOPE_API_KEY',
        'qwen-token-plan': 'DASHSCOPE_API_KEY',
        zhipu: 'ZHIPU_API_KEY',
        'zhipu-code-plan': 'ZHIPU_API_KEY',
        minimax: 'MINIMAX_API_KEY',
        kimi: 'MOONSHOT_API_KEY',
      };
      const envKey = keyMap[provider];
      if (envKey) updates[envKey] = apiKey.trim();
    }

    await api.updateConfig(updates);
    setIsSaving(false);
    setSaveSuccess(true);
    onConfigUpdated();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleTriggerLogin = async () => {
    setIsLoggingIn(true);
    try {
      await api.login('x');
      const updated = await api.getConfig();
      setConfig(updated);
      onConfigUpdated();
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--paper)',
          }}
        >
          <div>
            <h2 className="serif-title" style={{ fontSize: '18px' }}>
              偏好设置 (Settings)
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
              多模型引擎、X 官方凭据与网络代理
            </p>
          </div>
          <button
            className="text-button"
            onClick={onClose}
            style={{ padding: '6px', borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Section 1: X 官方账号认证 */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Globe size={16} style={{ color: 'var(--cinnabar)' }} />
              <h3 className="serif-title" style={{ fontSize: '15px' }}>
                X 官方会话凭据 (Cookie Capture)
              </h3>
            </div>

            <div
              className="surface"
              style={{ padding: '16px', background: 'var(--paper)', display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>会话状态</span>
                <span className={`badge ${config?.hasXCredentials ? 'badge-ok' : 'badge-amber'}`}>
                  <span className="badge-dot" />
                  {config?.hasXCredentials ? '已捕获持久化 Cookie' : '未登录 / 凭据缺失'}
                </span>
              </div>

              {config?.xAuthTokenMasked && (
                <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
                  auth_token: {config.xAuthTokenMasked}
                </div>
              )}

              <button
                className="secondary-button"
                onClick={handleTriggerLogin}
                disabled={isLoggingIn}
                style={{ marginTop: '4px', width: '100%', justifyContent: 'center' }}
              >
                <RefreshCw size={14} className={isLoggingIn ? 'animate-spin' : ''} />
                <span>{isLoggingIn ? '正在弹出登录窗口...' : '打开登录窗口自动截获'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: 大模型与双轨认证 */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Key size={16} style={{ color: 'var(--cinnabar)' }} />
              <h3 className="serif-title" style={{ fontSize: '15px' }}>
                AI 推理模型调度 (7 大主流大模型)
              </h3>
            </div>

            <div className="settings-field">
              <label className="settings-label">
                <span>提供商 (LLM Provider)</span>
                <span className="settings-hint">支持国内外主流模型及专属算力端点</span>
              </label>
              <select
                className="select-input"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                <option value="gemini">Google Gemini (默认 gemini-3.8-flash)</option>
                <option value="openai">OpenAI GPT (默认 gpt-5.6-sol)</option>
                <option value="deepseek">DeepSeek (默认 deepseek-flash)</option>
                <option value="qwen-token-plan">阿里通义千问 (Token Plan 专属端点)</option>
                <option value="qwen">阿里通义千问 (普通 DashScope 端点)</option>
                <option value="zhipu-code-plan">智谱清言 (Coding Plan 专属端点)</option>
                <option value="zhipu">智谱清言 (普通开放平台端点)</option>
                <option value="minimax">MiniMax (默认 MiniMax-M3)</option>
                <option value="kimi">月之暗面 Kimi (默认 kimi-k3)</option>
              </select>
            </div>

            <div className="settings-field">
              <label className="settings-label">
                <span>认证模式 (Auth Mode)</span>
                <span className="settings-hint">API Key 或订阅账号免 Key 模式</span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div
                  className={`fmt-chip ${authMode === 'api_key' ? 'active' : ''}`}
                  onClick={() => setAuthMode('api_key')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  API-Key 模式
                </div>
                <div
                  className={`fmt-chip ${authMode === 'account' ? 'active' : ''}`}
                  onClick={() => setAuthMode('account')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  账号订阅模式 (免Key)
                </div>
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">
                <span>模型名称 (Model Identifier)</span>
                <span className="settings-hint">全量默认开启 High 级深度推理</span>
              </label>
              <input
                className="text-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            {authMode === 'api_key' && (
              <div className="settings-field">
                <label className="settings-label">
                  <span>API Key</span>
                  <span className="settings-hint">本地安全落盘，不进代码库</span>
                </label>
                <input
                  className="text-input"
                  type="password"
                  placeholder="sk-••••••••••••••••"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Section 3: 网络与代理 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Shield size={16} style={{ color: 'var(--cinnabar)' }} />
              <h3 className="serif-title" style={{ fontSize: '15px' }}>
                网络代理穿透 (HTTP Proxy)
              </h3>
            </div>

            <div className="settings-field">
              <label className="settings-label">
                <span>代理地址 (Proxy URL)</span>
                <span className="settings-hint">国内访问 X 及外网模型必备</span>
              </label>
              <input
                className="text-input"
                type="text"
                placeholder="http://127.0.0.1:7890"
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--paper)',
          }}
        >
          {saveSuccess ? (
            <span style={{ fontSize: '13px', color: 'var(--jade)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={16} /> 已保存生效
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>所有变更即时更新本地配置</span>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="cta-button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '正在保存...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
