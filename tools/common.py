"""Shared helpers for the data tools: folder paths, downloads, JSON writing.

Every tool writes small, simple JSON (arrays of flat objects) into src/data/,
so the files convert 1:1 into Luau tables for the Roblox port.
Big raw downloads go in tools/raw/ (gitignored).
"""

import json
import os
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "src" / "data"
PUBLIC_DIR = ROOT / "public"
RAW_DIR = ROOT / "tools" / "raw"

# A generic name, so no personal details are sent to any server.
USER_AGENT = "disastronauts-data-tools/1.0"

# Python on macOS often has no trusted certificates; certifi supplies them.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


DEMO_KEY = "DEMO_KEY"  # NASA's public shared key (low rate limit)


def personal_api_key() -> str | None:
    """Your own NASA_API_KEY from the environment or the project's .env file (None if not set).

    The key is a secret: only send it to api.nasa.gov, never print it or
    write it into src/, public/ or any JSON file.
    """
    key = os.environ.get("NASA_API_KEY")
    env_file = ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.strip().startswith("NASA_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key or key == "your_key_here":
        return None
    return key


def hide_key(text: str) -> str:
    """Replace your personal key with *** so it never shows up in printed messages."""
    key = personal_api_key()
    return text.replace(key, "***") if key else text


def fetch_nasa_api_json(url_template: str):
    """Download JSON from api.nasa.gov: first with your NASA_API_KEY, then with DEMO_KEY.

    `url_template` contains {key} where the key goes. If your key is missing,
    rejected or rate limited, it tries again with DEMO_KEY. Error messages
    never contain your key.
    """
    key = personal_api_key()
    attempts = [("your NASA_API_KEY", key)] if key else []
    attempts.append(("DEMO_KEY", DEMO_KEY))
    last_error: Exception | None = None
    for label, k in attempts:
        try:
            return fetch_json(url_template.format(key=k))
        except Exception as err:  # bad key, rate limit, or the service is down
            last_error = err
            print(f"api.nasa.gov with {label} failed: {hide_key(str(err))}")
    raise RuntimeError(f"api.nasa.gov failed with every key: {hide_key(str(last_error))}")


def fetch(url: str, headers: dict | None = None, tries: int = 3, timeout: int = 120) -> bytes:
    """Download a URL (retrying a couple of times on network hiccups)."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=SSL_CONTEXT) as response:
                return response.read()
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == tries:
                raise
        except urllib.error.URLError:
            if attempt == tries:
                raise
        time.sleep(2 * attempt)
    raise RuntimeError("unreachable")


def fetch_json(url: str, **kwargs):
    return json.loads(fetch(url, **kwargs))


def write_json(path: Path, data) -> None:
    """Write JSON that is small but still readable in a diff (one item per line)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, dict):
        parts = []
        for key, value in data.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                rows = ",\n    ".join(json.dumps(v, ensure_ascii=False) for v in value)
                parts.append(f'  "{key}": [\n    {rows}\n  ]')
            else:
                parts.append(f'  "{key}": {json.dumps(value, ensure_ascii=False)}')
        text = "{\n" + ",\n".join(parts) + "\n}\n"
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
