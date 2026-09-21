import pytest
from unittest.mock import patch, MagicMock
from src.llm.factory import get_llm_provider
from src.llm.openai_compat import OpenAICompatProvider
from src.llm.gemini_account import GeminiAccountProvider
from src.llm.chatgpt_account import ChatGPTAccountProvider


def test_factory_openai_compat_presets():
    # 1. DeepSeek (Latest 2026 model: deepseek-flash)
    ds = get_llm_provider("deepseek", auth_mode="api_key")
    assert isinstance(ds, OpenAICompatProvider)
    assert "Deepseek" in ds.provider_name
    assert ds.model_name == "deepseek-flash"
    assert "api.deepseek.com" in ds.base_url

    # 2. Qwen (Default: qwen3.8-flash)
    qwen = OpenAICompatProvider(provider="qwen", api_key="sk-standard-test-key")
    assert isinstance(qwen, OpenAICompatProvider)
    assert qwen.model_name == "qwen3.8-flash"
    assert "dashscope.aliyuncs.com" in qwen.base_url

    # 3. Zhipu GLM & GLM alias (Default: glm-5.3-flash)
    zhipu = get_llm_provider("zhipu", auth_mode="api_key")
    assert isinstance(zhipu, OpenAICompatProvider)
    assert zhipu.model_name == "glm-5.3-flash"

    glm = get_llm_provider("glm", auth_mode="api_key")
    assert isinstance(glm, OpenAICompatProvider)
    assert glm.model_name == "glm-5.3-flash"
    assert "bigmodel.cn" in glm.base_url

    # 4. MiniMax (Latest 2026 model: MiniMax-M3)
    minimax = get_llm_provider("minimax", auth_mode="api_key")
    assert isinstance(minimax, OpenAICompatProvider)
    assert minimax.model_name == "MiniMax-M3"
    assert "api.minimax.chat" in minimax.base_url

    # 5. Kimi (Moonshot AI Latest: kimi-k3)
    kimi = get_llm_provider("kimi", auth_mode="api_key")
    assert isinstance(kimi, OpenAICompatProvider)
    assert kimi.model_name == "kimi-k3"
    assert "api.moonshot.cn" in kimi.base_url

    # 6. OpenAI & GPT alias (Default: gpt-5.6-sol)
    gpt = get_llm_provider("gpt", auth_mode="api_key")
    assert isinstance(gpt, OpenAICompatProvider)
    assert gpt.model_name == "gpt-5.6-sol"

    gpt_sol = get_llm_provider("openai", auth_mode="api_key", model="GPT-5.6 Sol")
    assert gpt_sol.model_name == "gpt-5.6-sol"

    # 7. Gemini (API Key mode: gemini-3.8-flash)
    gemini_api = get_llm_provider("gemini", auth_mode="api_key")
    assert isinstance(gemini_api, OpenAICompatProvider)
    assert gemini_api.model_name == "gemini-3.8-flash"

    # Model override
    custom_model = get_llm_provider("deepseek", auth_mode="api_key", model="deepseek-v4-pro")
    assert custom_model.model_name == "deepseek-v4-pro"


def test_factory_account_providers():
    # Gemini account provider (consumes Google subscription quota via agy)
    gemini_acc = get_llm_provider("gemini", auth_mode="account")
    assert isinstance(gemini_acc, GeminiAccountProvider)
    assert "Gemini" in gemini_acc.provider_name
    assert "Account Mode" in gemini_acc.provider_name
    assert gemini_acc.model_name == "gemini-3.8-flash"

    # ChatGPT account provider (consumes Plus session)
    chatgpt_acc = get_llm_provider("openai", auth_mode="account")
    assert isinstance(chatgpt_acc, ChatGPTAccountProvider)
    assert "ChatGPT" in chatgpt_acc.provider_name
    assert "Account Mode" in chatgpt_acc.provider_name
    assert chatgpt_acc.model_name == "gpt-5.6-sol"


def test_factory_invalid_provider_in_account_mode():
    with pytest.raises(ValueError, match="暂不支持账号订阅认证模式"):
        get_llm_provider("kimi", auth_mode="account")


def test_gemini_account_generate():
    provider = GeminiAccountProvider(model_name="gemini-3.8-flash")
    
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="Summary of trends:\n1. Claude 3.7 released",
            stderr=""
        )
        result = provider.generate("Summarize trends")
        assert "Claude 3.7 released" in result
        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert "agy" in args
        assert "--model" in args
        assert "gemini-3.8-flash" in args
        assert "--effort" in args
        assert "high" in args


