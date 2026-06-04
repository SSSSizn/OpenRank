// ========================================================================
// Skills Registry
// ------------------------------------------------------------------------
// 每个 Skill 都是一个独立能力，可被 Agent 按需调度。
// 设计原则：
//   1) 每个 Skill 是纯函数（async），输入/输出均为 JSON 可序列化
//   2) 每个 Skill 附带 JSON Schema，供 LLM function-calling 识别
//   3) Skill 之间通过显式 ctx 传递状态，避免隐式耦合
// ========================================================================

import { extractImports, normalize, pMap, scoreProjectTypes, fetchWithTimeout } from "./utils.js";
import { pythonStdLib } from "./stdlib.js";

// ---------- 通用 GitHub fetch（带 token + 重试）----------
async function githubFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["githubToken"], async ({ githubToken }) => {
      const headers = { Accept: "application/vnd.github+json" };
      if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
      try {
        const res = await fetchWithTimeout(url, { headers }, 12000);
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function fetchRawFile(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  try {
    const res = await githubFetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ========================================================================
// Skill 1: fetch_repo_tree —— 拉取仓库文件树
// ========================================================================
export async function fetchRepoTree({ owner, repo, branch }) {
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
  const repoRes = await githubFetch(repoApi);
  if (!repoRes.ok) {
    const text = await repoRes.text();
    if (repoRes.status === 403 && text.includes("rate limit")) {
      throw new Error("GitHub API rate limit exceeded. Please set a token in Settings.");
    }
    throw new Error(`Repo fetch failed: ${repoRes.status} ${repoRes.statusText}`);
  }
  const repoData = await repoRes.json();
  const actualBranch = branch && branch !== "main" ? branch : repoData.default_branch;
  if (!actualBranch) throw new Error(`Cannot determine default branch for ${owner}/${repo}`);

  const treeApi = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
  const treeRes = await githubFetch(treeApi);
  if (!treeRes.ok) {
    throw new Error(`Tree fetch failed: ${treeRes.status} ${treeRes.statusText}`);
  }
  const data = await treeRes.json();
  if (!Array.isArray(data.tree)) throw new Error(`Unexpected tree response format`);
  return { tree: data.tree, branch: actualBranch, repoMeta: repoData };
}

// ========================================================================
// Skill 2: scan_manifest_files —— 扫描已有的依赖声明文件
// 如果项目已有 requirements.txt / pyproject.toml，这是最高置信度的 ground truth
// ========================================================================
const MANIFEST_FILES = [
  "requirements.txt",
  "requirements-dev.txt",
  "requirements/base.txt",
  "requirements/common.txt",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "Pipfile",
  "environment.yml",
  "conda.yml",
];

export async function scanManifestFiles({ owner, repo, branch, tree }) {
  const existing = [];
  const pathSet = new Set(tree.map((t) => t.path));

  for (const f of MANIFEST_FILES) {
    if (pathSet.has(f)) existing.push(f);
  }

  // 解析内容，抽取基线版本约束
  const baseline = {}; // { pkg: "==x.y.z" | ">=x" | null }
  const parsedDetails = {};
  for (const file of existing) {
    const content = await fetchRawFile(owner, repo, branch, file);
    if (!content) continue;
    parsedDetails[file] = { raw: content.slice(0, 4000) };

    if (file.endsWith(".txt")) {
      parseRequirementsTxt(content, baseline);
    } else if (file === "pyproject.toml") {
      parsePyprojectToml(content, baseline);
    } else if (file === "Pipfile") {
      parsePipfile(content, baseline);
    }
  }

  return {
    found: existing,
    baseline,
    details: parsedDetails,
    coverage: existing.length > 0,
  };
}

function parseRequirementsTxt(text, baseline) {
  text.split("\n").forEach((line) => {
    const stripped = line.split("#")[0].trim();
    if (!stripped || stripped.startsWith("-")) return;
    // 解析 pkg[extras]==1.2.3  或  pkg>=1,<2
    const m = stripped.match(/^([A-Za-z0-9_\-\.]+)(\[[^\]]+\])?\s*([<>=!~].+)?$/);
    if (m) {
      const name = m[1].toLowerCase();
      const constraint = (m[3] || "").trim();
      if (!baseline[name]) baseline[name] = constraint || null;
    }
  });
}

function parsePyprojectToml(text, baseline) {
  // 轻量解析（非完整 TOML 解析器），只抓 dependencies 列表
  // [project] dependencies = ["flask>=2.0", ...]
  // [tool.poetry.dependencies] foo = "^1.0"
  const depBlock = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depBlock) {
    const items = depBlock[1].match(/"([^"]+)"/g) || [];
    items.forEach((raw) => {
      const s = raw.replace(/"/g, "").trim();
      const m = s.match(/^([A-Za-z0-9_\-\.]+)\s*([<>=!~].+)?$/);
      if (m) {
        const name = m[1].toLowerCase();
        if (!baseline[name]) baseline[name] = (m[2] || "").trim() || null;
      }
    });
  }

  const poetryBlock = text.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(\n\[|$)/);
  if (poetryBlock) {
    const lines = poetryBlock[1].split("\n");
    lines.forEach((line) => {
      const m = line.match(/^\s*([A-Za-z0-9_\-\.]+)\s*=\s*"([^"]+)"/);
      if (m && m[1].toLowerCase() !== "python") {
        const name = m[1].toLowerCase();
        if (!baseline[name]) baseline[name] = m[2];
      }
    });
  }
}

function parsePipfile(text, baseline) {
  const block = text.match(/\[packages\]([\s\S]*?)(\n\[|$)/);
  if (!block) return;
  block[1].split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Za-z0-9_\-\.]+)\s*=\s*"([^"]+)"/);
    if (m) {
      const name = m[1].toLowerCase();
      if (!baseline[name]) baseline[name] = m[2];
    }
  });
}

