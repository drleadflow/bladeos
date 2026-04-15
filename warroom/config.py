"""War Room configuration — loads voices.json and resolves paths."""

import json
import os
import subprocess

def _find_project_root() -> str:
    """Resolve project root via git or fallback to parent dir."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROJECT_ROOT = _find_project_root()
WARROOM_DIR = os.path.join(PROJECT_ROOT, "warroom")

# Load voice configs
_voices_path = os.path.join(WARROOM_DIR, "voices.json")
with open(_voices_path, "r") as f:
    AGENT_VOICES = json.load(f)

DEFAULT_AGENT = "chief-of-staff"
WARROOM_PORT = int(os.environ.get("WARROOM_PORT", "7860"))
WARROOM_MODE = os.environ.get("WARROOM_MODE", "live")  # "live" or "legacy"
WARROOM_CHAT_ID = os.environ.get("WARROOM_CHAT_ID", "warroom")
ANSWER_TIMEOUT_SEC = int(os.environ.get("WARROOM_ANSWER_TIMEOUT", "25"))
NODE_BIN = os.environ.get("NODE_BIN", "node")
