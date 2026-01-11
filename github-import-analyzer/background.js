import { extractImports, normalize, pMap } from "./utils.js";
import { pythonStdLib } from "./stdlib.js";


// 【新增】设置点击图标打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    runAnalysisPipeline().catch(err => {
      // 发送错误消息给侧边栏
      chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `❌ Error: ${err.message}`, isError: true });
    });
    return true;
  }
});


async function runAnalysisPipeline() {
  // 0. 检查 LLM 配置
  const { llmConfig } = await chrome.storage.local.get(['llmConfig']);
  if (!llmConfig || !llmConfig.apiKey) {
    throw new Error("Please set API Key in Extension Options first.");
  }

  // 1. 获取 Tab 信息
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes("github.com")) throw new Error("Not a GitHub page");

  // 2. 注入脚本并获取 Repo 信息 (Step 3)
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "1/6 parsing repo info..." });
  const repoInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_REPO_INFO" });
  if (!repoInfo.ok) throw new Error("Failed to get repo info");

  // 3. 获取文件树 (Step 4)
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "2/6 fetching file tree..." });
  const tree = await fetchRepoTree(repoInfo);

  // 4. 筛选 .py 文件 (Step 5)
  const pyFiles = tree.filter(f => f.path.endsWith(".py"));
  if (pyFiles.length === 0) throw new Error("No Python files found.");

  // 5. 并发拉取内容 (Step 6) & 静态解析 (Step 7)
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: `3/6 fetching ${pyFiles.length} files...` });

  // 限制最大读取 50 个文件防止 Token 爆炸，实际项目可分片处理
  const targetFiles = pyFiles.slice(0, 50);

  const fileAnalyses = await pMap(targetFiles, async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`;
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) return null;
      const code = await res.text();
      return {
        path: file.path,
        imports: extractImports(code)
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  }, 5); // 5 并发

  // 6. 初步分类与过滤 (Step 8 & 9)
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "4/6 building context..." });

  const allImports = new Set();
  const importContext = [];

  // 获取本地目录名作为 "本地模块" 排除项
  const localModules = new Set(targetFiles.map(f => {
    const parts = f.path.split('/');
    return parts[parts.length - 1].replace('.py', '');
  }));

  fileAnalyses.forEach(f => {
    if (!f) return;
    f.imports.forEach(imp => {
      // 排除标准库 和 显式的本地文件
      if (!pythonStdLib.has(imp) && !localModules.has(imp)) {
        allImports.add(normalize(imp));
        importContext.push(`File '${f.path}' imports '${imp}'`);
      }
    });
  });

  const candidates = [...allImports];

  // 7. LLM 推理与生成 (Step 10-16)
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", text: "5/6 LLM reasoning (Steps 10-16)..." });

  const prompt = `
    You are a Python DevOps Expert. Analyze these imports from a GitHub repo: ${repoInfo.owner}/${repoInfo.repo}.
    
    Detected Candidate Imports: ${JSON.stringify(candidates)}
    Context: ${JSON.stringify(importContext.slice(0, 30))} (truncated)

    Tasks:
    1. Map imports to correct PyPI package names (e.g., 'yaml' -> 'PyYAML', 'sklearn' -> 'scikit-learn').
    2. Filter out internal utility modules that might have been missed by static analysis.
    3. Suggest version constraints compatible with Python 3.8+.
    4. Generate a 'requirements.txt'.
    5. Generate a 'Dockerfile' for a standard python app.

    Output format: JSON with keys "requirements" (string), "dockerfile" (string), "explanation" (string).
  `;

  const llmResult = await callLLM(llmConfig, prompt);

  // 8. 完成
  chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", data: llmResult });
}

// GitHub API Tree Fetcher
async function fetchRepoTree({ owner, repo, branch }) {
  // 先获取 default branch 确认
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
  const repoData = await (await fetch(repoApi)).json();
  const actualBranch = branch === "main" ? repoData.default_branch : branch;

  const treeApi = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
  const res = await fetch(treeApi);
  const data = await res.json();
  return data.tree || [];
}

// Generic LLM Caller
async function callLLM(config, userPrompt) {
  const url = `${config.baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`
  };

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: "You are a helpful Python dependency analyzer." },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" } // Force JSON if supported
  });

  const res = await fetch(url, { method: "POST", headers, body });
  const data = await res.json();

  try {
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (e) {
    throw new Error("Failed to parse LLM response: " + e.message);
  }
}