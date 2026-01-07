import ast
import json
import time
import requests
import tomli as tomllib
from typing import Set, Dict, List
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# =========================
# 基本配置
# =========================
TOKEN_FILE = "github_token.txt"
REPO_LIST_FILE = "sampled_repos_buckets.json"
OUTPUT_FILE = "sampled_repo_import_vs_requirements.json"

REQUIREMENT_FILES = [
    "requirements.txt",
    "pyproject.toml",
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
def get_repo_tree(full_name: str, branch: str) -> List[Dict]:
    owner, repo = full_name.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}"
    resp = SESSION.get(url, params={"recursive": 1}, timeout=10)
    resp.raise_for_status()
    return resp.json()["tree"]


def get_file_content(full_name: str, path: str) -> str:
    owner, repo = full_name.split("/")
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
    resp = SESSION.get(url, timeout=10)
    if resp.status_code != 200:
        return ""
    return resp.text


# =========================
# AST import 解析
# =========================
def extract_imports_from_code(code: str) -> Set[str]:
    imports = set()
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return imports

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module.split(".")[0])
    return imports


def extract_repo_imports(full_name: str, tree: List[Dict]) -> Set[str]:
    imports = set()

    for item in tree:
        if item["type"] == "blob" and item["path"].endswith(".py"):
            code = get_file_content(full_name, item["path"])
            imports |= extract_imports_from_code(code)
            time.sleep(0.1)

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
        pkg = line.split()[0].split("==")[0].split(">=")[0]
        pkgs.add(pkg.lower())
    return pkgs


def parse_pyproject_toml(content: str) -> Set[str]:
    pkgs = set()
    try:
        data = tomllib.loads(content)
    except Exception:
        return pkgs

    deps = data.get("project", {}).get("dependencies", [])
    for dep in deps:
        pkg = dep.split()[0].split(">=")[0]
        pkgs.add(pkg.lower())
    return pkgs


def extract_requirements(full_name: str, tree: List[Dict]) -> Set[str]:
    pkgs = set()
    paths = {item["path"] for item in tree if item["type"] == "blob"}

    if "requirements.txt" in paths:
        content = get_file_content(full_name, "requirements.txt")
        pkgs |= parse_requirements_txt(content)

    if "pyproject.toml" in paths:
        content = get_file_content(full_name, "pyproject.toml")
        pkgs |= parse_pyproject_toml(content)

    return pkgs


# =========================
# Step 2 核心分析
# =========================
def analyze_repo(repo: Dict) -> Dict:
    full_name = repo["full_name"]
    branch = repo["default_branch"]

    result = {
        "full_name": full_name,
        "imports": [],
        "requirements": [],
        "import_not_in_requirements": [],
        "requirements_not_used": [],
        "missing_ratio": None,
        "redundant_ratio": None,
    }

    try:
        tree = get_repo_tree(full_name, branch)
    except Exception as e:
        print(f"[WARN] Tree failed: {full_name} {e}")
        return result

    imports = extract_repo_imports(full_name, tree)
    requirements = extract_requirements(full_name, tree)

    imports_l = {i.lower() for i in imports}
    requirements_l = {r.lower() for r in requirements}

    missing = imports_l - requirements_l
    redundant = requirements_l - imports_l

    result["imports"] = sorted(imports_l)
    result["requirements"] = sorted(requirements_l)
    result["import_not_in_requirements"] = sorted(missing)
    result["requirements_not_used"] = sorted(redundant)

    if imports_l:
        result["missing_ratio"] = len(missing) / len(imports_l)
    if requirements_l:
        result["redundant_ratio"] = len(redundant) / len(requirements_l)

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
        print(f"[INFO] Step2 analyzing {repo['full_name']}")
        results.append(analyze_repo(repo))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Step2 saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
