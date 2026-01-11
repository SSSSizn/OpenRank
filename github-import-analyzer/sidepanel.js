// sidepanel.js

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素引用 ---
    const elements = {
        btnScan: document.getElementById('btn-scan'),
        btnAi: document.getElementById('btn-ai'),
        btnCopy: document.getElementById('btn-copy'),
        btnDownload: document.getElementById('btn-download'),

        // 区域与显示
        repoDisplay: document.querySelector("#repo-display .value"),
        resultSection: document.getElementById('result-section'),
        codeReq: document.getElementById('code-req'),
        codeDock: document.getElementById('code-dock'),
        terminal: document.getElementById('terminal-output'),

        // AI 区域
        aiInsightBox: document.getElementById('ai-insight-box'),
        aiExplanation: document.getElementById('ai-explanation'),

        // 选项卡
        tabs: document.querySelectorAll('.tab'),

        // 设置模态框
        btnSettings: document.getElementById("btn-settings"),
        btnCloseSettings: document.getElementById("close-settings"),
        btnSaveSettings: document.getElementById("save-settings"),
        modal: document.getElementById("settings-modal"),
        inputs: {
            url: document.getElementById("cfg-url"),
            key: document.getElementById("cfg-key"),
            model: document.getElementById("cfg-model"),
        }
    };

    // --- 状态变量 ---
    // scanData: 存储第一步扫描到的 { candidates, repoInfo }，用于传给 LLM
    let scanData = null;

    // finalResult: 存储 LLM 生成的最终文本，用于复制/下载
    let finalResult = {
        requirements: "",
        dockerfile: ""
    };

    // --- 初始化 ---
    loadSettings();

    // --- 1. 扫描按钮逻辑 (第一步) ---
    elements.btnScan.addEventListener('click', () => {
        // 1. 重置 UI 和 状态 (关键：防止显示上一个仓库的数据)
        resetState();

        elements.btnScan.disabled = true;
        elements.btnScan.querySelector('.btn-text').textContent = 'SCANNING...';

        log('Initializing repository scan...', 'info');

        // 2. 发送消息给 background.js 执行真正的扫描
        chrome.runtime.sendMessage({ type: "SCAN_REPO" });
    });

    // --- 2. AI 分析按钮逻辑 (第二步) ---
    elements.btnAi.addEventListener('click', () => {
        if (!scanData) {
            log('Error: No scan data available. Please scan first.', 'error');
            return;
        }

        elements.btnAi.disabled = true;
        elements.btnAi.querySelector('.btn-text').textContent = 'ANALYZING...';

        log('Sending dependency data to AI model...', 'info');

        // 发送第一步扫描到的数据给 LLM
        chrome.runtime.sendMessage({
            type: "ANALYZE_WITH_LLM",
            payload: scanData
        });
    });

    // --- 3. 消息监听 (接收 Background 的反馈) ---
    chrome.runtime.onMessage.addListener((msg) => {
        // A. 处理状态日志
        if (msg.type === "UPDATE_STATUS") {
            const type = msg.isError ? 'error' : 'info';
            log(msg.text, type);

            if (msg.isError) {
                // 出错时恢复按钮状态
                elements.btnScan.disabled = false;
                elements.btnScan.querySelector('.btn-text').textContent = 'RE-SCAN';
                if(elements.btnAi) {
                    elements.btnAi.disabled = false;
                    elements.btnAi.querySelector('.btn-text').textContent = '✨ ANALYZE WITH AI';
                }
            }
        }

        // B. 处理第一步扫描完成
        if (msg.type === "SCAN_COMPLETE") {
            const { candidates, repoInfo } = msg.data;

            // 保存状态供下一步使用
            scanData = { candidates, repoInfo };

            // 更新 UI
            elements.repoDisplay.textContent = `${repoInfo.owner}/${repoInfo.repo}`;
            elements.repoDisplay.style.color = "var(--neon-blue)";

            log(`Scan complete. Found ${candidates.length} unique imports.`, 'success');
            candidates.forEach(c => log(`+ ${c}`, 'info'));

            // 按钮变身
            elements.btnScan.disabled = false;
            elements.btnScan.classList.add('secondary'); // 变暗
            elements.btnScan.querySelector('.btn-text').textContent = 'RE-SCAN';

            // 显示结果区(虽然还没内容)和 AI 按钮
            elements.resultSection.classList.remove('hidden');
            elements.btnAi.classList.remove('hidden');
            elements.codeReq.textContent = "Waiting for AI analysis...";
            elements.codeDock.textContent = "Waiting for AI analysis...";

            // 滚动到底部
            scrollToBottom();
        }

        // C. 处理第二步 AI 分析完成
        if (msg.type === "ANALYSIS_RESULT") {
            const data = msg.data;

            // 保存最终结果
            finalResult.requirements = data.requirements || "# No requirements generated";
            finalResult.dockerfile = data.dockerfile || "# No Dockerfile generated";

            // 渲染代码
            elements.codeReq.textContent = finalResult.requirements;
            elements.codeDock.textContent = finalResult.dockerfile;

            // 渲染 AI 解释
            elements.aiInsightBox.classList.remove('hidden');
            elements.aiExplanation.textContent = data.explanation || "Analysis complete.";

            log('AI Analysis complete.', 'success');

            // 恢复按钮
            elements.btnAi.disabled = false;
            elements.btnAi.querySelector('.btn-text').textContent = '✨ RE-ANALYZE';

            scrollToBottom();
        }
    });

    // --- 4. 辅助功能 (复制/下载/Tab切换/设置) ---

    // Tab 切换
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.code-content').forEach(c => c.classList.add('hidden'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;
            document.getElementById(`code-${targetId}`).classList.remove('hidden');
        });
    });

    // 复制功能
    elements.btnCopy.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const text = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;

        navigator.clipboard.writeText(text).then(() => {
            const originalText = elements.btnCopy.textContent;
            elements.btnCopy.textContent = 'OK!';
            setTimeout(() => elements.btnCopy.textContent = originalText, 1500);
        });
    });

    // 下载功能
    elements.btnDownload.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const content = activeTab === 'req' ? elements.codeReq.textContent : elements.codeDock.textContent;
        const filename = activeTab === 'req' ? 'requirements.txt' : 'Dockerfile';

        if (!content || content.startsWith("Waiting")) return;

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
        const config = {
            baseUrl: elements.inputs.url.value,
            apiKey: elements.inputs.key.value,
            model: elements.inputs.model.value
        };
        chrome.storage.local.set({ llmConfig: config }, () => {
            elements.modal.classList.add("hidden");
            log("Configuration saved.", 'success');
        });
    };

    // --- 内部函数 ---

    function log(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-line ${type}`;
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        div.textContent = `[${time}] > ${msg}`;
        elements.terminal.appendChild(div);
        elements.terminal.scrollTop = elements.terminal.scrollHeight;
    }

    function resetState() {
        // 清空内部数据
        scanData = null;
        finalResult = { requirements: "", dockerfile: "" };

        // 清空 UI
        elements.terminal.innerHTML = "";
        elements.repoDisplay.textContent = "Scanning...";
        elements.repoDisplay.style.color = "var(--text-main)";

        elements.resultSection.classList.add('hidden');
        elements.btnAi.classList.add('hidden');
        elements.aiInsightBox.classList.add('hidden');

        // 重置按钮样式
        elements.btnScan.classList.remove('secondary');
    }

    function scrollToBottom() {
        const main = document.querySelector('main');
        main.scrollTop = main.scrollHeight;
    }

    function loadSettings() {
        chrome.storage.local.get(['llmConfig'], (res) => {
            if (res.llmConfig) {
                elements.inputs.url.value = res.llmConfig.baseUrl || "";
                elements.inputs.key.value = res.llmConfig.apiKey || "";
                elements.inputs.model.value = res.llmConfig.model || "";
            }
        });
    }
});