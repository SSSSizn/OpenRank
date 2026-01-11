document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const elements = {
        btnScan: document.getElementById('btn-scan'),
        btnAi: document.getElementById('btn-ai'),
        btnCopy: document.getElementById('btn-copy'),
        btnDownload: document.getElementById('btn-download'),

        repoDisplay: document.querySelector("#repo-display .value"),
        resultSection: document.getElementById('result-section'),
        codeReq: document.getElementById('code-req'),
        codeDock: document.getElementById('code-dock'),
        // 新增：获取行号容器
        lineNumbers: document.querySelector('.line-numbers'),
        terminal: document.getElementById('terminal-output'),

        aiInsightBox: document.getElementById('ai-insight-box'),
        aiExplanation: document.getElementById('ai-explanation'),
        tabs: document.querySelectorAll('.tab'),

        btnSettings: document.getElementById("btn-settings"),
        btnCloseSettings: document.getElementById("close-settings"),
        btnSaveSettings: document.getElementById("save-settings"),
        modal: document.getElementById("settings-modal"),
        inputs: {
            url: document.getElementById("cfg-url"),
            key: document.getElementById("cfg-key"),
            model: document.getElementById("cfg-model"),
            githubToken: document.getElementById("cfg-github-token"),
        }
    };

    // --- 状态 ---
    let scanData = null;

    // 初始化
    loadSettings();

    // --- 核心修复：动态更新行号函数 ---
    function updateLineNumbers(text) {
        if (!text) {
            elements.lineNumbers.innerHTML = '<span>1</span>';
            return;
        }
        // 计算行数 (根据换行符)
        // 过滤掉末尾可能的空行，防止多出一个空行号
        const lines = text.trimEnd().split('\n').length;

        // 生成对应数量的 span
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<span>${i}</span>`;
        }
        elements.lineNumbers.innerHTML = html;
    }

    // --- 按钮逻辑 ---

    // 1. 扫描 (SCAN REPO)
    elements.btnScan.addEventListener('click', () => {
        resetState();
        elements.btnScan.disabled = true;
        elements.btnScan.querySelector('.btn-text').textContent = 'SCANNING...';
        log('Initializing repository scan...', 'info');
        chrome.runtime.sendMessage({ type: "SCAN_REPO" });
    });

    // 2. AI 分析 (ANALYZE WITH AI)
    elements.btnAi.addEventListener('click', () => {
        if (!scanData) return;

        elements.btnAi.disabled = true;
        elements.btnAi.querySelector('.btn-text').textContent = 'GENERATING...';

        elements.aiInsightBox.classList.remove('hidden');
        elements.aiExplanation.textContent = "🤖 AI is analyzing dependencies and generating optimized versions...";

        log('Sending data to LLM...', 'info');
        chrome.runtime.sendMessage({ type: "ANALYZE_WITH_LLM", payload: scanData });
    });

    // --- 消息监听 ---
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'GITHUB_USER') {
            const el = document.getElementById('github-user');

            if (msg.user) {
                el.innerHTML = `
            <img src="${msg.user.avatar}" class="gh-avatar">
            <span>${msg.user.login}</span>
            `;
                el.classList.add('ok');
            } else {
                el.textContent = 'GitHub: Anonymous';
                el.classList.remove('ok');
            }
        }

        if (msg.type === "UPDATE_STATUS") {
            log(msg.text, msg.isError ? 'error' : 'info');
            if (msg.isError) {
                elements.btnScan.disabled = false;
                elements.btnScan.querySelector('.btn-text').textContent = 'RE-SCAN';
                if (elements.btnAi) {
                    elements.btnAi.disabled = false;
                    elements.btnAi.querySelector('.btn-text').textContent = '✨ RETRY AI';
                }
            }
        }

        // 阶段1完成
        if (msg.type === "SCAN_COMPLETE") {
            const { candidates, repoInfo } = msg.data;
            scanData = { candidates, repoInfo };

            elements.repoDisplay.textContent = `${repoInfo.owner}/${repoInfo.repo}`;
            elements.repoDisplay.style.color = "var(--neon-blue)";

            log(`Scan found ${candidates.length} imports.`, 'success');
            candidates.forEach(c => log(`+ ${c}`, 'info'));

            elements.btnScan.disabled = false;
            elements.btnScan.classList.add('secondary');
            elements.btnScan.querySelector('.btn-text').textContent = 'RE-SCAN';

            elements.resultSection.classList.remove('hidden');
            elements.btnAi.classList.remove('hidden');
            elements.btnAi.disabled = false;

            // 生成草稿
            const reqDraft = candidates.length > 0
                ? "# [Draft] Generated from static import analysis:\n" + candidates.join('\n')
                : "# No explicit imports detected.";

            const dockDraft = `# ⚠️ Draft Dockerfile — NOT RUNNABLE
# ----------------------------------
# This file is generated from static import analysis only.
# At this stage:
#   - Dependency versions are UNKNOWN
#   - Application entrypoint (CMD) is UNKNOWN
#
# ❌ Do NOT use this Dockerfile to build an image yet.
#
# 👉 Next step:
# Run AI analysis to resolve:
#   1. Exact dependency versions (requirements.txt)
#   2. Correct startup command (CMD)
#   3. Compatible Python base image
#
# After AI analysis, this draft will be replaced
# with a runnable Dockerfile.

FROM python:3.9-slim

WORKDIR /app
COPY . .

# Detected imports (no versions yet)
RUN pip install --no-cache-dir requests flask openai

# CMD will be generated after AI analysis
`;

            elements.codeReq.textContent = reqDraft;
            elements.codeDock.textContent = dockDraft;

            // 【关键】更新行号 (默认显示的是 requirements)
            updateLineNumbers(reqDraft);

            scrollToBottom();
        }

        // 阶段2完成
        if (msg.type === "ANALYSIS_RESULT") {
            const data = msg.data;

            elements.codeReq.textContent = data.requirements || "# Error";
            elements.codeDock.textContent = data.dockerfile || "# Error";

            elements.aiInsightBox.classList.remove('hidden');
            elements.aiExplanation.textContent = data.explanation || "No explanation provided.";

            log('AI content generated successfully.', 'success');

            elements.btnAi.disabled = false;
            elements.btnAi.querySelector('.btn-text').textContent = '✨ RE-GENERATE';

            // 【关键】更新行号 (检查当前哪个 Tab 是激活的)
            const activeTab = document.querySelector('.tab.active').dataset.target;
            const activeText = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;
            updateLineNumbers(activeText);

            scrollToBottom();
        }
    });

    // --- 辅助功能 ---

    // Tab 切换 (修改重点)
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.code-content').forEach(c => c.classList.add('hidden'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;

            // 显示对应的内容
            const targetElement = document.getElementById(`code-${targetId}`);
            targetElement.classList.remove('hidden');

            // 【关键】切换 Tab 时重新计算行号
            updateLineNumbers(targetElement.textContent);
        });
    });

    elements.btnCopy.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const text = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = elements.btnCopy.textContent;
            elements.btnCopy.textContent = 'OK!';
            setTimeout(() => elements.btnCopy.textContent = originalText, 1500);
        });
    });

    elements.btnDownload.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const content = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;
        const filename = activeTab === 'req' ? 'requirements.txt' : 'Dockerfile';
        if (!content) return;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    });

    // 设置逻辑保持不变...
    elements.btnSettings.onclick = () => elements.modal.classList.remove("hidden");
    elements.btnCloseSettings.onclick = () => elements.modal.classList.add("hidden");
    elements.btnSaveSettings.onclick = () => {
        const config = {
            baseUrl: elements.inputs.url.value,
            apiKey: elements.inputs.key.value,
            model: elements.inputs.model.value,
            githubToken: elements.inputs.githubToken.value.trim()
        };
        chrome.storage.local.set({
            llmConfig: {
                baseUrl: elements.inputs.url.value,
                apiKey: elements.inputs.key.value,
                model: elements.inputs.model.value
            },
            githubToken: elements.inputs.githubToken.value.trim()
        }, () => {
            elements.modal.classList.add("hidden");
            log("Config saved.", 'success');
        });
    };

    function log(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-line ${type}`;
        div.textContent = `> ${msg}`;
        elements.terminal.appendChild(div);
        elements.terminal.scrollTop = elements.terminal.scrollHeight;
    }

    function resetState() {
        scanData = null;
        elements.terminal.innerHTML = "";
        elements.repoDisplay.textContent = "Waiting...";
        elements.repoDisplay.style.color = "var(--text-main)";
        elements.resultSection.classList.add('hidden');
        elements.btnAi.classList.add('hidden');
        elements.aiInsightBox.classList.add('hidden');
        elements.btnScan.classList.remove('secondary');
        // 重置行号
        updateLineNumbers("");
    }

    function scrollToBottom() {
        const main = document.querySelector('main');
        main.scrollTop = main.scrollHeight;
    }

    function loadSettings() {
        chrome.storage.local.get(['llmConfig', 'githubToken'], (res) => {
            if (res.llmConfig) {
                elements.inputs.url.value = res.llmConfig.baseUrl || "";
                elements.inputs.key.value = res.llmConfig.apiKey || "";
                elements.inputs.model.value = res.llmConfig.model || "";
            }
            elements.inputs.githubToken.value = res.githubToken || "";
        });
    }
});

