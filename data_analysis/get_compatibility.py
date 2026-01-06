import requests
import json
import os

# =========================
# 配置部分
# =========================
DATA_DIR = "data"  # 存放 top-pypi-packages.min.json 的文件夹
TOP_N = 10         # 可调整 Top N 包，例如 10、50、100

# 输入文件路径
data_file = os.path.join(DATA_DIR, "top-pypi-packages.min.json")

# 输出文件路径
detailed_file = os.path.join(f"top{TOP_N}_package_compatibility_detailed.json")
summary_file = os.path.join(f"top{TOP_N}_package_compatibility_summary.json")

# =========================
# 1. 从文件读取 Top N 包
# =========================
with open(data_file, "r", encoding="utf-8") as f:
    data = json.load(f)

top_packages = [row["project"] for row in data["rows"][:TOP_N]]
print(f"Top {TOP_N} packages:", top_packages)

# =========================
# 2. 定义函数获取兼容性和依赖
# =========================
def get_package_compatibility(package_name):
    """获取包的 Python 版本支持和依赖"""
    url = f"https://pypi.org/pypi/{package_name}/json"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        compatibility = {
            "package": package_name,
            "latest_version": data["info"]["version"],
            "requires_python": data["info"].get("requires_python"),
            "dependencies": data["info"].get("requires_dist", []),
            "all_versions": list(data["releases"].keys())
        }
        
        return compatibility
    except Exception as e:
        print(f"Error fetching {package_name}: {e}")
        return None

# =========================
# 3. 循环获取 Top N 包的信息
# =========================
detailed_db = {}
summary_db = {}

for pkg in top_packages:
    print(f"Fetching {pkg}...")
    compat = get_package_compatibility(pkg)
    if compat:
        # 保存详细信息
        detailed_db[pkg] = compat
        
        # 保存简略信息（去掉 all_versions）
        summary_db[pkg] = {k: v for k, v in compat.items() if k != "all_versions"}

# =========================
# 4. 保存到文件
# =========================
with open(detailed_file, "w", encoding="utf-8") as f:
    json.dump(detailed_db, f, indent=2, ensure_ascii=False)

with open(summary_file, "w", encoding="utf-8") as f:
    json.dump(summary_db, f, indent=2, ensure_ascii=False)

print(f"Detailed compatibility saved to {detailed_file}")
print(f"Summary compatibility saved to {summary_file}")
