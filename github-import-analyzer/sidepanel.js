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
    initLineNumbers();

    // --- 核心修复：动态更新行号函数 ---
    function updateLineNumbers(text) {
        if (!text) {
            elements.lineNumbers.innerHTML = '<span>1</span>';
            return;
        }
        // 计算行数 (根据换行符)
        const lines = text.split('\n').length;

        // 生成对应数量的 span
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<span>${i}</span>`;
        }
        elements.lineNumbers.innerHTML = html;
    }

    // 同步行号和代码内容的滚动
    function syncScrollPositions() {
        const activeCode = document.querySelector('.code-content:not(.hidden)');
        if (activeCode && elements.lineNumbers) {
            // 移除旧的事件监听器
            if (activeCode._scrollHandler) {
                activeCode.removeEventListener('scroll', activeCode._scrollHandler);
            }
            
            // 创建新的事件处理器：当代码滚动时，同步行号
            const newHandler = function() {
                elements.lineNumbers.scrollTop = activeCode.scrollTop;
            };
            
            activeCode._scrollHandler = newHandler;
            activeCode.addEventListener('scroll', newHandler);
        }
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

            const dockDraft = `# ⚠️ Draft Dockerfile – NOT RUNNABLE
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

            // 更新行号 (默认显示的是 requirements)
            updateLineNumbers(reqDraft);
            syncScrollPositions();

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

            // 更新行号 (检查当前哪个 Tab 是激活的)
            const activeTab = document.querySelector('.tab.active').dataset.target;
            const activeText = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;
            updateLineNumbers(activeText);
            syncScrollPositions();

            scrollToBottom();
        }
    });

    // --- 辅助功能 ---

    // Tab 切换
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.code-content').forEach(c => c.classList.add('hidden'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;

            // 显示对应的内容
            const targetElement = document.getElementById(`code-${targetId}`);
            targetElement.classList.remove('hidden');

            // 切换 Tab 时重新计算行号
            updateLineNumbers(targetElement.textContent);
            syncScrollPositions();
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

    // 设置逻辑
    elements.btnSettings.onclick = () => elements.modal.classList.remove("hidden");
    elements.btnCloseSettings.onclick = () => elements.modal.classList.add("hidden");
    elements.btnSaveSettings.onclick = () => {
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
        div.textContent = msg;
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

    // 初始化行号功能
    function initLineNumbers() {
        // 监听窗口大小变化
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const activeCode = document.querySelector('.code-content:not(.hidden)');
                if (activeCode && elements.lineNumbers) {
                    updateLineNumbers(activeCode.textContent);
                    syncScrollPositions();
                }
            }, 300);
        });

        // 初始更新行号
        requestAnimationFrame(() => {
            const activeCode = document.querySelector('.code-content:not(.hidden)');
            if (activeCode && elements.lineNumbers) {
                updateLineNumbers(activeCode.textContent);
                syncScrollPositions();
            }
        });
    }
});