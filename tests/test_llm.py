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

    # 2. Qwen (DashScope)
    qwen = get_llm_provider("qwen", auth_mode="api_key")
    assert isinstance(qwen, OpenAICompatProvider)
    assert qwen.model_name == "qwen-plus"
    assert "dashscope.aliyuncs.com" in qwen.base_url

    # 3. Zhipu GLM & GLM alias
    zhipu = get_llm_provider("zhipu", auth_mode="api_key")
    assert isinstance(zhipu, OpenAICompatProvider)
    assert zhipu.model_name == "glm-4-plus"

    glm = get_llm_provider("glm", auth_mode="api_key")
    assert isinstance(glm, OpenAICompatProvider)
    assert glm.model_name == "glm-4-plus"
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

    # 6. OpenAI & GPT alias
    gpt = get_llm_provider("gpt", auth_mode="api_key")
    assert isinstance(gpt, OpenAICompatProvider)
    assert gpt.model_name == "gpt-4o"

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

    # ChatGPT account provider (consumes Plus session)
    chatgpt_acc = get_llm_provider("openai", auth_mode="account")
    assert isinstance(chatgpt_acc, ChatGPTAccountProvider)
    assert "ChatGPT" in chatgpt_acc.provider_name
    assert "Account Mode" in chatgpt_acc.provider_name


def test_factory_invalid_provider_in_account_mode():
    with pytest.raises(ValueError, match="暂不支持账号订阅认证模式"):
        get_llm_provider("kimi", auth_mode="account")


def test_gemini_account_generate():
    provider = GeminiAccountProvider(model_name="gemini-3.7-flash-high")
    
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
        assert "gemini-3.7-flash-high" in args


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
