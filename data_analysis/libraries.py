import requests

API_KEY = "437eac74c0839297e980e94e21809dfb"
BASE_URL = "https://libraries.io/api/pypi"

package = "matplotlib"
version = "3.10.8"

# =========================
# 1. 获取依赖
# =========================
deps_resp = requests.get(
    f"{BASE_URL}/{package}/{version}/dependencies",
    params={"api_key": API_KEY}
)
dependencies = deps_resp.json()

print("=== Dependencies ===")
for dep in dependencies.get("dependencies", []):
    print({
        "name": dep.get("name"),
        "requirements": dep.get("requirements"),
        "kind": dep.get("kind")  # runtime / development
    })

# =========================
# 2. 获取被依赖项目
# =========================
dependents_resp = requests.get(
    f"{BASE_URL}/{package}/dependents",
    params={"api_key": API_KEY, "per_page": 100}
)
dependents = dependents_resp.json()

print("\n=== Dependents ===")
for name in dependents:
    print({"name": name})
