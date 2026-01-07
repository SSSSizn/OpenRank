import json
import time
import requests
from collections import Counter
from typing import Dict, List, Tuple
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# =========================
# 基本配置
# =========================
TOKEN_FILE = "github_token.txt"
REPO_LIST_FILE = "sampled_repos_buckets.json"
OUTPUT_FILE = "sampled_repo_issue_env_stats.json"

ISSUES_PER_REPO_LIMIT = 200   # 每个仓库最多分析多少条 issue
SLEEP_PER_REQUEST = 0.4

# ---------- 关键词体系 ----------
ENV_KEYWORDS = [
    "install", "installation", "setup",
    "environment", "dependency", "dependencies",
    "requirement", "requirements",
]

TOOLCHAIN_KEYWORDS = [
    "error", "fail", "failed", "failing",
    "cannot", "can't", "does not work",
    "broken",
    "pip", "conda", "virtualenv", "venv",
    "python version", "wheel",
]

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
# GitHub API
# =========================
def get_issues(full_name: str, per_page: int = 100, page: int = 1) -> List[Dict]:
    """
    拉取 issue（不含 PR）
    """
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    params = {
        "state": "all",
        "per_page": per_page,
        "page": page,
    }
    resp = SESSION.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


# =========================
# Issue 分类逻辑（核心）
# =========================
def is_env_related_issue(title: str, body: str) -> Tuple[(bool, List[str])]:
    """
    判定 issue 是否与环境/依赖相关
    返回：是否命中，命中的关键词
    """
    text = f"{title}\n{body}".lower()

    env_hits = [k for k in ENV_KEYWORDS if k in text]
    tool_hits = [k for k in TOOLCHAIN_KEYWORDS if k in text]

    if env_hits and tool_hits:
        return True, env_hits + tool_hits

    return False, []


# =========================
# Step 4.1 核心分析
# =========================
def analyze_repo_issues(repo: Dict) -> Dict:
    full_name = repo["full_name"]

    result = {
        "full_name": full_name,
        "total_issues": 0,
        "env_related_issues": 0,
        "env_issue_ratio": None,
        "keyword_hits": {},
    }

    keyword_counter = Counter()
    analyzed = 0
    page = 1

    while analyzed < ISSUES_PER_REPO_LIMIT:
        try:
            issues = get_issues(full_name, page=page)
        except Exception as e:
            print(f"[WARN] Issue fetch failed for {full_name}: {e}")
            break

        if not issues:
            break

        for issue in issues:
            # 排除 PR
            if "pull_request" in issue:
                continue

            title = issue.get("title", "")
            body = issue.get("body") or ""

            result["total_issues"] += 1

            is_env, hits = is_env_related_issue(title, body)
            if is_env:
                result["env_related_issues"] += 1
                keyword_counter.update(hits)

            analyzed += 1
            if analyzed >= ISSUES_PER_REPO_LIMIT:
                break

        page += 1
        time.sleep(SLEEP_PER_REQUEST)

    if result["total_issues"] > 0:
        result["env_issue_ratio"] = (
            result["env_related_issues"] / result["total_issues"]
        )

    result["keyword_hits"] = dict(keyword_counter)

    return result


# =========================
# 主程序
# =========================
def main():
    with open(REPO_LIST_FILE, "r", encoding="utf-8") as f:
        repos = json.load(f)

    results = []

    for repo in repos:
        print(f"[INFO] Step4.1 analyzing issues for {repo['full_name']}")
        info = analyze_repo_issues(repo)
        results.append(info)

        time.sleep(0.8)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Step 4.1 results saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
