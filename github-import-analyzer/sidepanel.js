document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素引用 ---
    const elements = {
        btnScan: document.getElementById('btn-scan'),
        btnAi: document.getElementById('btn-ai'),
        btnCopy: document.getElementById('btn-copy'),
        btnDownload: document.getElementById('btn-download'),
        
        resultSection: document.getElementById('result-section'),
        codeReq: document.getElementById('code-req'),
        codeDock: document.getElementById('code-dock'),
        terminal: document.getElementById('terminal-output'),
        
        tabs: document.querySelectorAll('.tab'),
        aiInsightBox: document.getElementById('ai-insight-box'),
        aiExplanation: document.getElementById('ai-explanation'),
        repoDisplay: document.getElementById('repo-display')
    };

    // 状态变量
    let currentData = {
        requirements: "",
        dockerfile: ""
    };

    // --- 工具函数：写日志 ---
    function log(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-line ${type}`;
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        div.textContent = `[${time}] > ${msg}`;
        elements.terminal.appendChild(div);
        elements.terminal.scrollTop = elements.terminal.scrollHeight;
    }

    // --- 1. 扫描按钮逻辑 ---
    elements.btnScan.addEventListener('click', async () => {
        // UI 状态更新
        elements.btnScan.disabled = true;
        elements.btnScan.querySelector('.btn-text').textContent = 'SCANNING...';
        
        log('Starting repository scan...');
        
        // 模拟扫描过程 (这里替换为你真实的 chrome.runtime.sendMessage 逻辑)
        setTimeout(() => {
            // 假设这是扫描到的结果
            const dummyReq = "flask>=2.3.2\nrequests>=2.28.0\nopenai>=0.27.0\ntomli>=2.0.1";
            const dummyDock = "FROM python:3.9-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD [\"python\", \"app.py\"]";
            
            // 1. 保存数据
            currentData.requirements = dummyReq;
            currentData.dockerfile = dummyDock;

            // 2. 填充代码预览区
            elements.codeReq.textContent = dummyReq;
            elements.codeDock.textContent = dummyDock;

            // 3. 关键：显示结果区域 (移除 hidden 类)
            elements.resultSection.classList.remove('hidden');
            
            // 4. 显示 AI 分析按钮 (移除 hidden 类)
            // 注意：如果你在 CSS 中给 .cyber-btn.hidden 写了 display:none，这里需要移除它
            // 如果你的 HTML 中 btn-ai 没有 hidden 类，这步可以省略，但为了保险：
            elements.btnAi.classList.remove('hidden'); 

            // 5. 更新日志和按钮状态
            log(`Found dependencies: flask, requests, openai`, 'success');
            log('Ready for AI Analysis.', 'info');
            
            elements.btnScan.disabled = false;
            elements.btnScan.querySelector('.btn-text').textContent = 'RE-SCAN';
            elements.btnScan.classList.add('secondary'); // 样式变为次要按钮
            
        }, 1500); // 模拟 1.5秒延迟
    });

    // --- 2. AI 分析按钮逻辑 ---
    elements.btnAi.addEventListener('click', async () => {
        elements.btnAi.disabled = true;
        elements.btnAi.querySelector('.btn-text').textContent = 'ANALYZING...';
        log('Sending data to LLM...', 'info');

        // 模拟 AI 请求
        setTimeout(() => {
            // 1. 显示 AI 结果框
            elements.aiInsightBox.classList.remove('hidden');
            
            // 2. 填充内容
            const aiText = "Analysis Complete:\n- Detected Flask web application.\n- Python 3.9 is a stable choice.\n- Recommendation: Pin exact versions in requirements.txt for better reproducibility.";
            elements.aiExplanation.innerText = aiText; // 使用 innerText 保持换行

            log('AI Analysis complete.', 'success');
            
            elements.btnAi.disabled = false;
            elements.btnAi.querySelector('.btn-text').textContent = '✨ RE-ANALYZE';
        }, 2000);
    });

    // --- 3. 选项卡切换逻辑 (Req / Dockerfile) ---
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有激活状态
            elements.tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.code-content').forEach(c => c.classList.add('hidden'));

            // 激活当前点击的
            tab.classList.add('active');
            const targetId = tab.dataset.target; // 'req' 或 'dock'
            document.getElementById(`code-${targetId}`).classList.remove('hidden');
        });
    });

    // --- 4. 复制按钮逻辑 ---
    elements.btnCopy.addEventListener('click', () => {
        // 判断当前哪个 tab 是激活的
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const textToCopy = activeTab === 'req' ? currentData.requirements : currentData.dockerfile;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = elements.btnCopy.textContent;
            elements.btnCopy.textContent = 'OK!';
            setTimeout(() => elements.btnCopy.textContent = originalText, 1500);
            log('Content copied to clipboard.');
        });
    });

    // --- 5. 下载按钮逻辑 ---
    elements.btnDownload.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.target;
        const content = activeTab === 'req' ? currentData.requirements : currentData.dockerfile;
        const filename = activeTab === 'req' ? 'requirements.txt' : 'Dockerfile';
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        log(`Downloaded ${filename}.`);
    });
});