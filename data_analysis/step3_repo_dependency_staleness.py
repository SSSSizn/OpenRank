import json
import time
import requests
from datetime import datetime, timezone
from typing import Dict, List
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# =========================
# 基本配置
# =========================
TOKEN_FILE = "github_token.txt"
REPO_LIST_FILE = "sampled_repos_buckets.json"
OUTPUT_FILE = "sampled_repo_dependency_staleness.json"

DEPENDENCY_FILES = [
    "requirements.txt",
    "pyproject.toml",
]

TIME_FORMAT = "%a, %d %b %Y %H:%M:%S %Z"

# =========================
# GitHub Session
# =========================
def load_token(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def create_session(token: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json"
    })

    retries = Retry(
        total=5,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    return session


SESSION = create_session(load_token(TOKEN_FILE))


# =========================
# 时间工具
# =========================
def parse_github_time(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def days_between(t1: datetime, t2: datetime) -> int:
    return abs((t1 - t2).days)


# =========================
# GitHub API
# =========================
def get_repo_updated_time(full_name: str) -> datetime:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}"
    resp = SESSION.get(url, timeout=10)
    resp.raise_for_status()
    return parse_github_time(resp.json()["updated_at"])


def get_file_last_modified(full_name: str, path: str) -> datetime | None:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    resp = SESSION.get(url, timeout=10)
    if resp.status_code != 200:
        return None

    last_modified = resp.headers.get("Last-Modified")
    if not last_modified:
        return None

    return datetime.strptime(last_modified, TIME_FORMAT).replace(tzinfo=timezone.utc)


# =========================
# Step 3 核心分析
# =========================
def analyze_repo(repo: Dict) -> Dict:
    full_name = repo["full_name"]

    result = {
        "full_name": full_name,
        "repo_updated_at": None,
        "dependency_files": {},
        "max_staleness_vs_repo_days": None,
        "max_staleness_vs_now_days": None,
    }

    try:
        repo_time = get_repo_updated_time(full_name)
    except Exception as e:
        print(f"[WARN] Repo API failed {full_name}: {e}")
        return result

    result["repo_updated_at"] = repo_time.isoformat()

    now = datetime.now(timezone.utc)

    staleness_vs_repo = []
    staleness_vs_now = []

    for dep in DEPENDENCY_FILES:
        dep_time = get_file_last_modified(full_name, dep)
        if not dep_time:
            continue

        vs_repo = days_between(repo_time, dep_time)
        vs_now = days_between(now, dep_time)

        result["dependency_files"][dep] = {
            "last_modified": dep_time.isoformat(),
            "days_behind_repo": vs_repo,
            "days_behind_now": vs_now,
        }

        staleness_vs_repo.append(vs_repo)
        staleness_vs_now.append(vs_now)

        time.sleep(0.2)

    if staleness_vs_repo:
        result["max_staleness_vs_repo_days"] = max(staleness_vs_repo)

    if staleness_vs_now:
        result["max_staleness_vs_now_days"] = max(staleness_vs_now)

    time.sleep(0.5)
    return result


# =========================
# 主程序
# =========================
def main():
    with open(REPO_LIST_FILE, "r", encoding="utf-8") as f:
        repos = json.load(f)

    results = []
    for repo in repos:
        print(f"[INFO] Step3 analyzing {repo['full_name']}")
        results.append(analyze_repo(repo))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Step3 saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
