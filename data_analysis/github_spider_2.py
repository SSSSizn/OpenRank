import time
import random
import requests
import csv
import json
import math
from typing import List, Dict, Tuple, Optional
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ==========================================
# ⚙️ 配置区域 (Configuration) - 修改这里即可
# ==========================================
CONFIG = {
    # Token 文件路径
    "TOKEN_PATH": "github_token.txt",

    # 搜索条件
    "LANGUAGE": "Python",
    "START_DATE": "2023-01-01",
    "END_DATE": "2025-12-31",

    # 分桶采样配置 (Star区间: 采样数量)
    # None 表示无穷大 (例如 10000以上)
    "BUCKETS": [
        {"min": 10, "max": 100, "sample_size": 200},  # 低热度
        {"min": 101, "max": 1000, "sample_size": 200},  # 中热度
        {"min": 1001, "max": 10000, "sample_size": 200},  # 高热度
        {"min": 10001, "max": None, "sample_size": 200},  # 顶级项目
    ],

    # 全局随机种子
    "RANDOM_SEED": 2025,

    # 输出文件名
    "OUTPUT_CSV": "sampled_repos_buckets.csv",
    "OUTPUT_JSON": "sampled_repos_buckets.json"
}


# ==========================================
# 🛠️ 核心逻辑
# ==========================================

def create_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    return session


SESSION = create_session()


def load_github_token(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            token = f.read().strip()
        if not token:
            raise ValueError("Token file is empty")
        return token
    except FileNotFoundError:
        print(f"❌ Error: {path} not found. Please create it with your GitHub token.")
        exit(1)


GITHUB_TOKEN = load_github_token(CONFIG["TOKEN_PATH"])
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json"
}
BASE_URL = "https://api.github.com/search/repositories"


def search_repositories_page(
        query: str,
        per_page: int = 100,
        page: int = 1
) -> Dict:
    """请求单页数据"""
    params = {
        "q": query,
        "sort": "stars",  # 按 star 排序，但在桶内我们会随机翻页
        "order": "desc",  # 降序
        "per_page": per_page,
        "page": page
    }

    try:
        resp = SESSION.get(BASE_URL, headers=HEADERS, params=params, timeout=15)

        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            print("[WARN] Rate limit hit. Sleeping for 60s...")
            time.sleep(60)
            return search_repositories_page(query, per_page, page)  # Retry

        if resp.status_code != 200:
            print(f"[ERROR] API {resp.status_code}: {resp.text}")
            return {}

        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"[WARN] Network error: {e}")
        return {}


def sample_from_bucket(
        bucket_cfg: Dict,
        language: str,
        start_date: str,
        end_date: str
) -> List[Dict]:
    """针对单个分桶进行采样"""
    min_s = bucket_cfg["min"]
    max_s = bucket_cfg["max"]
    target_size = bucket_cfg["sample_size"]

    # 构建 Star 查询字符串
    if max_s is None:
        star_query = f"stars:>={min_s}"
        bucket_label = f"{min_s}+"
    else:
        star_query = f"stars:{min_s}..{max_s}"
        bucket_label = f"{min_s}-{max_s}"

    query = (
        f"language:{language} "
        f"created:{start_date}..{end_date} "
        f"{star_query} "
        f"fork:false"  # 通常采样不包含 fork 项目，如需要可改为 true
    )

    print(f"\n🔍 Processing Bucket [{bucket_label}] | Target: {target_size} repos")

    # 1. 先查第一页，获取总数
    first_page = search_repositories_page(query, per_page=100, page=1)
    total_count = first_page.get("total_count", 0)

    if total_count == 0:
        print(f"   ⚠️ No repositories found in this bucket.")
        return []

    # GitHub API 限制只能访问前 1000 个结果
    max_accessible = min(total_count, 1000)
    max_pages = math.ceil(max_accessible / 100)

    print(f"   Total found: {total_count} (Accessible: {max_accessible}, Pages: {max_pages})")

    # 2. 决定需要抓取哪些页面
    # 为了保证随机性，我们随机抽取页面，而不是只拿前几页
    candidate_repos = []

    # 如果总数很少，不需要随机抓页，直接抓全部
    if max_accessible <= target_size * 2:
        pages_to_fetch = list(range(1, max_pages + 1))
    else:
        # 否则，随机抽取 3-5 页（或更多）来建立候选池，减少 API 调用
        # 只要候选池比 target_size 大即可
        needed_pages = math.ceil((target_size * 3) / 100)  # 预留3倍冗余
        needed_pages = max(needed_pages, 1)
        needed_pages = min(needed_pages, max_pages)
        pages_to_fetch = random.sample(range(1, max_pages + 1), needed_pages)

    print(f"   Fetching pages: {pages_to_fetch}")

    seen_ids = set()

    for p in sorted(pages_to_fetch):
        data = search_repositories_page(query, per_page=100, page=p)
        items = data.get("items", [])

        for item in items:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                candidate_repos.append({
                    "id": item["id"],
                    "full_name": item["full_name"],
                    "html_url": item["html_url"],
                    "stars": item["stargazers_count"],
                    "forks": item["forks_count"],
                    "created_at": item["created_at"],
                    "language": item.get("language", "Unknown"),
                    "default_branch": item.get("default_branch", "master"),
                    "bucket_label": bucket_label  # 标记来源桶
                })
        time.sleep(1.0)  # 避免触发 abuse detection

    # 3. 从候选池中随机抽取最终样本
    if len(candidate_repos) < target_size:
        print(f"   ⚠️ Warning: Only found {len(candidate_repos)} candidates, less than target {target_size}.")
        return candidate_repos  # 全部返回

    final_sample = random.sample(candidate_repos, target_size)
    print(f"   ✅ Successfully sampled {len(final_sample)} repos from bucket.")
    return final_sample


# ==========================================
# 保存与主程序
# ==========================================

def save_data(repos: List[Dict]):
    if not repos:
        print("No data to save.")
        return

    # CSV
    keys = ["full_name", "stars", "forks", "language", "created_at", "default_branch", "bucket_label", "html_url"]
    # 过滤一下字段，只保留我们需要的
    filtered_repos = [{k: r.get(k) for k in keys} for r in repos]

    with open(CONFIG["OUTPUT_CSV"], "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(filtered_repos)
    print(f"📄 Saved CSV to {CONFIG['OUTPUT_CSV']}")

    # JSON
    with open(CONFIG["OUTPUT_JSON"], "w", encoding="utf-8") as f:
        json.dump(repos, f, indent=2, ensure_ascii=False)
    print(f"📄 Saved JSON to {CONFIG['OUTPUT_JSON']}")


def main():
    print("=== GitHub Stratified Repository Sampler ===")
    random.seed(CONFIG["RANDOM_SEED"])

    all_sampled_repos = []

    for bucket in CONFIG["BUCKETS"]:
        repos = sample_from_bucket(
            bucket,
            CONFIG["LANGUAGE"],
            CONFIG["START_DATE"],
            CONFIG["END_DATE"]
        )
        all_sampled_repos.extend(repos)
        time.sleep(1)  # 桶之间稍微休息一下

    print(f"\n🎉 Total sampled: {len(all_sampled_repos)}")

    # 按 Star 数简单排个序，方便查看
    all_sampled_repos.sort(key=lambda x: x["stars"], reverse=True)

    save_data(all_sampled_repos)

    # 打印简报
    print("\n--- Top 10 Sampled Repos ---")
    for i, r in enumerate(all_sampled_repos[:10]):
        print(f"{i + 1}. [{r['bucket_label']}] {r['full_name']} (★ {r['stars']})")


if __name__ == "__main__":
    main()