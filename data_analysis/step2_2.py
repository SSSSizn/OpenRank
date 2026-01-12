import ast
import json
import time
import requests
import io
import zipfile
from typing import Set, Dict, List, Optional

# =========================
# 兼容性导入
# =========================
try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Python < 3.11

# =========================
# 基本配置
# =========================
TOKEN_FILE = "github_token.txt"
REPO_LIST_FILE = "sampled_repos_buckets.json"
OUTPUT_FILE = "sampled_repo_import_vs_requirements.json"


# =========================
# GitHub Session
# =========================
def load_token(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f" 找不到 Token 文件: {path}")
        exit(1)


TOKEN = load_token(TOKEN_FILE)

# 只需要 headers，不再需要复杂的 Retry 逻辑，因为 Zip 下载通常一次成功或失败
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json"
}


def get_repo_zip(full_name: str, branch: str) -> Optional[zipfile.ZipFile]:
    """下载整个仓库的 Zip 包并在内存中打开"""
    owner, repo = full_name.split("/")
    # 使用 zipball API
    url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{branch}"

    try:
        print(f"    Downloading zip for {full_name}...")
        resp = requests.get(url, headers=HEADERS, stream=True, timeout=60)

        if resp.status_code != 200:
            print(f"    Failed to download zip: {resp.status_code}")
            return None

        # 将下载的二进制数据加载到内存中
        file_bytes = io.BytesIO(resp.content)
        return zipfile.ZipFile(file_bytes)
    except Exception as e:
        print(f"    Network/Zip error: {e}")
        return None


# =========================
# AST import 解析
# =========================
def extract_imports_from_code(code: str) -> Set[str]:
    imports = set()
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return imports  # 忽略语法错误的文件

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module.split(".")[0])
    return imports


# =========================
# requirements 解析
# =========================
def parse_requirements_txt(content: str) -> Set[str]:
    pkgs = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # 处理类似 'requests>=2.0' 或 'requests==1.0'
        # 简单分割，取第一个部分
        pkg = line.split()[0].split("==")[0].split(">=")[0].split("<=")[0].split("~=")[0]
        # 去除可能残留的 git+https://... 等复杂情况，这里只做简单处理
        pkg = pkg.split("[")[0]  # 去除 requests[security] 这种 extras
        pkgs.add(pkg.lower())
    return pkgs


def parse_pyproject_toml(content: str) -> Set[str]:
    pkgs = set()
    try:
        data = tomllib.loads(content)
        # 支持 poetry 和 standard project.toml
        deps = []

        # 1. 尝试读取 standard [project.dependencies]
        if "project" in data and "dependencies" in data["project"]:
            deps.extend(data["project"]["dependencies"])

        # 2. 尝试读取 [tool.poetry.dependencies]
        tool_poetry = data.get("tool", {}).get("poetry", {}).get("dependencies", {})
        if tool_poetry:
            deps.extend(tool_poetry.keys())

        for dep in deps:
            # poetry 的依赖可能是字典 key，standard 可能是字符串列表
            if isinstance(dep, str):
                pkg = dep.split()[0].split("==")[0].split(">=")[0].split("<=")[0]
                pkgs.add(pkg.lower())
            else:
                pkgs.add(str(dep).lower())

    except Exception:
        pass
    return pkgs


# =========================
# 核心分析逻辑 (基于 Zip)
# =========================
def analyze_repo_zip(repo: Dict) -> Dict:
    full_name = repo["full_name"]
    branch = repo["default_branch"]

    result = {
        "full_name": full_name,
        "imports": [],
        "requirements": [],
        "import_not_in_requirements": [],
        "requirements_not_used": [],
        "missing_ratio": 0.0,
        "redundant_ratio": 0.0,
        "status": "success"
    }

    # 1. 下载并打开 Zip
    zf = get_repo_zip(full_name, branch)
    if not zf:
        result["status"] = "download_failed"
        return result

    all_imports = set()
    all_requirements = set()

    # 2. 遍历 Zip 中的文件
    # zipball 的目录结构通常是: owner-repo-sha/...
    for file_info in zf.namelist():
        filename = file_info.split("/")[-1]  # 获取文件名

        # 忽略隐藏文件或测试目录 (可选优化)
        if "/." in file_info or "/test" in file_info:
            continue

        try:
            # A. 解析 .py 文件
            if filename.endswith(".py"):
                content = zf.read(file_info).decode("utf-8", errors="ignore")
                all_imports |= extract_imports_from_code(content)

            # B. 解析 requirements.txt
            elif filename == "requirements.txt":
                content = zf.read(file_info).decode("utf-8", errors="ignore")
                all_requirements |= parse_requirements_txt(content)

            # C. 解析 pyproject.toml
            elif filename == "pyproject.toml":
                content = zf.read(file_info).decode("utf-8", errors="ignore")
                all_requirements |= parse_pyproject_toml(content)

        except Exception as e:
            # 个别文件解析失败不影响整体
            continue

    # 3. 统计与计算
    # 过滤掉 Python 标准库 (简单过滤，实际建议使用 stdlib_list 库)
    # 这里不做过滤，因为不知道用户环境 python 版本，保留原始 import 名字

    imports_l = {i.lower() for i in all_imports}
    requirements_l = {r.lower() for r in all_requirements}

    # 简单清理：去除相对引用 (例如 '..utils')
    imports_l = {i for i in imports_l if not i.startswith(".")}

    missing = imports_l - requirements_l
    redundant = requirements_l - imports_l

    result["imports"] = sorted(list(imports_l))
    result["requirements"] = sorted(list(requirements_l))
    result["import_not_in_requirements"] = sorted(list(missing))
    result["requirements_not_used"] = sorted(list(redundant))

    if imports_l:
        result["missing_ratio"] = round(len(missing) / len(imports_l), 4)
    if requirements_l:
        result["redundant_ratio"] = round(len(redundant) / len(requirements_l), 4)

    return result


# =========================
# 主程序
# =========================
def main():
    try:
        with open(REPO_LIST_FILE, "r", encoding="utf-8") as f:
            repos = json.load(f)
    except FileNotFoundError:
        print("请先运行第一步生成 json 文件")
        return

    results = []
    total = len(repos)

    print(f" Starting analysis for {total} repositories...")

    for i, repo in enumerate(repos):
        print(f"\n[{i + 1}/{total}] Analyzing {repo['full_name']}...")
        start_t = time.time()

        res = analyze_repo_zip(repo)
        results.append(res)

        cost = time.time() - start_t
        print(f"   Done in {cost:.2f}s. (Imports: {len(res['imports'])}, Reqs: {len(res['requirements'])})")

        # 适当休息，避免 Zip 接口下载过于频繁被暂时限制
        time.sleep(1)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Saved results to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()