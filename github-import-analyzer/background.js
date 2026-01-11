import { extractImports, normalize, pMap } from "./utils.js";
import { pythonStdLib } from "./stdlib.js";

// 设置点击图标打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 阶段 1: 扫描仓库
  if (msg.type === "SCAN_REPO") {
    performScan().then(res => {
      chrome.runtime.sendMessage({ type: "SCAN_COMPLETE", data: res });
    }).catch(err => {
      chrome.runtime.sendMessage({
        type: "UPDATE_STATUS",
        text: `❌ Error: ${err.message}`,
        isError: true
      });
    });
    return true; // 保持通道开启
  }

  // 阶段 2: AI 分析
  if (msg.type === "ANALYZE_WITH_LLM") {
    performLLMAnalysis(msg.payload).catch(err => {
      chrome.runtime.sendMessage({
        type: "UPDATE_STATUS",
        text: `❌ AI Error: ${err.message}`,
        isError: true
      });
    });
    return true;
  }
});

// --- 阶段 1: 静态扫描逻辑 ---
async function performScan() {
  // 关键：每次调用时动态获取当前 Active Tab
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.url) {
    throw new Error("No active tab found. Please focus on a GitHub page.");
  }

  // 只有在 GitHub 页面才继续
  if (!tab.url.includes("github.com")) {
    throw new Error("Target must be a GitHub repository.");
  }

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "1/4 Parsing repo info..." });

  // 尝试重新注入 Content Script，以防页面刚刚刷新过
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    // 忽略脚本已存在的错误
  }

  // 获取仓库信息
  const repoInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_REPO_INFO" });
  if (!repoInfo || !repoInfo.ok) throw new Error("Failed to get repo info. Refresh page?");

  // 获取文件树
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "2/4 Fetching file tree..." });
  const tree = await fetchRepoTree(repoInfo);

  const pyFiles = tree.filter(f => f.path.endsWith(".py"));
  if (pyFiles.length === 0) throw new Error("No Python files found.");

  // 并发拉取
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `3/4 Scanning ${Math.min(pyFiles.length, 50)} files...` });
  const targetFiles = pyFiles.slice(0, 50);

  const fileAnalyses = await pMap(targetFiles, async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`;
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) return null;
      const code = await res.text();
      return { path: file.path, imports: extractImports(code) };
    } catch (e) { return null; }
  }, 5);

  // 整理依赖
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "4/4 Filtering local modules..." });
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
  if (candidates.length === 0) throw new Error("No external dependencies found.");

  return { candidates, repoInfo };
}

// --- 阶段 2: LLM 交互逻辑 ---
async function performLLMAnalysis({ candidates, repoInfo }) {
  const { llmConfig } = await chrome.storage.local.get(['llmConfig']);
  if (!llmConfig || !llmConfig.apiKey) throw new Error("Missing API Key. Check Settings.");

  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "📡 Contacting AI Model..." });

  const prompt = `
    Role: Python DevOps Expert.
    Repo: ${repoInfo.owner}/${repoInfo.repo}
    Detected Imports: ${JSON.stringify(candidates)}
    
    Task:
    1. Verify PyPI package names.
    2. Suggest Python 3.9+ compatible versions.
    3. Generate requirements.txt.
    4. Generate a lean Dockerfile (python:3.9-slim).
    
    Return STRICT JSON (no markdown):
    {
      "requirements": "string (multiline)",
      "dockerfile": "string (multiline)",
      "explanation": "string (brief summary)"
    }
  `;

  const llmResult = await callLLM(llmConfig, prompt);
  chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", data: llmResult });
}

// --- Helpers ---
async function fetchRepoTree({ owner, repo, branch }) {
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
  const repoRes = await fetch(repoApi);
  if (!repoRes.ok) throw new Error("Repo inaccessible (Private or Invalid).");

  const repoData = await repoRes.json();
  const actualBranch = (branch && branch !== 'main') ? branch : repoData.default_branch;

  const treeApi = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
  const res = await fetch(treeApi);
  if (!res.ok) throw new Error("Tree fetch failed.");

  const data = await res.json();
  return data.tree || [];
}

async function callLLM(config, userPrompt) {
  const url = `${config.baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`
  };

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: "You are a JSON generator. Always return valid JSON." },
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
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    // 容错处理：有时模型会返回 Markdown ```json ... ```
    const content = data.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Invalid JSON response from LLM");
  }
}