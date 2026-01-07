# step_4_3_onboarding_analysis.py
# ==========================================
# Step 4.3: Onboarding Friction Analysis
# - CONTRIBUTING.md 分析
# - 新贡献者 Issue / PR 环境失败分析
# ==========================================

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
OUTPUT_FILE = "sampled_repo_onboarding_stats.json"

ISSUES_PER_REPO_LIMIT = 200
PRS_PER_REPO_LIMIT = 200
SLEEP_PER_REQUEST = 0.4

# ---------- 关键词体系 ----------
ENV_KEYWORDS = [
    "install", "installation", "setup",
    "environment", "dependency", "dependencies",
    "requirement", "requirements",
]

TEST_KEYWORDS = [
    "test", "pytest", "tox", "unittest",
    "build", "ci", "lint", "coverage",
]

PR_ENV_KEYWORDS = [
    "can't build", "tests fail", "environment",
    "setup problem", "dependency",
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
# GitHub API Helper
# =========================
def get_file_content(full_name: str, path: str) -> str:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    resp = SESSION.get(url, timeout=10)
    if resp.status_code != 200:
        return ""
    data = resp.json()
    return requests.utils.unquote(data.get("content", "")) if "content" in data else ""


def get_issues(full_name: str, per_page: int = 100, page: int = 1) -> List[Dict]:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    params = {"state": "all", "per_page": per_page, "page": page}
    resp = SESSION.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_prs(full_name: str, per_page: int = 100, page: int = 1) -> List[Dict]:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    params = {"state": "closed", "per_page": per_page, "page": page}
    resp = SESSION.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


# =========================
# A. CONTRIBUTING.md 分析
# =========================
def analyze_contributing_md(full_name: str) -> Dict:
    try:
        content = get_file_content(full_name, "CONTRIBUTING.md")
        if not content:
            return {"exists": False, "total_lines": 0, "env_lines": 0, "test_lines": 0, "env_ratio": 0.0}

        lines = content.splitlines()
        total_lines = len(lines)
        env_lines = sum(1 for l in lines if any(k in l.lower() for k in ENV_KEYWORDS))
        test_lines = sum(1 for l in lines if any(k in l.lower() for k in TEST_KEYWORDS))
        env_ratio = env_lines / total_lines if total_lines > 0 else 0.0

        return {
            "exists": True,
            "total_lines": total_lines,
            "env_lines": env_lines,
            "test_lines": test_lines,
            "env_ratio": round(env_ratio, 3)
        }
    except Exception:
        return {"exists": False, "total_lines": 0, "env_lines": 0, "test_lines": 0, "env_ratio": 0.0}


# =========================
# B. 新贡献者 Issue 分析
# =========================
def is_env_related_issue(title: str, body: str) -> Tuple[bool, List[str]]:
    text = f"{title}\n{body}".lower()
    hits = [k for k in ENV_KEYWORDS if k in text] + [k for k in TEST_KEYWORDS if k in text]
    return (bool(hits), hits)


def analyze_repo_issues(full_name: str) -> Dict:
    result = {"total": 0, "env_related": 0, "env_ratio": None, "keyword_hits": {}}
    counter = Counter()
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
            if "pull_request" in issue:
                continue

            title = issue.get("title", "")
            body = issue.get("body") or ""
            result["total"] += 1
            env_flag, hits = is_env_related_issue(title, body)
            if env_flag:
                result["env_related"] += 1
                counter.update(hits)

            analyzed += 1
            if analyzed >= ISSUES_PER_REPO_LIMIT:
                break

        page += 1
        time.sleep(SLEEP_PER_REQUEST)

    if result["total"] > 0:
        result["env_ratio"] = round(result["env_related"] / result["total"], 3)
    result["keyword_hits"] = dict(counter)
    return result


# =========================
# C. 新贡献者 PR 分析
# =========================
def is_env_failed_pr(pr: Dict) -> bool:
    if pr.get("merged", False):
        return False
    title = pr.get("title", "")
    body = pr.get("body") or ""
    text = f"{title}\n{body}".lower()
    if any(k in text for k in PR_ENV_KEYWORDS):
        return True
    # 小改动也认为可能是环境失败
    if pr.get("changed_files", 0) <= 1:
        return True
    return False


def analyze_repo_prs(full_name: str) -> Dict:
    result = {"total": 0, "failed": 0, "env_failed": 0, "env_fail_ratio": None}
    analyzed = 0
    page = 1

    while analyzed < PRS_PER_REPO_LIMIT:
        try:
            prs = get_prs(full_name, page=page)
        except Exception as e:
            print(f"[WARN] PR fetch failed for {full_name}: {e}")
            break
        if not prs:
            break

        for pr in prs:
            result["total"] += 1
            if not pr.get("merged", False):
                result["failed"] += 1
                if is_env_failed_pr(pr):
                    result["env_failed"] += 1

            analyzed += 1
            if analyzed >= PRS_PER_REPO_LIMIT:
                break

        page += 1
        time.sleep(SLEEP_PER_REQUEST)

    if result["failed"] > 0:
        result["env_fail_ratio"] = round(result["env_failed"] / result["failed"], 3)
    return result


# =========================
# D. 汇总分析仓库
# =========================
def analyze_repo(full_name: str) -> Dict:
    return {
        "full_name": full_name,
        "contributing": analyze_contributing_md(full_name),
        "newcomer_issues": analyze_repo_issues(full_name),
        "newcomer_prs": analyze_repo_prs(full_name)
    }


# =========================
# 主程序
# =========================
def main():
    with open(REPO_LIST_FILE, "r", encoding="utf-8") as f:
        repos = json.load(f)

    results = []
    for repo in repos:
        full_name = repo["full_name"]
        print(f"[INFO] Analyzing {full_name} ...")
        repo_stats = analyze_repo(full_name)
        results.append(repo_stats)
        time.sleep(0.8)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Step 4.3 results saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
