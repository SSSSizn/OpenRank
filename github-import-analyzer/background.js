function extractImports(code) {
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

function normalize(pkg) {
  const mapping = {
    sklearn: "scikit-learn",
    cv2: "opencv-python",
    PIL: "Pillow",
    yaml: "PyYAML"
  };
  return mapping[pkg] || pkg;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log("Received message:", msg.type);
  if (msg.type === "PING") {
    console.log("Pong");
    return { pong: true };
  }
  if (msg.type === "START_ANALYSIS") {
    console.log("Starting analysis");
    startAnalysis();
    return { started: true };
  }
  if (msg.type === "FETCH_TREE") {
    console.log("Fetching tree for", msg.owner, msg.repo, msg.branch);
    const { owner, repo, branch } = msg;

    // First, get repo info to confirm default branch
    const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
    return fetch(repoApi)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Repo not found or private: ${res.status}`);
        }
        return res.json();
      })
      .then(repoData => {
        const actualBranch = repoData.default_branch;
        console.log("Actual default branch:", actualBranch);
        const api = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
        return fetch(api);
      })
      .then(res => {
        console.log("Fetch response status:", res.status);
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        console.log("Fetched data:", data);
        if (!data.tree) {
          throw new Error(`Invalid API response: no tree data`);
        }
        return { tree: data.tree };
      })
      .catch(error => {
        console.error("Error in FETCH_TREE:", error);
        throw new Error(`Failed to fetch tree: ${error.message}`);
      });
  }

  if (msg.type === "FETCH_RAW") {
    console.log("Fetching raw for", msg.path);
    const { owner, repo, branch, path } = msg;
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    return fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Raw fetch error: ${res.status} ${res.statusText}`);
        }
        return res.text();
      })
      .then(text => ({ text }))
      .catch(error => {
        throw new Error(`Failed to fetch raw file: ${error.message}`);
      });
  }
});

async function startAnalysis() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("Got active tab");

    if (!tab.url || !tab.url.startsWith("https://github.com/")) {
      chrome.runtime.sendMessage({ type: "ANALYSIS_ERROR", error: "Please navigate to a GitHub repository page" });
      return;
    }

    const repoInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_REPO_INFO" });
    if (!repoInfo.ok) {
      chrome.runtime.sendMessage({ type: "ANALYSIS_ERROR", error: "Not a GitHub repo page" });
      return;
    }

    console.log(`Repo: ${repoInfo.owner}/${repoInfo.repo}, branch: ${repoInfo.branch}`);

    const treeResp = await (async () => {
      const { owner, repo, branch } = repoInfo;
      const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
      const repoRes = await fetch(repoApi);
      if (!repoRes.ok) {
        throw new Error(`Repo not found or private: ${repoRes.status}`);
      }
      const repoData = await repoRes.json();
      const actualBranch = repoData.default_branch;
      const api = `https://api.github.com/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
      const res = await fetch(api);
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.tree) {
        throw new Error(`Invalid API response: no tree data`);
      }
      return { tree: data.tree };
    })();

    console.log(`File count: ${treeResp.tree.length}`);

    const pyFiles = treeResp.tree
      .filter((f) => f.path.endsWith(".py"))
      .map((f) => f.path);

    console.log(`Python files: ${pyFiles.length}`);

    const pkgs = new Set();

    for (const path of pyFiles.slice(0, 20)) {
      console.log(`Fetching ${path}`);
      const res = await (async () => {
        const url = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${path}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Raw fetch error: ${response.status}`);
        }
        return { text: await response.text() };
      })();
      extractImports(res.text).forEach((p) => pkgs.add(normalize(p)));
    }

    console.log("Analysis done");
    const result = "Analyzing...\n✔ Analysis done\n\n=== requirements.txt ===\n" + [...pkgs].sort().join("\n");
    chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", result });
  } catch (error) {
    console.error("Analysis error:", error);
    chrome.runtime.sendMessage({ type: "ANALYSIS_ERROR", error: error.message });
  }
}
