export function extractImports(code) {
  const imports = new Set();

  const patterns = [
    /^import\s+([a-zA-Z0-9_\.]+)/gm,
    /^from\s+([a-zA-Z0-9_\.]+)\s+import/gm
  ];

  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(code)) !== null) {
      imports.add(m[1].split(".")[0]);
    }
  });

  return [...imports];
}

export function normalize(pkg) {
  const mapping = {
    sklearn: "scikit-learn",
    cv2: "opencv-python",
    PIL: "Pillow",
    yaml: "PyYAML"
  };
  return mapping[pkg] || pkg;
}
