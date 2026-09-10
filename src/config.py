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

    # X Credentials
    X_AUTH_TOKEN: str = os.getenv("X_AUTH_TOKEN", "").strip()
    X_CT0: str = os.getenv("X_CT0", "").strip()

    # LLM Settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

    # Scraping Settings
    FETCH_MAX_PAGES: int = int(os.getenv("FETCH_MAX_PAGES", "3"))
    FETCH_TIMEOUT: int = int(os.getenv("FETCH_TIMEOUT", "30"))

    @classmethod
    def ensure_dirs(cls) -> None:
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.RAW_DIR.mkdir(parents=True, exist_ok=True)
        cls.REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def validate_x_credentials(cls) -> bool:
        return bool(cls.X_AUTH_TOKEN and cls.X_CT0)

    @classmethod
    def validate_gemini_credentials(cls) -> bool:
        return bool(cls.GEMINI_API_KEY)