// 在你的 sidepanel.js 中添加以下函数来同步行号

/**
 * 更新代码块的行号，使其与实际显示行数（包括换行）同步
 * @param {HTMLElement} codeElement - 代码内容元素
 * @param {HTMLElement} lineNumbersElement - 行号容器元素
 */
function updateLineNumbers(codeElement, lineNumbersElement) {
  if (!codeElement || !lineNumbersElement) return;
  
  // 清空现有行号
  lineNumbersElement.innerHTML = '';
  
  // 获取代码内容
  const content = codeElement.textContent || '';
  if (!content.trim()) {
    lineNumbersElement.innerHTML = '<span>1</span>';
    return;
  }
  
  // 按换行符分割内容（这是实际的逻辑行数）
  const lines = content.split('\n');
  const totalLines = lines.length;
  
  // 生成行号
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= totalLines; i++) {
    const span = document.createElement('span');
    span.textContent = i;
    fragment.appendChild(span);
  }
  
  lineNumbersElement.appendChild(fragment);
  
  // 确保行号容器和代码内容滚动同步
  syncScrollPositions(codeElement, lineNumbersElement);
}

/**
 * 同步行号和代码内容的滚动位置
 */
function syncScrollPositions(codeElement, lineNumbersElement) {
  // 移除旧的事件监听器（如果存在）
  const oldHandler = codeElement._scrollHandler;
  if (oldHandler) {
    codeElement.removeEventListener('scroll', oldHandler);
  }
  
  // 创建新的事件处理器
  const newHandler = function() {
    lineNumbersElement.scrollTop = codeElement.scrollTop;
  };
  
  // 保存引用以便后续移除
  codeElement._scrollHandler = newHandler;
  
  // 添加事件监听器
  codeElement.addEventListener('scroll', newHandler);
}

