console.log("GitHub Analyzer Content Script Active");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_REPO_INFO") {
    // 兼容多种 GitHub URL 格式
    const pathParts = window.location.pathname.split('/').filter(p => p);

    if (pathParts.length < 2) {
      sendResponse({ ok: false });
      return;
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    // 尝试获取分支，默认为 main，后续 API 会校正
    let branch = "main";
    // 如果 URL 包含 /tree/xxx 或 /blob/xxx
    if (pathParts[2] === 'tree' || pathParts[2] === 'blob') {
      branch = pathParts[3];
    } else {
        // 尝试从 DOM 获取分支名
        const branchSelector = document.querySelector('[data-hotkey="w"] span');
        if (branchSelector) branch = branchSelector.textContent.trim();
    }

    sendResponse({ ok: true, owner, repo, branch });
  }
});