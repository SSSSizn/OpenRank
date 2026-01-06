import time
import random
import requests
import csv
import json
from typing import List, Dict
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def create_session() -> requests.Session:
    session = requests.Session()

    retries = Retry(
        total=5,                  # 最多重试 5 次
        backoff_factor=1.0,        # 1s, 2s, 4s, 8s...
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )

    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    return session


SESSION = create_session()

# =========================
# 读取 GitHub Token（本地文件）
# =========================
def load_github_token(path: str = "github_token.txt") -> str:
    with open(path, "r", encoding="utf-8") as f:
        token = f.read().strip()
    if not token:
        raise ValueError("GitHub token file is empty")
    return token


GITHUB_TOKEN = load_github_token()

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json"
}

BASE_URL = "https://api.github.com/search/repositories"


# =========================
# GitHub Search API
# =========================
def search_repositories(
    language: str,
    start_date: str,
    end_date: str,
    min_stars: int = 5,
    fork: bool = False,
    per_page: int = 100,
    page: int = 1,
) -> Dict:
    query = (
        f"language:{language} "
        f"created:{start_date}..{end_date} "
        f"stars:>={min_stars} "
        f"fork:{str(fork).lower()}"
    )

    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": per_page,
        "page": page
    }

    try:
        resp = SESSION.get(
            BASE_URL,
            headers=HEADERS,
            params=params,
            timeout=10  # ★ 非常重要
        )
    except requests.exceptions.RequestException as e:
        print(f"[WARN] Network error: {e}, retrying...")
        time.sleep(2)
        raise

    if resp.status_code != 200:
        raise RuntimeError(
            f"GitHub API error {resp.status_code}: {resp.text}"
        )

    return resp.json()


# =========================
# 随机采样主逻辑
# =========================
def random_sample_repositories(
    language: str,
    start_date: str,
    end_date: str,
    sample_size: int = 50,
    min_stars: int = 5,
    random_seed: int = 42,
):
    random.seed(random_seed)

    first_page = search_repositories(
        language, start_date, end_date, min_stars=min_stars, page=1
    )

    total_count = first_page["total_count"]
    if total_count == 0:
        return []

    # GitHub Search API 硬限制
    max_accessible = min(total_count, 100)
    max_page = max_accessible // 100  # 最大 10

    print(f"[INFO] Total candidate repositories: {max_accessible}")

    sampled = []
    seen_ids = set()

    while len(sampled) < sample_size:
        page = random.randint(1, max_page)

        result = search_repositories(
            language,
            start_date,
            end_date,
            min_stars=min_stars,
            page=page
        )

        items = result.get("items", [])
        if not items:
            continue

        repo = random.choice(items)
        repo_id = repo["id"]

        if repo_id in seen_ids:
            continue

        seen_ids.add(repo_id)
        sampled.append({
            "full_name": repo["full_name"],
            "html_url": repo["html_url"],
            "stars": repo["stargazers_count"],
            "forks": repo["forks_count"],
            "created_at": repo["created_at"],
            "language": repo["language"],
            "default_branch": repo["default_branch"]
        })

        time.sleep(0.8)

    return sampled



# =========================
# 保存为 CSV
# =========================
def save_to_csv(repos: List[Dict], path: str):
    if not repos:
        return

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=repos[0].keys())
        writer.writeheader()
        writer.writerows(repos)


# =========================
# 保存为 JSON
# =========================
def save_to_json(repos: List[Dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(repos, f, indent=2, ensure_ascii=False)


# =========================
# 示例运行
# =========================
if __name__ == "__main__":
    repos = random_sample_repositories(
        language="Python",
        start_date="2019-01-01",
        end_date="2019-12-31",
        sample_size=20,
        min_stars=10,
        random_seed=2025
    )

    save_to_csv(repos, "sampled_repos_2019_python.csv")
    save_to_json(repos, "sampled_repos_2019_python.json")

    print("\n=== Sampled Repositories ===")
    for r in repos:
        print(
            f"{r['full_name']:40} "
            f"stars={r['stars']:5} "
            f"forks={r['forks']:4} "
            f"created={r['created_at']}"
        )
