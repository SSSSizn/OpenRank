export function extractImports(code) {
  const imports = new Set();
  // 匹配 import x, from x import y
  const patterns = [
    /^import\s+([a-zA-Z0-9_\.]+)/gm,
    /^from\s+([a-zA-Z0-9_\.]+)\s+import/gm
  ];

  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(code)) !== null) {
      // 获取顶级包名，例如 from os.path -> os
      const rootPkg = m[1].split(".")[0];
      imports.add(rootPkg);
    }
  });

  return [...imports];
}

// 并发限制器 (Step 6)
export async function pMap(array, mapper, concurrency = 5) {
  const results = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

export function normalize(pkg) {
  // 简单映射，复杂的交给 LLM
  const mapping = {
    sklearn: "scikit-learn",
    cv2: "opencv-python",
    PIL: "Pillow",
    yaml: "PyYAML",
    bs4: "beautifulsoup4"
  };
  return mapping[pkg] || pkg;
}