/**
 * 设置代码内容并更新行号
 * @param {string} codeId - 代码块ID（'req' 或 'dock'）
 * @param {string} content - 代码内容
 */
function setCodeContent(codeId, content) {
  const codeElement = document.getElementById(`code-${codeId}`);
  const lineNumbersElement = document.querySelector('.line-numbers');
  
  if (codeElement) {
    codeElement.textContent = content;
    
    // 只有当前激活的代码块才更新行号
    if (!codeElement.classList.contains('hidden')) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        updateLineNumbers(codeElement, lineNumbersElement);
      });
    }
  }
}

/**
 * 切换标签页并更新行号
 */
function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const target = this.dataset.target;
      
      // 切换标签激活状态
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // 切换代码内容显示
      document.querySelectorAll('.code-content').forEach(c => c.classList.add('hidden'));
      const activeCode = document.getElementById(`code-${target}`);
      if (activeCode) {
        activeCode.classList.remove('hidden');
        
        // 更新行号
        const lineNumbersElement = document.querySelector('.line-numbers');
        requestAnimationFrame(() => {
          updateLineNumbers(activeCode, lineNumbersElement);
        });
      }
    });
  });
}

/**
 * 监听窗口大小变化（虽然我们现在用逻辑行数，但保留以防万一）
 */
function setupResizeHandler() {
  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const activeCode = document.querySelector('.code-content:not(.hidden)');
      const lineNumbersElement = document.querySelector('.line-numbers');
      if (activeCode && lineNumbersElement) {
        updateLineNumbers(activeCode, lineNumbersElement);
      }
    }, 300);
  });
}

/**
 * 初始化所有功能
 */
function initLineNumbers() {
  setupTabSwitching();
  setupResizeHandler();
  
  // 初始更新行号
  requestAnimationFrame(() => {
    const activeCode = document.querySelector('.code-content:not(.hidden)');
    const lineNumbersElement = document.querySelector('.line-numbers');
    if (activeCode && lineNumbersElement) {
      updateLineNumbers(activeCode, lineNumbersElement);
    }
  });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLineNumbers);
} else {
  initLineNumbers();
}

// 导出函数供外部使用
window.pyAnalyzerUtils = {
  updateLineNumbers,
  setCodeContent
};