def test_openai_compat_generate():
    provider = OpenAICompatProvider(
        provider="kimi",
        api_key="test-key",
        base_url="https://api.moonshot.cn/v1",
        model_name="kimi-k3"
    )

    with patch("httpx.Client.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "choices": [
                    {
                        "message": {
                            "content": "Kimi response content"
                        }
                    }
                ]
            }
        )
        result = provider.generate("Test prompt")
        assert result == "Kimi response content"
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        payload = kwargs.get("json", {})
        # Verify reasoning_effort is high by default
        assert payload.get("reasoning_effort") == "high"


def test_qwen_token_plan_and_zhipu_code_plan():
    # Explicit Qwen Token Plan provider (canonical hyphen and underscore)
    qwen_tp = get_llm_provider("qwen-token-plan", auth_mode="api_key")
    assert isinstance(qwen_tp, OpenAICompatProvider)
    assert "token-plan.cn-beijing.maas.aliyuncs.com" in qwen_tp.base_url
    assert "Token Plan" in qwen_tp.provider_name
    assert qwen_tp.model_name == "qwen3.8-flash"

    # Auto-detection of Qwen Token Plan by sk-sp- API key prefix
    qwen_auto = OpenAICompatProvider(provider="qwen", api_key="sk-sp-1234567890abcdef")
    assert "token-plan.cn-beijing.maas.aliyuncs.com" in qwen_auto.base_url
    assert "Token Plan" in qwen_auto.provider_name
    assert qwen_auto.model_name == "qwen3.8-flash"

    # Model mapping on Token Plan
    qwen_mapped = OpenAICompatProvider(provider="qwen-token-plan", api_key="sk-sp-test", model_name="qwen-plus")
    assert qwen_mapped.model_name == "qwen3.7-plus"

    # Explicit Zhipu Code Plan provider (canonical hyphen)
    zhipu_cp = get_llm_provider("zhipu-code-plan", auth_mode="api_key")
    assert isinstance(zhipu_cp, OpenAICompatProvider)
    assert "open.bigmodel.cn/api/coding/paas/v4" in zhipu_cp.base_url
    assert "Code Plan" in zhipu_cp.provider_name
    assert zhipu_cp.model_name == "glm-5.3-flash"

    # Legacy/compatibility aliases
    glm_cp = get_llm_provider("glm_code_plan", auth_mode="api_key")
    assert isinstance(glm_cp, OpenAICompatProvider)
    assert "open.bigmodel.cn/api/coding/paas/v4" in glm_cp.base_url
    assert "Code Plan" in glm_cp.provider_name


def test_reasoning_and_multimodal_payloads():
    # 1. Zhipu thinking: {"type": "enabled"} and reasoning_effort: "high"
    zhipu = OpenAICompatProvider(provider="zhipu", api_key="test-key", model_name="glm-5.3-flash")
    with patch("httpx.Client.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"choices": [{"message": {"content": "Zhipu OK"}}]})
        zhipu.generate("Hello Zhipu")
        payload = mock_post.call_args[1].get("json", {})
        assert payload.get("thinking") == {"type": "enabled"}
        assert payload.get("reasoning_effort") == "high"

    # 2. Qwen enable_thinking: True and reasoning_effort: "high"
    qwen = OpenAICompatProvider(provider="qwen", api_key="test-key", model_name="qwen3.8-flash")
    with patch("httpx.Client.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"choices": [{"message": {"content": "Qwen OK"}}]})
        qwen.generate("Hello Qwen")
        payload = mock_post.call_args[1].get("json", {})
        assert payload.get("enable_thinking") is True
        assert payload.get("reasoning_effort") == "high"

    # 3. MiniMax thinking: {"type": "enabled"} and reasoning_split: True
    minimax = OpenAICompatProvider(provider="minimax", api_key="test-key", model_name="MiniMax-M3")
    with patch("httpx.Client.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"choices": [{"message": {"content": "MiniMax OK"}}]})
        minimax.generate("Hello MiniMax")
        payload = mock_post.call_args[1].get("json", {})
        assert payload.get("thinking") == {"type": "enabled"}
        assert payload.get("reasoning_split") is True

    # 4. Multimodal image input support
    openai = OpenAICompatProvider(provider="openai", api_key="test-key", model_name="gpt-5.6-sol")
    with patch("httpx.Client.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"choices": [{"message": {"content": "OpenAI Multimodal OK"}}]})
        openai.generate("Describe image", images=["https://example.com/cat.png"])
        payload = mock_post.call_args[1].get("json", {})
        assert payload.get("reasoning_effort") == "high"
        user_content = payload["messages"][0]["content"]
        assert isinstance(user_content, list)
        assert user_content[0]["type"] == "text"
        assert user_content[1]["type"] == "image_url"
        assert user_content[1]["image_url"]["url"] == "https://example.com/cat.png"
