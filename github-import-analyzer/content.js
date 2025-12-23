console.log("Content script loaded on GitHub page");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_REPO_INFO") {
    console.log("Received GET_REPO_INFO message");
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
    if (!match) {
      console.log("Not a repo page");
      sendResponse({ ok: false });
      return;
    }

    const [_, owner, repo] = match;
    let branch = "main"; // default

    // Try to get branch from meta tag
    const metaBranch = document.querySelector('meta[name="octolytics-dimension-repository_default_branch"]')?.content;
    if (metaBranch) {
      branch = metaBranch;
    } else {
      // Try to get from page elements
      const branchElement = document.querySelector('[data-menu-button] [data-target="branch-filter.menuButton"] span') ||
                            document.querySelector('.branch-name') ||
                            document.querySelector('[aria-label*="Switch branches"] span');
      if (branchElement) {
        branch = branchElement.textContent.trim();
      }
    }

    console.log(`Repo info: ${owner}/${repo}, branch: ${branch}`);
    sendResponse({
      ok: true,
      owner,
      repo,
      branch
    });
  }
});
