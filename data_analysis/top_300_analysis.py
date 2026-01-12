import os
import re
import sys
import json
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

# ================= 配置区域 =================
DATA_DIR = "top_300_metrics"
OUTPUT_DIR = "analysis_results"

# 1. 确保输出目录存在
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 2. LLM 配置
LLM_CONFIG = {
    "base_url": "https://xiaoai.plus/v1",
    "api_key": "s123S",
    "model": "deepseek-v3"
}

# 3. GitHub Token (解决 401 的关键)
# 必须是 "ghp_" 开头的一串字符
def load_github_token(path: str = "github_token.txt") -> str:
    with open(path, "r", encoding="utf-8") as f:
        token = f.read().strip()
    if not token:
        raise ValueError("GitHub token file is empty")
    return token


GITHUB_TOKEN = load_github_token()

# 筛选配置
MIN_UPDATE_YEAR = 2023
MAX_REPO_WORKERS = 5
MAX_FILE_FETCH = 20
# ===========================================

STD_LIB = set(sys.stdlib_module_names) if hasattr(sys, 'stdlib_module_names') else set()


def get_headers():
    h = {"User-Agent": "PyAnalyzer/1.0"}

    if GITHUB_TOKEN and "YOUR_TOKEN" not in GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def get_repo_info(owner, repo):
    url = f"https://api.github.com/repos/{owner}/{repo}"
    try:
        res = requests.get(url, headers=get_headers(), timeout=10)
        if res.status_code == 200:
            data = res.json()
            pushed_at = data.get("pushed_at")
            if not pushed_at: return None, "No dates"
            if int(pushed_at.split("-")[0]) < MIN_UPDATE_YEAR:
                return None, "Old Repo"
            return {"default_branch": data.get("default_branch", "main")}, "OK"
        elif res.status_code == 404:
            return None, "Not Found"
        elif res.status_code == 401:
            return None, "❌ 401 Unauthorized (Token无效)"
        else:
            return None, f"Status {res.status_code}"
    except Exception as e:
        return None, str(e)


def fetch_file_tree(owner, repo, branch):
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    try:
        res = requests.get(url, headers=get_headers(), timeout=15)
        if res.status_code == 200:
            return res.json().get("tree", [])
    except:
        pass
    return []


def fetch_raw_content(owner, repo, branch, path):
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    try:
        res = requests.get(url, headers=get_headers(), timeout=10)
        if res.status_code == 200:
            return res.text
    except:
        pass
    return ""


def extract_imports(code):
    imports = set()
    patterns = [
        re.compile(r'^import\s+([a-zA-Z0-9_\.]+)'),
        re.compile(r'^from\s+([a-zA-Z0-9_\.]+)\s+import')
    ]
    for line in code.split('\n'):
        line = line.strip()
        for pat in patterns:
            m = pat.search(line)
            if m:
                imports.add(m.group(1).split('.')[0])
    return imports


def call_llm(author_name, project_name, candidates):
    prompt = f"""
    Role: Python DevOps Expert.
    Repo: {author_name}/{project_name}
    Detected Imports: {json.dumps(candidates)}
    Task: Generate requirements.txt and Dockerfile (python:3.9-slim).
    Return STRICT JSON with keys: requirements, dockerfile, explanation.
    """

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_CONFIG['api_key']}"
    }
    payload = {
        "model": LLM_CONFIG['model'],
        "messages": [
            {"role": "system", "content": "You are a JSON generator. Always return valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }

    res = requests.post(f"{LLM_CONFIG['base_url']}/chat/completions", headers=headers, json=payload, timeout=60)
    if res.status_code != 200:
        raise Exception(f"LLM 401/Error: {res.text}")

    content = res.json()['choices'][0]['message']['content']
    content = content.replace("```json", "").replace("```", "").strip()
    return json.loads(content)


def process_repo(author, project):
    # 0. 准备保存路径
    result_path = os.path.join(OUTPUT_DIR, author, project)

    # 如果已经跑过了，直接跳过
    if os.path.exists(os.path.join(result_path, "requirements.txt")):
        return f"⏭️ Skipped {project} (Already done)"

    # 1. 检查 GitHub
    info, status = get_repo_info(author, project)
    if not info:
        return f"⏩ Skipped {project}: {status}"

    # 2. 获取文件
    branch = info['default_branch']
    tree = fetch_file_tree(author, project, branch)
    py_files = [f['path'] for f in tree if f['path'].endswith('.py')]

    if not py_files:
        return f"⏩ Skipped {project}: No Python files"

    # 3. 下载代码
    target_files = py_files[:MAX_FILE_FETCH]
    all_imports = set()
    local_modules = set([os.path.splitext(os.path.basename(p))[0] for p in py_files])

    downloaded = 0
    for file_path in target_files:
        code = fetch_raw_content(author, project, branch, file_path)
        if code:
            downloaded += 1
            all_imports.update(extract_imports(code))

    if downloaded == 0:
        return f"❌ Error {project}: Download failed"

    # 4. 过滤
    candidates = [i for i in all_imports if i not in STD_LIB and i not in local_modules]
    if not candidates:
        return f"⏩ Skipped {project}: No dependencies"

    # 5. LLM 分析与保存
    try:
        data = call_llm(author, project, candidates)

        # 强制创建对应的文件夹 (例如 analysis_results/psf/requests)
        os.makedirs(result_path, exist_ok=True)

        # 1. 保存 requirements.txt
        req_path = os.path.join(result_path, "requirements.txt")
        with open(req_path, "w", encoding='utf-8') as f:
            f.write(data.get("requirements", ""))

        # 2. 保存 Dockerfile
        dock_path = os.path.join(result_path, "Dockerfile")
        with open(dock_path, "w", encoding='utf-8') as f:
            f.write(data.get("dockerfile", ""))

        # 3. 保存日志
        log_path = os.path.join(result_path, "analysis_log.json")
        with open(log_path, "w", encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        # ========================================================

        return f"✅ Success {project}: Saved results!"

    except Exception as e:
        return f"❌ LLM Error {project}: {e}"


def main():

    tasks = []
    if not os.path.exists(DATA_DIR):
        print(f"Error: {DATA_DIR} not found")
        return

    print("Scanning local folders...")
    # 只读两层目录
    try:
        authors = [d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))]
        for author in authors:
            author_path = os.path.join(DATA_DIR, author)
            projects = [d for d in os.listdir(author_path) if os.path.isdir(os.path.join(author_path, d))]
            for project in projects:
                tasks.append((author, project))
    except Exception as e:
        print(f"Directory Error: {e}")
        return

    print(f"Found {len(tasks)} projects. Starting analysis...")

    # 线程池并发
    with ThreadPoolExecutor(max_workers=MAX_REPO_WORKERS) as executor:
        futures = {executor.submit(process_repo, t[0], t[1]): t for t in tasks}

        for future in tqdm(as_completed(futures), total=len(tasks)):
            msg = future.result()
            # 只有成功或包含 Token 错误的才打印出来
            if "Success" in msg or "401" in msg or "LLM Error" in msg:
                tqdm.write(msg)


if __name__ == "__main__":
    main()