// ========================================================================
// Skill 3: detect_runtime_signals —— 探测运行时相关信号
// Python 版本 / CUDA / OS 包 / CI 环境
// ========================================================================
export async function detectRuntimeSignals({ owner, repo, branch, tree }) {
  const signals = {
    pythonVersion: null,
    cuda: null,
    baseImage: null,
    osDeps: [],
    ciPythonVersions: [],
    hasDockerfile: false,
  };
  const pathSet = new Set(tree.map((t) => t.path));

  // 1. .python-version
  if (pathSet.has(".python-version")) {
    const v = await fetchRawFile(owner, repo, branch, ".python-version");
    if (v) signals.pythonVersion = v.trim().split("\n")[0];
  }

  // 2. Dockerfile
  if (pathSet.has("Dockerfile")) {
    signals.hasDockerfile = true;
    const content = await fetchRawFile(owner, repo, branch, "Dockerfile");
    if (content) {
      const fromMatch = content.match(/^FROM\s+([^\s]+)/im);
      if (fromMatch) {
        signals.baseImage = fromMatch[1];
        const pyMatch = fromMatch[1].match(/python:(\d+\.\d+)/);
        if (pyMatch && !signals.pythonVersion) signals.pythonVersion = pyMatch[1];
        if (/cuda/i.test(fromMatch[1])) {
          signals.cuda = fromMatch[1].match(/cuda[:-]?(\d+\.?\d*)/i)?.[1] || "unknown";
        }
      }
      const aptMatches = [...content.matchAll(/apt(?:-get)?\s+install[^\n]+/gi)];
      aptMatches.forEach((m) => {
        const pkgs = m[0]
          .replace(/apt(?:-get)?\s+install/, "")
          .replace(/-y|--no-install-recommends|\\|\n/g, "")
          .trim()
          .split(/\s+/)
          .filter((p) => p && !p.startsWith("-"));
        signals.osDeps.push(...pkgs);
      });
    }
  }

  // 3. CI 配置
  const ciPaths = tree
    .map((t) => t.path)
    .filter((p) => p.startsWith(".github/workflows/") && (p.endsWith(".yml") || p.endsWith(".yaml")));
  for (const ciFile of ciPaths.slice(0, 3)) {
    const content = await fetchRawFile(owner, repo, branch, ciFile);
    if (!content) continue;
    const versions = [...content.matchAll(/python-version:\s*['"]?(\d+\.\d+)['"]?/g)].map((m) => m[1]);
    signals.ciPythonVersions.push(...versions);
  }
  signals.ciPythonVersions = [...new Set(signals.ciPythonVersions)];

  // 4. 兜底：从 CI 版本或 pyproject 推断
  if (!signals.pythonVersion && signals.ciPythonVersions.length > 0) {
    signals.pythonVersion = signals.ciPythonVersions[0];
  }
  if (!signals.pythonVersion) signals.pythonVersion = "3.11";

  return signals;
}

// ========================================================================
// Skill 4: detect_entrypoint —— 推断应用入口文件
// ========================================================================
export async function detectEntrypoint({ tree }) {
  const candidates = [
    "manage.py",
    "main.py",
    "app.py",
    "run.py",
    "server.py",
    "wsgi.py",
    "asgi.py",
    "__main__.py",
    "cli.py",
    "train.py",
    "bot.py",
  ];
  const pathSet = new Set(tree.map((t) => t.path));
  const found = candidates.filter((c) => pathSet.has(c));

  // 带启发式推断
  let suggested = null;
  let cmd = null;
  if (pathSet.has("manage.py")) {
    suggested = "manage.py";
    cmd = 'CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]';
  } else if (pathSet.has("wsgi.py") || pathSet.has("asgi.py")) {
    suggested = pathSet.has("asgi.py") ? "asgi.py" : "wsgi.py";
    cmd = '# CMD ["gunicorn", "-b", "0.0.0.0:8000", "<module>:app"]';
  } else if (pathSet.has("app.py")) {
    suggested = "app.py";
    cmd = 'CMD ["python", "app.py"]';
  } else if (pathSet.has("main.py")) {
    suggested = "main.py";
    cmd = 'CMD ["python", "main.py"]';
  } else if (found.length > 0) {
    suggested = found[0];
    cmd = `CMD ["python", "${found[0]}"]`;
  } else {
    cmd = '# CMD ["python", "<your_entrypoint>.py"]  # entrypoint not auto-detected';
  }

  return { candidates: found, suggested, cmd };
}

// ========================================================================
// Skill 5: extract_project_imports —— 扫描 .py 文件并抽取 imports
// ========================================================================
export async function extractProjectImports({ owner, repo, branch, tree, maxFiles = 50 }) {
  const pyFiles = tree.filter((f) => f.path.endsWith(".py"));
  if (pyFiles.length === 0) return { imports: [], filesScanned: 0 };

  const targetFiles = pyFiles.slice(0, maxFiles);
  const localModules = new Set(
    targetFiles.map((f) => f.path.split("/").pop().replace(".py", ""))
  );

  const fileAnalyses = await pMap(
    targetFiles,
    async (file) => {
      const code = await fetchRawFile(owner, repo, branch, file.path);
      if (!code) return null;
      return { path: file.path, imports: extractImports(code) };
    },
    5
  );

  const allImports = new Set();
  fileAnalyses.forEach((f) => {
    if (!f) return;
    f.imports.forEach((imp) => {
      if (pythonStdLib.has(imp)) return;
      if (localModules.has(imp)) return;
      const norm = normalize(imp);
      if (norm) allImports.add(norm);
    });
  });

  return {
    imports: [...allImports].sort(),
    filesScanned: targetFiles.length,
    totalFiles: pyFiles.length,
  };
}

// ========================================================================
// Skill 6: detect_project_type —— 综合判断项目类型
// ========================================================================
export function detectProjectType({ imports, tree }) {
  const paths = tree.map((t) => t.path);
  const topLevelFiles = paths.filter((p) => !p.includes("/"));
  const scores = scoreProjectTypes(imports, topLevelFiles);

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, s]) => s > 0);

  const top = ranked[0] || ["generic", 0];
  return {
    type: top[0],
    confidence: top[1] > 0 ? Math.min(1, top[1] / 10) : 0.3,
    scores,
    ranked: ranked.slice(0, 3).map(([t, s]) => ({ type: t, score: s })),
  };
}

// ========================================================================
// Skills JSON Schema —— 供 LLM function calling 识别
// ========================================================================
export const SKILL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "scan_manifest_files",
      description:
        "Scan existing dependency manifest files (requirements.txt / pyproject.toml / Pipfile etc.). Returns baseline version constraints already declared by the project.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_runtime_signals",
      description:
        "Detect runtime environment signals: Python version, CUDA, Docker base image, OS-level apt packages, CI Python versions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_project_type",
      description:
        "Classify the project (ml-training / web-fastapi / data-analysis / cli-tool etc.) using imports + entrypoint signatures.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_entrypoint",
      description:
        "Detect the application entrypoint file (manage.py / app.py / main.py ...) and suggest a Dockerfile CMD.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];
