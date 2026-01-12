import json
from pathlib import Path
from collections import defaultdict, Counter
from itertools import combinations

ROOT = Path("data_analysis/analysis_results")

# 单包版本统计
pkg_version_stats = defaultdict(Counter)

# 版本共现统计
# key: "pkgA==verA || pkgB==verB"
cooccurrence_stats = Counter()

def parse_requirements(req_text: str):
    pairs = []
    for line in req_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" in line:
            pkg, ver = line.split("==", 1)
            pairs.append((pkg.strip().lower(), ver.strip()))
    return pairs

for json_file in ROOT.rglob("analysis_log.json"):
    try:
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        continue

    reqs = data.get("requirements")
    if not reqs:
        continue

    deps = parse_requirements(reqs)

    #  单包版本频率
    for pkg, ver in deps:
        pkg_version_stats[pkg][ver] += 1

    #  版本共现（两两）
    # 使用 set 防止同一文件重复统计
    dep_versions = sorted(set(f"{p}=={v}" for p, v in deps))
    for a, b in combinations(dep_versions, 2):
        key = f"{a} || {b}"
        cooccurrence_stats[key] += 1

# 输出
output = {
    "package_versions": {
        pkg: dict(counter.most_common())
        for pkg, counter in pkg_version_stats.items()
    },
    "version_cooccurrence": dict(cooccurrence_stats.most_common())
}

with open("dependency_version_knowledge.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(" 已生成版本频率 + 共现知识库")
