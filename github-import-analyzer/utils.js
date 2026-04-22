// ===== Python import 提取 =====
// 增强版：支持 try/except 包装的 import、条件 import、多行 import
export function extractImports(code) {
  const imports = new Set();
  const patterns = [
    /^\s*import\s+([a-zA-Z0-9_\.]+)/gm,
    /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import/gm,
    /^\s*import\s+([a-zA-Z0-9_\.]+)\s+as\s+/gm,
  ];

  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(code)) !== null) {
      const rootPkg = m[1].split(".")[0];
      if (rootPkg && !rootPkg.startsWith("_")) imports.add(rootPkg);
    }
  });

  // 动态 import：__import__("pkg") / importlib.import_module("pkg")
  const dynPatterns = [
    /__import__\(\s*['"]([a-zA-Z0-9_\.]+)['"]/g,
    /importlib\.import_module\(\s*['"]([a-zA-Z0-9_\.]+)['"]/g,
  ];
  dynPatterns.forEach((re) => {
    let m;
    while ((m = re.exec(code)) !== null) {
      imports.add(m[1].split(".")[0]);
    }
  });

  return [...imports];
}

// ===== 并发限制器 =====
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

// ===== import 名 → PyPI 包名 规范化映射 =====
// 这张表是 Python 生态中长期以来 import 名与发行名不一致的常见坑
const IMPORT_TO_PYPI = {
  sklearn: "scikit-learn",
  cv2: "opencv-python",
  PIL: "Pillow",
  yaml: "PyYAML",
  bs4: "beautifulsoup4",
  skimage: "scikit-image",
  Crypto: "pycryptodome",
  dateutil: "python-dateutil",
  dotenv: "python-dotenv",
  jwt: "PyJWT",
  OpenSSL: "pyOpenSSL",
  serial: "pyserial",
  magic: "python-magic",
  tkinter: null, // 标准库，过滤
  usb: "pyusb",
  win32api: "pywin32",
  win32con: "pywin32",
  win32com: "pywin32",
  google: "google-cloud-core",
  mpl_toolkits: "matplotlib",
  IPython: "ipython",
  attr: "attrs",
  MySQLdb: "mysqlclient",
  psycopg2: "psycopg2-binary",
  grpc: "grpcio",
  google_auth_oauthlib: "google-auth-oauthlib",
  pkg_resources: "setuptools",
  pydantic_settings: "pydantic-settings",
  transformers_modules: "transformers",
};

export function normalize(pkg) {
  if (pkg in IMPORT_TO_PYPI) return IMPORT_TO_PYPI[pkg];
  // PEP 503 规范化：下划线 → 连字符（但保留首字母大小写）
  return pkg;
}

// ===== 系统级依赖映射（Dockerfile 场景常见坑）=====
// 某些 PyPI 包需要额外的 OS 包才能编译/运行
export const SYSTEM_DEPS_MAP = {
  "psycopg2": ["libpq-dev", "gcc"],
  "psycopg2-binary": [],
  "mysqlclient": ["default-libmysqlclient-dev", "pkg-config", "gcc"],
  "Pillow": ["libjpeg-dev", "zlib1g-dev"],
  "lxml": ["libxml2-dev", "libxslt-dev"],
  "cryptography": ["libssl-dev", "libffi-dev"],
  "pycairo": ["libcairo2-dev"],
  "pygame": ["libsdl2-dev"],
  "numpy": [], // 有 wheel
  "scipy": ["gfortran", "libopenblas-dev"],
  "opencv-python": ["libgl1", "libglib2.0-0"],
  "opencv-python-headless": ["libgl1", "libglib2.0-0"],
  "torch": [], // 有 wheel
  "tensorflow": [],
  "pyodbc": ["unixodbc-dev"],
  "pycurl": ["libcurl4-openssl-dev", "libssl-dev"],
  "uwsgi": ["build-essential"],
  "weasyprint": ["libpango-1.0-0", "libpangoft2-1.0-0"],
};

export function resolveSystemDeps(packages) {
  const systemDeps = new Set();
  for (const pkg of packages) {
    const deps = SYSTEM_DEPS_MAP[pkg.toLowerCase()] || SYSTEM_DEPS_MAP[pkg];
    if (deps) deps.forEach((d) => systemDeps.add(d));
  }
  return [...systemDeps];
}

// ===== 项目类型特征库 =====
// 用一组"特征包"识别项目类型，供 Skill 决策
export const PROJECT_TYPE_SIGNATURES = {
  "ml-training": {
    strong: ["torch", "tensorflow", "jax", "pytorch-lightning", "transformers"],
    weak: ["numpy", "pandas", "scikit-learn", "wandb", "mlflow", "datasets", "accelerate"],
    entrypoints: ["train.py", "finetune.py", "pretrain.py"],
  },
  "ml-inference": {
    strong: ["onnxruntime", "tensorrt", "tritonclient", "vllm"],
    weak: ["torch", "tensorflow", "transformers"],
    entrypoints: ["infer.py", "serve.py", "predict.py"],
  },
  "web-fastapi": {
    strong: ["fastapi", "uvicorn"],
    weak: ["pydantic", "starlette", "sqlalchemy"],
    entrypoints: ["main.py", "app.py", "server.py"],
  },
  "web-flask": {
    strong: ["flask"],
    weak: ["gunicorn", "werkzeug", "jinja2"],
    entrypoints: ["app.py", "wsgi.py", "run.py"],
  },
  "web-django": {
    strong: ["django"],
    weak: ["djangorestframework", "gunicorn"],
    entrypoints: ["manage.py", "wsgi.py", "asgi.py"],
  },
  "data-analysis": {
    strong: ["jupyter", "ipython", "notebook"],
    weak: ["pandas", "numpy", "matplotlib", "seaborn", "plotly"],
    entrypoints: [],
  },
  "cli-tool": {
    strong: ["click", "typer", "fire"],
    weak: ["rich", "tqdm"],
    entrypoints: ["cli.py", "main.py", "__main__.py"],
  },
  "crawler": {
    strong: ["scrapy", "selenium", "playwright"],
    weak: ["beautifulsoup4", "requests", "lxml"],
    entrypoints: ["spider.py", "crawl.py"],
  },
  "generic": {
    strong: [],
    weak: [],
    entrypoints: ["main.py", "__main__.py"],
  },
};

// 计算项目类型得分
export function scoreProjectTypes(imports, entrypoints = []) {
  const impSet = new Set(imports.map((s) => s.toLowerCase()));
  const epSet = new Set(entrypoints);

  const scores = {};
  for (const [type, sig] of Object.entries(PROJECT_TYPE_SIGNATURES)) {
    let score = 0;
    sig.strong.forEach((p) => impSet.has(p.toLowerCase()) && (score += 3));
    sig.weak.forEach((p) => impSet.has(p.toLowerCase()) && (score += 1));
    sig.entrypoints.forEach((e) => epSet.has(e) && (score += 2));
    scores[type] = score;
  }
  return scores;
}

// ===== 证据等级定义 =====
// 用于六级版本解析器的来源排序
export const EVIDENCE_LEVELS = {
  EXACT_MANIFEST: { level: 1, label: "manifest", baseConfidence: 1.0 },
  RAG: { level: 2, label: "rag", baseConfidence: 0.9 },
  LOCAL_KB: { level: 3, label: "local-kb", baseConfidence: 0.75 },
  PYPI_META: { level: 4, label: "pypi-meta", baseConfidence: 0.7 },
  LIVE_LATEST: { level: 5, label: "live-latest", baseConfidence: 0.55 },
  LLM_GUESS: { level: 6, label: "llm-unverified", baseConfidence: 0.3 },
  UNKNOWN: { level: 99, label: "unknown", baseConfidence: 0.1 },
};

// ===== 工具：安全地比较语义化版本 =====
export function compareSemver(a, b) {
  const pa = a.split(".").map((x) => parseInt(x) || 0);
  const pb = b.split(".").map((x) => parseInt(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// ===== 统一 fetch 包装（带超时）=====
export async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    return res;
  } finally {
    clearTimeout(tid);
  }
}
