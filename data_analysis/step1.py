import json
import time
import requests
from typing import Dict, List
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# =========================
# 基本配置
# =========================
TOKEN_FILE = "github_token.txt"
REPO_LIST_FILE = "sampled_repos_2019_python.json"
OUTPUT_FILE = "repo_dependency_overview.json"

DEPENDENCY_FILES = {
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "environment.yml",
    "Dockerfile",
}

README_CANDIDATES = {
    "README.md",
    "readme.md",
    "README.MD"
}

README_ENV_KEYWORDS = [
    "install",
    "installation",
    "requirements",
    "dependency",
    "dependencies",
    "pip install",
    "conda",
    "environment",
    "docker",
    "virtualenv",
    "venv",
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


TOKEN = load_token(TOKEN_FILE)
SESSION = create_session(TOKEN)


# =========================
# GitHub API 封装
# =========================
def get_repo_tree(full_name: str, branch: str) -> List[Dict]:
    """
    拉取仓库完整文件树
    """
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}"
    resp = SESSION.get(url, params={"recursive": 1}, timeout=10)
    resp.raise_for_status()
    return resp.json()["tree"]


def get_file_content(full_name: str, path: str) -> str:
    """
    拉取单个文件 raw 内容
    """
    owner, repo = full_name.split("/")
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
    resp = SESSION.get(url, timeout=10)
    if resp.status_code != 200:
        return ""
    return resp.text


# =========================
# Step 1 核心分析逻辑
# =========================
def analyze_repo(repo: Dict) -> Dict:
    full_name = repo["full_name"]
    branch = repo["default_branch"]

    result = {
        "full_name": full_name,
        "has_dependency_file": False,
        "dependency_files": [],
        "readme_env_ratio": None,
        "readme_total_lines": 0,
        "readme_env_lines": 0,
    }

    try:
        tree = get_repo_tree(full_name, branch)
    except Exception as e:
        print(f"[WARN] Failed to fetch tree for {full_name}: {e}")
        return result

    file_paths = {item["path"] for item in tree if item["type"] == "blob"}

    # ---------- 是否有依赖文件 ----------
    for dep in DEPENDENCY_FILES:
        if dep in file_paths:
            result["has_dependency_file"] = True
            result["dependency_files"].append(dep)

    # ---------- README 环境配置占比 ----------
    readme_path = next((f for f in README_CANDIDATES if f in file_paths), None)
    if readme_path:
        content = get_file_content(full_name, readme_path)
        lines = content.splitlines()

        total = len(lines)
        env_lines = 0

        for line in lines:
            lower = line.lower()
            if any(k in lower for k in README_ENV_KEYWORDS):
                env_lines += 1

        if total > 0:
            result["readme_total_lines"] = total
            result["readme_env_lines"] = env_lines
            result["readme_env_ratio"] = env_lines / total

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
        print(f"[INFO] Analyzing {repo['full_name']}")
        info = analyze_repo(repo)
        results.append(info)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Results saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
