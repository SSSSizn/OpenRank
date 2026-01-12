import { extractImports, normalize, pMap } from "./utils.js";
import { pythonStdLib } from "./stdlib.js";

async function githubFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['githubToken'], async ({ githubToken }) => {
      const headers = {
        'Accept': 'application/vnd.github+json'
      };

      if (githubToken) {
        headers.Authorization = `Bearer ${githubToken}`;
      }

      try {
        const res = await fetch(url, { headers });
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}


// 设置点击图标打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 阶段 1: 扫描仓库
  if (msg.type === "SCAN_REPO") {
    performScan().then(res => {
      chrome.runtime.sendMessage({ type: "SCAN_COMPLETE", data: res });
    }).catch(err => {
      chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `❌ Error: ${err.message}`, isError: true });
    });
    return true;
  }

  // 阶段 2: AI 分析
  if (msg.type === "ANALYZE_WITH_LLM") {
    performLLMAnalysis(msg.payload).catch(err => {
      chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `❌ AI Error: ${err.message}`, isError: true });
    });
    return true;
  }
});

// --- 阶段 1: 静态扫描逻辑 ---
async function performScan() {
  const ghUser = await fetchGitHubUser();

  chrome.runtime.sendMessage({
    type: 'GITHUB_USER',
    user: ghUser
      ? { login: ghUser.login, avatar: ghUser.avatar }
      : null
  });

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) throw new Error("No active tab found.");
  if (!tab.url.includes("github.com")) throw new Error("Not a GitHub repository.");

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "1/4 Parsing repo info..." });

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) { }

  const repoInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_REPO_INFO" });
  if (!repoInfo || !repoInfo.ok) throw new Error("Failed to get repo info.");

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "2/4 Fetching file tree..." });
  const tree = await fetchRepoTree(repoInfo);

  const pyFiles = tree.filter(f => f.path.endsWith(".py"));
  if (pyFiles.length === 0) throw new Error("No Python files found.");

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `3/4 Scanning ${Math.min(pyFiles.length, 50)} files...` });
  const targetFiles = pyFiles.slice(0, 50);

  const fileAnalyses = await pMap(targetFiles, async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`;
    try {
      const res = await githubFetch(rawUrl);
      if (!res.ok) return null;
      const code = await res.text();
      return { path: file.path, imports: extractImports(code) };
    } catch (e) { return null; }
  }, 5);

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "4/4 Filtering modules..." });
  const allImports = new Set();
  const localModules = new Set(targetFiles.map(f => {
    const parts = f.path.split('/');
    return parts[parts.length - 1].replace('.py', '');
  }));

  fileAnalyses.forEach(f => {
    if (!f) return;
    f.imports.forEach(imp => {
      if (!pythonStdLib.has(imp) && !localModules.has(imp)) {
        allImports.add(normalize(imp));
      }
    });
  });

  const candidates = [...allImports];
  // 允许空依赖列表，也许 LLM 能发现别的东西
  if (candidates.length === 0) candidates.push("# No explicit imports found");

  return { candidates, repoInfo };
}

// --- 阶段 2: LLM 交互逻辑 ---
async function performLLMAnalysis({ candidates, repoInfo }) {
  const { llmConfig } = await chrome.storage.local.get(['llmConfig']);
  if (!llmConfig || !llmConfig.apiKey) throw new Error("Missing API Key.");

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "📡 Contacting AI Model..." });
  const knowledge = await loadAndFilterKnowledge(candidates);

  const knowledgeText = `
Historical dependency version patterns from real-world Python projects:

Most commonly used versions:
${Object.entries(knowledge.package_versions)
      .map(([pkg, vers]) =>
        `- ${pkg}: ${Object.entries(vers)
          .map(([v, c]) => `${v} (${c} projects)`)
          .join(", ")}`
      )
      .join("\n")}

Frequently observed compatible version pairs:
${Object.entries(knowledge.version_cooccurrence)
      .slice(0, 10)
      .map(([pair, count]) => `- ${pair} (${count} projects)`)
      .join("\n")}
`;

  const prompt = `
Role: Senior Python DevOps Engineer.

Repository:
${repoInfo.owner}/${repoInfo.repo}

Detected third-party imports (static analysis):
${candidates.join(', ')}

${knowledgeText}

Your tasks:

1. Generate a COMPLETE and FINAL requirements.txt
   - Each dependency MUST include an explicit version (e.g. flask==2.3.3)
   - Versions must be mutually compatible
   - Do NOT include Python standard library modules
   - Target Python >= 3.9, prefer using python:3.9-slim as the base image

2. Generate a FINAL, RUNNABLE Dockerfile
   - The Dockerfile MUST install dependencies ONLY via requirements.txt
   - Do NOT inline "pip install package" commands
   - You MUST use:
     COPY requirements.txt .
     RUN pip install --no-cache-dir -r requirements.txt
   - Use a slim Python base image
   - Set a reasonable WORKDIR
   - If application entrypoint is unknown, leave CMD commented with explanation

3. Provide a very brief explanation of your decisions.

IMPORTANT:
- The Dockerfile MUST be consistent with the generated requirements.txt
- This Dockerfile is intended to be production-ready, not a draft

Return ONLY valid JSON in the exact format below:

{
  "requirements": "requirements.txt content",
  "dockerfile": "Dockerfile content",
  "explanation": "short explanation"
}
  `;

  const llmResult = await callLLM(llmConfig, prompt);

  // 检查结果完整性
  if (!llmResult.requirements) llmResult.requirements = "# AI failed to generate requirements";
  if (!llmResult.dockerfile) llmResult.dockerfile = "# AI failed to generate Dockerfile";

  chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", data: llmResult });
}

// --- Helpers ---
async function fetchRepoTree({ owner, repo, branch }) {
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;

  const repoRes = await githubFetch(repoApi, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'py-agent-extension'
    }
  });

  if (!repoRes.ok) {
    const text = await repoRes.text();
    if (repoRes.status === 403 && text.includes('rate limit')) {
      throw new Error(
        'GitHub API rate limit exceeded.\n' +
        '👉 Please add a GitHub Token in Settings to continue.'
      );
    }
    else {
      throw new Error(
        `Repo fetch failed:
URL: ${repoApi}
Status: ${repoRes.status} ${repoRes.statusText}
Response: ${text}`
      );
    }
  }

  const repoData = await repoRes.json();
  const actualBranch =
    branch && branch !== 'main'
      ? branch
      : repoData.default_branch;

  if (!actualBranch) {
    throw new Error(
      `Cannot determine default branch for ${owner}/${repo}`
    );
  }

  const treeApi = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;

  const treeRes = await githubFetch(treeApi, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'py-agent-extension'
    }
  });

  if (!treeRes.ok) {
    const text = await treeRes.text();
    throw new Error(
      `Tree fetch failed:
URL: ${treeApi}
Status: ${treeRes.status} ${treeRes.statusText}
Response: ${text}`
    );
  }

  const data = await treeRes.json();

  if (!Array.isArray(data.tree)) {
    throw new Error(
      `Unexpected tree response format:
${JSON.stringify(data, null, 2)}`
    );
  }

  return data.tree;
}

async function callLLM(config, userPrompt) {
  const url = `${config.baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` };
  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: "You are a JSON generator. Do not use Markdown blocks. Return raw JSON." },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API Error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  try {
    let content = data.choices[0].message.content;
    // 自动清洗 Markdown 标记 (这是最常见的错误原因)
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(content);
  } catch (e) {
    throw new Error("Failed to parse AI response JSON");
  }
}

async function fetchGitHubUser() {
  try {
    const res = await githubFetch('https://api.github.com/user');
    if (!res.ok) return null;

    const data = await res.json();
    return {
      login: data.login,
      avatar: data.avatar_url
    };
  } catch {
    return null;
  }
}

async function loadAndFilterKnowledge(candidates) {
  // candidates: ["requests", "fastapi", ...]
  const res = await fetch(chrome.runtime.getURL("dependency_version_knowledge.json"));
  const kb = await res.json();

  const candidateSet = new Set(candidates.map(c => c.toLowerCase()));

  const filtered = {
    package_versions: {},
    version_cooccurrence: {}
  };

  // 1. 单包版本
  for (const [pkg, versions] of Object.entries(kb.package_versions || {})) {
    if (candidateSet.has(pkg)) {
      // 只保留 Top 3
      filtered.package_versions[pkg] =
        Object.fromEntries(Object.entries(versions).slice(0, 3));
    }
  }

  // 2. 版本共现
  for (const [pair, count] of Object.entries(kb.version_cooccurrence || {})) {
    const involvedPkgs = pair
      .split("||")
      .map(s => s.trim().split("==")[0]);

    if (involvedPkgs.some(p => candidateSet.has(p))) {
      filtered.version_cooccurrence[pair] = count;
    }
  }

  return filtered;
}
