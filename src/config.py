from pathlib import Path
import os
from dotenv import load_dotenv

# Load .env from project root
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Config:
    PROJECT_ROOT: Path = BASE_DIR
    DATA_DIR: Path = BASE_DIR / "data"
    RAW_DIR: Path = BASE_DIR / "data" / "raw"
    REPORTS_DIR: Path = BASE_DIR / "output" / "reports"
    DB_PATH: Path = BASE_DIR / "data" / "tweets.db"
    AUTH_STATE_PATH: Path = BASE_DIR / "data" / "auth_state.json"
    CHATGPT_AUTH_PATH: Path = BASE_DIR / "data" / "chatgpt_auth.json"
    GEMINI_AUTH_PATH: Path = BASE_DIR / "data" / "gemini_auth.json"

    # X Credentials
    X_AUTH_TOKEN: str = os.getenv("X_AUTH_TOKEN", "").strip()
    X_CT0: str = os.getenv("X_CT0", "").strip()

    # Network / Proxy Settings
    HTTP_PROXY: str = os.getenv("HTTP_PROXY", os.getenv("ALL_PROXY", "http://127.0.0.1:8118")).strip()

    # ==========================================
    # Unified LLM Settings
    # ==========================================
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    LLM_AUTH_MODE: str = os.getenv("LLM_AUTH_MODE", "account").lower().strip()
    LLM_MODEL: str = os.getenv("LLM_MODEL", "").strip()

    # API Keys Pool
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "").strip()
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "").strip()
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "").strip()
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "").strip()
    DASHSCOPE_BASE_URL: str = os.getenv("DASHSCOPE_BASE_URL", "").strip()
    ZHIPUAI_API_KEY: str = os.getenv("ZHIPUAI_API_KEY", "").strip()
    ZHIPUAI_BASE_URL: str = os.getenv("ZHIPUAI_BASE_URL", "").strip()
    MINIMAX_API_KEY: str = os.getenv("MINIMAX_API_KEY", "").strip()
    MINIMAX_BASE_URL: str = os.getenv("MINIMAX_BASE_URL", "").strip()
    MOONSHOT_API_KEY: str = os.getenv("MOONSHOT_API_KEY", "").strip()
    MOONSHOT_BASE_URL: str = os.getenv("MOONSHOT_BASE_URL", "").strip()

    # Scraping Settings
    FETCH_MAX_PAGES: int = int(os.getenv("FETCH_MAX_PAGES", "3"))
    FETCH_TIMEOUT: int = int(os.getenv("FETCH_TIMEOUT", "60"))

    @classmethod
    def ensure_dirs(cls) -> None:
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.RAW_DIR.mkdir(parents=True, exist_ok=True)
        cls.REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def validate_x_credentials(cls) -> bool:
        return cls.AUTH_STATE_PATH.exists() or bool(cls.X_AUTH_TOKEN and cls.X_CT0)

    @classmethod
    def validate_gemini_credentials(cls) -> bool:
        return bool(cls.GEMINI_API_KEY)

    @classmethod
    def validate_llm_credentials(cls, provider: str | None = None, auth_mode: str | None = None) -> tuple[bool, str]:
        prov = (provider or cls.LLM_PROVIDER).lower()
        mode = (auth_mode or cls.LLM_AUTH_MODE).lower()

        if mode == "account":
            if prov in ("gemini", "google"):
                # Account mode uses agy CLI or google_accounts/oauth_creds
                return True, ""
            elif prov in ("openai", "chatgpt", "gpt"):
                if cls.CHATGPT_AUTH_PATH.exists():
                    return True, ""
                return False, "未检测到 OpenAI 账号会话凭据，请先执行 `uv run python main.py --login openai` 进行登录。"
            else:
                return False, f"厂商 '{prov}' 暂不支持账号订阅认证，请使用 --auth-mode api_key。"

        # mode == "api_key"
        if prov in ("gemini", "google") and not cls.GEMINI_API_KEY:
            return False, "缺少 GEMINI_API_KEY，请在 .env 中配置。"
        elif prov in ("openai", "gpt") and not cls.OPENAI_API_KEY:
            return False, "缺少 OPENAI_API_KEY，请在 .env 中配置。"
        elif prov == "deepseek" and not cls.DEEPSEEK_API_KEY:
            return False, "缺少 DEEPSEEK_API_KEY，请在 .env 中配置。"
        elif prov in ("qwen", "qwen_token_plan", "qwen-token-plan") and not cls.DASHSCOPE_API_KEY:
            return False, "缺少 DASHSCOPE_API_KEY (阿里百炼 / Token Plan)，请在 .env 中配置。"
        elif prov in ("zhipu", "zhipu_code_plan", "zhipu-code-plan", "glm", "glm_code_plan", "glm-code-plan") and not cls.ZHIPUAI_API_KEY:
            return False, "缺少 ZHIPUAI_API_KEY (智谱开放平台 / Code Plan)，请在 .env 中配置。"
        elif prov == "minimax" and not cls.MINIMAX_API_KEY:
            return False, "缺少 MINIMAX_API_KEY，请在 .env 中配置。"
        elif prov == "kimi" and not cls.MOONSHOT_API_KEY:
            return False, "缺少 MOONSHOT_API_KEY (Kimi)，请在 .env 中配置。"

        return True, ""
