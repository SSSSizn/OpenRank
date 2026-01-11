// --- START OF FILE main.js ---

let files = []
let allRepos = []

// AI配置管理 (使用localStorage - 在实际环境中工作, 在Claude.ai artifacts中使用内存存储)
const AI_CONFIG_STORAGE = {
    // 检测是否支持localStorage
    isSupported: () => {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    // 内存存储备用方案
    memoryStorage: {},

    getItem: function (key) {
        if (this.isSupported()) {
            return localStorage.getItem(key);
        }
        return this.memoryStorage[key] || null;
    },

    setItem: function (key, value) {
        if (this.isSupported()) {
            localStorage.setItem(key, value);
        } else {
            this.memoryStorage[key] = value;
        }
    },

    removeItem: function (key) {
        if (this.isSupported()) {
            localStorage.removeItem(key);
        } else {
            delete this.memoryStorage[key];
        }
    }
};

// 获取AI配置
function getAIConfig() {
    const apiKey = AI_CONFIG_STORAGE.getItem('ai_api_key');
    const baseUrl = AI_CONFIG_STORAGE.getItem('ai_base_url');
    const model = AI_CONFIG_STORAGE.getItem('ai_model');

    return {
        apiKey: apiKey || '',
        baseUrl: baseUrl || '',
        model: model || '',
        isConfigured: !!(apiKey && baseUrl && model)
    };
}

// 保存AI配置
function saveAIConfig(apiKey, baseUrl, model) {
    AI_CONFIG_STORAGE.setItem('ai_api_key', apiKey);
    AI_CONFIG_STORAGE.setItem('ai_base_url', baseUrl);
    AI_CONFIG_STORAGE.setItem('ai_model', model);
}

// 清除AI配置
function clearAIConfig() {
    AI_CONFIG_STORAGE.removeItem('ai_api_key');
    AI_CONFIG_STORAGE.removeItem('ai_base_url');
    AI_CONFIG_STORAGE.removeItem('ai_model');
}

// 更新配置状态显示
function updateConfigStatus() {
    const config = getAIConfig();
    const statusBadge = document.getElementById('configStatus');

    if (config.isConfigured) {
        statusBadge.textContent = 'CONFIGURED';
        statusBadge.className = 'badge bg-success';
    } else {
        statusBadge.textContent = 'NOT CONFIGURED';
        statusBadge.className = 'badge bg-secondary';
    }
}

// 初始化设置模态框
function initSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
    const settingsForm = document.getElementById('settingsForm');
    const clearConfigBtn = document.getElementById('clearConfigBtn');

    // 加载当前配置
    const config = getAIConfig();
    document.getElementById('apiKeyInput').value = config.apiKey;
    document.getElementById('baseUrlInput').value = config.baseUrl || 'https://api.siliconflow.cn/v1';
    document.getElementById('modelInput').value = config.model || 'deepseek-ai/DeepSeek-V3.2-Exp';

    updateConfigStatus();

    // 打开设置
    settingsBtn.addEventListener('click', () => {
        settingsModal.show();
    });

    // 保存配置
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const baseUrl = document.getElementById('baseUrlInput').value.trim();
        const model = document.getElementById('modelInput').value.trim();

        if (!apiKey || !baseUrl || !model) {
            alert('Please fill in all fields');
            return;
        }

        saveAIConfig(apiKey, baseUrl, model);
        updateConfigStatus();

        // 显示成功提示
        const statusBadge = document.getElementById('configStatus');
        statusBadge.textContent = 'SAVED!';
        statusBadge.className = 'badge bg-success';

        setTimeout(() => {
            settingsModal.hide();
        }, 800);
    });

    // 清除配置
    clearConfigBtn.addEventListener('click', () => {
        if (confirm('Clear all AI configuration?')) {
            clearAIConfig();
            document.getElementById('apiKeyInput').value = '';
            document.getElementById('baseUrlInput').value = 'https://api.siliconflow.cn/v1';
            document.getElementById('modelInput').value = 'deepseek-ai/DeepSeek-V3.2-Exp';
            updateConfigStatus();
        }
    });
}

// Chart.js 全局 Dark Mode 配置
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.font.family = "'JetBrains Mono', 'Inter', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
Chart.defaults.plugins.tooltip.borderColor = '#38bdf8';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

// 初始化函数
async function init() {
    try {
        const r = await axios.get('/api/files')
        files = r.data

        const repoResp = await axios.get('/api/repos-list')
        allRepos = repoResp.data

        const container = document.getElementById('fileSummaries')
        container.innerHTML = ''

        // 预加载所有数据
        const summaryDataMap = {};
        await Promise.all(files.map(async (f) => {
            try {
                const res = await axios.get('/api/summary', { params: { name: f } });
                summaryDataMap[f] = res.data;
            } catch (e) {
                console.warn(`Failed to load ${f}`, e);
            }
        }));

        // 提取 "Top 5 Files" 数据
        let top5DepFiles = null;
        const overviewFile = files.find(f => f.includes('dependency_overview'));
        if (overviewFile && summaryDataMap[overviewFile]) {
            top5DepFiles = summaryDataMap[overviewFile].dependency_files;
        }

        // 渲染循环
        for (const f of files) {
            if (!summaryDataMap[f]) continue;

            const sData = summaryDataMap[f];
            let extraData = null;
            if (sData.type === 'dependency_staleness') {
                extraData = top5DepFiles;
            }

            renderFileSummary(container, f, sData, extraData);
        }

        // 渲染搜索卡片
        renderSearchCard(container);

        // 启动动态浮动动画
        applyRandomAnimationDelays();

        // 初始化设置模态框
        initSettingsModal();

    } catch (e) {
        console.error('Init failed', e)
    }
}

// 给所有 .floating-module 设置随机延迟
function applyRandomAnimationDelays() {
    const cols = document.querySelectorAll('.floating-module');
    cols.forEach(col => {
        const delay = Math.random() * 5;
        const duration = 5 + Math.random() * 3;
        col.style.animationDelay = `-${delay}s`;
        col.style.animationDuration = `${duration}s`;
    });
}


// --- 渲染搜索控制卡片 ---
function renderSearchCard(container) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 col-xl-4 floating-module';

    const card = document.createElement('div');
    card.className = 'card search-card h-100';

    const body = document.createElement('div');
    body.className = 'card-body d-flex flex-column justify-content-center';

    body.innerHTML = `
        <div class="card-title text-center text-info fw-bold mb-4" style="justify-content: center; border-bottom: none; margin-top: auto;">
            <span><i class="bi bi-terminal-fill me-2"></i>TARGET SELECTION</span>
        </div>
        
        <div class="search-input-group w-100 position-relative">
            <input id="gridSearchInput" type="text" class="form-control" placeholder="INPUT REPO NAME..." autocomplete="off">
            <div id="reposList"></div>
        </div>
        
        <button id="gridSearchBtn" class="btn btn-glow-action w-100 py-3 mt-4">
            INITIALIZE ANALYSIS
        </button>
        
        <div class="search-hint mt-3 font-monospace text-center text-muted" style="font-size: 0.75rem; margin-bottom: auto;">
            > SYSTEM READY. WAITING FOR COMMAND.
        </div>
    `;

    card.appendChild(body);
    col.appendChild(card);
    container.appendChild(col);

    // --- Events ---
    const input = body.querySelector('#gridSearchInput');
    const btn = body.querySelector('#gridSearchBtn');
    const listDiv = body.querySelector('#reposList');
    const hint = body.querySelector('.search-hint');

    input.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (val.length < 1) {
            listDiv.style.display = 'none';
            return;
        }
        const matches = allRepos.filter(r => r.toLowerCase().includes(val)).slice(0, 8);
        listDiv.innerHTML = '';
        if (matches.length > 0) {
            listDiv.style.display = 'block';
            matches.forEach(repo => {
                const item = document.createElement('div');
                item.textContent = repo;
                item.onclick = () => {
                    input.value = repo;
                    listDiv.style.display = 'none';
                    triggerSearch(repo, hint);
                }
                listDiv.appendChild(item);
            })
        } else {
            listDiv.style.display = 'none';
        }
    });

    btn.addEventListener('click', () => {
        const q = input.value.trim();
        if (q) triggerSearch(q, hint);
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q) {
                listDiv.style.display = 'none';
                triggerSearch(q, hint);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !listDiv.contains(e.target)) {
            listDiv.style.display = 'none';
        }
    });
}

function triggerSearch(repoName, hintElement) {
    if (hintElement) {
        hintElement.innerHTML = `> EXECUTING QUERY: <span class="text-info">${repoName}</span><br>> PROCESSING...`;
        hintElement.classList.add('text-info');
    }

    renderRepoDetail(repoName).then(() => {
        applyRandomAnimationDelays();

        const detailSection = document.getElementById('repoDetailSectionTitle');
        if (detailSection) {
            detailSection.style.opacity = '1';
            detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (hintElement) {
            hintElement.innerHTML = `> RENDER COMPLETE.<br>> READY.`;
            hintElement.classList.remove('text-info');
        }
    });
}

function drawWordCloud(container, list, title) {
    if (!list || list.length === 0) return;

    const label = document.createElement('div')
    label.className = 'label-text mt-3'
    label.textContent = title
    container.appendChild(label)

    const wcId = uid('wc')
    const wcDiv = document.createElement('div')
    wcDiv.id = wcId
    wcDiv.className = 'wordcloud-container'
    container.appendChild(wcDiv)

    setTimeout(() => {
        const el = document.getElementById(wcId)
        if (el) {
            try {
                WordCloud(el, {
                    list: list,
                    gridSize: 8,
                    weightFactor: function (size) { return Math.pow(size, 1.1) * 0.9; },
                    fontFamily: 'JetBrains Mono, sans-serif',
                    color: 'random-light',
                    rotateRatio: 0.2,
                    backgroundColor: 'transparent',
                    shrinkToFit: true,
                    drawOutOfBound: false
                })
            } catch (wcError) { console.warn('WordCloud lib error:', wcError) }
        }
    }, 300)
}

function renderFileSummary(container, filename, summary, extraData = null) {
    const col = document.createElement('div')
    col.className = 'col-md-6 col-lg-4 col-xl-4 floating-module'

    const card = document.createElement('div')
    card.className = 'card h-100'

    const body = document.createElement('div')
    body.className = 'card-body'

    const title = document.createElement('div')
    title.className = 'card-title'
    title.innerHTML = `
      <span>${filename.replace('.json', '').replace('sampled_', '').toUpperCase()}</span>
      <span class="badge bg-secondary bg-opacity-25 text-light font-monospace" style="font-size:0.7em">${summary.total} ITEMS</span>
  `
    body.appendChild(title)

    const neonBlue = '#38bdf8';
    const neonPurple = '#a855f7';
    const neonGreen = '#4ade80';
    const neonOrange = '#fb923c';
    const neonRed = '#f87171';
    const lightGrey = 'rgba(255,255,255,0.1)';

    const contentDiv = document.createElement('div');
    contentDiv.style.width = '100%';
    body.appendChild(contentDiv);

    if (summary.type === 'dependency_overview') {
        if (summary.has_dependency_file) {
            createChart(contentDiv, 'doughnut', 'DEPENDENCY FILE STATUS', ['YES', 'NO'],
                [summary.has_dependency_file['True'] || 0, summary.has_dependency_file['False'] || 0],
                [neonBlue, lightGrey])
        }
        drawWordCloud(body, summary.tokens_top, 'KEYWORDS CLOUD')
    }

    else if (summary.type === 'dependency_staleness') {
        if (extraData) {
            const entries = Object.entries(extraData).sort((a, b) => b[1] - a[1]).slice(0, 5)
            if (entries.length > 0) {
                createChart(contentDiv, 'bar', 'TOP 5 DEP FILES', entries.map(e => e[0]), entries.map(e => e[1]), neonPurple, 'y')
            }
        }

        createChart(contentDiv, 'bar', 'STALENESS DAYS (AVG)',
            ['VS REPO', 'VS NOW'],
            [summary.days_behind_repo_mean, summary.days_behind_now_mean],
            [neonOrange, neonRed])
    }

    else if (summary.type === 'import_vs_requirements') {
        createChart(contentDiv, 'radar', 'COVERAGE RATIO',
            ['MISSING', 'REDUNDANT'],
            [summary.missing_ratio_mean, summary.redundant_ratio_mean],
            'rgba(56, 189, 248, 0.5)')
        drawWordCloud(body, summary.tokens_top, 'TOP IMPORTS')
    }

    else if (summary.type === 'issue_env_stats') {
        createChart(contentDiv, 'bar', 'ENV ISSUE RATIO', ['RATIO'], [summary.env_issue_ratio_mean], neonRed)
        drawWordCloud(body, summary.tokens_top, 'ISSUE KEYWORDS')
    }

    else if (summary.type === 'onboarding_stats') {
        createChart(contentDiv, 'bar', 'ONBOARDING FRICTION',
            ['DOCS', 'ISSUES', 'PR FAIL'],
            [summary.contributing_env_ratio_mean, summary.newcomer_issues_env_ratio_mean, summary.newcomer_prs_env_fail_ratio_mean],
            [neonGreen, neonOrange, neonRed])
        drawWordCloud(body, summary.tokens_top, 'NEWCOMER TOPICS')
    }

    card.appendChild(body)
    col.appendChild(card)
    container.appendChild(col)
}

function createChart(container, type, label, labels, data, color, indexAxis = 'x') {
    const canvas = document.createElement('canvas')
    canvas.style.maxHeight = '180px'
    canvas.style.width = '100%'

    const wrapper = document.createElement('div')
    wrapper.style.marginBottom = '1.5rem'

    const title = document.createElement('div')
    title.className = 'label-text'
    title.textContent = label

    wrapper.appendChild(title)
    wrapper.appendChild(canvas)
    container.appendChild(wrapper)

    let bgColors = color;
    let borderColors = color;

    if (type === 'radar') {
        if (typeof color === 'string') {
            bgColors = color;
            borderColors = color.replace('0.5', '1');
        } else {
            bgColors = color.map(c => c.replace('1)', '0.5)'));
            borderColors = color;
        }
    } else if (type === 'bar' || type === 'doughnut' || type === 'pie') {
        if (!Array.isArray(color)) {
            bgColors = [color];
            borderColors = [color];
        } else {
            bgColors = color;
            borderColors = color;
        }
    }

    const config = {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.6,
                fill: type === 'radar'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: indexAxis,
            plugins: {
                legend: {
                    display: type === 'pie' || type === 'doughnut',
                    position: 'right',
                    labels: { boxWidth: 10, padding: 10, color: '#94a3b8' }
                }
            },
            scales: (type === 'pie' || type === 'doughnut' || type === 'radar') ? {
                r: {
                    angleLines: { color: '#334155' },
                    grid: { color: '#334155' },
                    pointLabels: { color: '#cbd5e1' },
                    ticks: { display: false }
                }
            } : {
                x: { grid: { display: false } },
                y: { grid: { color: '#334155', borderDash: [5, 5] } }
            },
            elements: { line: { tension: 0.4 } }
        }
    }
    new Chart(canvas.getContext('2d'), config)
}

function clientSideTokenizeAndCount(items) {
    const counter = {}
    if (!items || !Array.isArray(items)) return [];
    items.forEach(text => {
        if (!text) return;
        const parts = String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/)
        parts.forEach(p => {
            if (p.length > 2) counter[p] = (counter[p] || 0) + 1
        })
    })
    let sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 50)
    if (sorted.length > 0) {
        const max = sorted[0][1]
        const min = sorted[sorted.length - 1][1]
        sorted = sorted.map(item => {
            const val = item[1]
            let weight = 20
            if (max !== min) weight = 10 + ((val - min) / (max - min)) * 50
            return [item[0], weight]
        })
    }
    return sorted
}

function createDashboardCard(titleText, colClass = 'col-md-6') {
    const col = document.createElement('div');
    col.className = colClass + ' floating-module';

    const card = document.createElement('div');
    card.className = 'card h-100';

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.innerHTML = `<span>${titleText}</span>`;
    body.appendChild(title);

    const contentBody = document.createElement('div');
    body.appendChild(contentBody);
    card.appendChild(body);

    col.appendChild(card);
    return { colElement: col, contentBody: contentBody };
}

async function renderRepoDetail(fullName) {
    try {
        window.currentRepoFullName = fullName
        const badge = document.getElementById('currentRepoBadge')
        badge.classList.remove('d-none', 'bg-dark', 'text-secondary', 'bg-danger')
        badge.classList.add('bg-info', 'text-dark', 'shadow-sm')
        badge.textContent = fullName.toUpperCase()

        const r = await axios.get('/api/repo', { params: { full_name: fullName } })
        const d = r.data
        const container = document.getElementById('repoDetail')
        container.innerHTML = ''

        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const viz = d.visualizations || {}
        const neonBlue = '#38bdf8';
        const neonPurple = '#a855f7';
        const neonGreen = '#4ade80';
        const neonOrange = '#fb923c';
        const neonRed = '#f87171';
        const lightGrey = 'rgba(255,255,255,0.1)';

        const leftPanelCol = document.createElement('div');
        leftPanelCol.className = 'col-lg-8';
        const leftPanelRow = document.createElement('div');
        leftPanelRow.className = 'row g-4';
        leftPanelCol.appendChild(leftPanelRow);
        container.appendChild(leftPanelCol);

        const rightPanelCol = document.createElement('div');
        rightPanelCol.className = 'col-lg-4';
        const rightPanelRow = document.createElement('div');
        rightPanelRow.className = 'row g-4';
        rightPanelCol.appendChild(rightPanelRow);
        container.appendChild(rightPanelCol);

        if (viz.dependency_overview) {
            const dep = viz.dependency_overview
            const { colElement, contentBody } = createDashboardCard('Dependency Overview', 'col-md-6');
            leftPanelRow.appendChild(colElement);
            createChart(contentBody, 'doughnut', 'HAS DEPENDENCY FILE', ['YES', 'NO'],
                [dep.has_dependency_file ? 1 : 0, dep.has_dependency_file ? 0 : 1], [neonBlue, lightGrey])
            const info = document.createElement('div')
            info.className = 'mt-3 p-2 border border-secondary rounded bg-dark font-monospace text-muted'
            info.style.fontSize = '0.8rem'
            info.innerHTML = `
            <div class="d-flex justify-content-between"><span>README ENV RATIO:</span> <span class="text-white">${(dep.readme_env_ratio || 0).toFixed(4)}</span></div>
            <div class="d-flex justify-content-between"><span>TOTAL LINES:</span> <span class="text-white">${dep.readme_total_lines || 0}</span></div>
            <div class="d-flex justify-content-between"><span>ENV LINES:</span> <span class="text-white">${dep.readme_env_lines || 0}</span></div>
        `
            contentBody.appendChild(info)
        }

        if (viz.import_vs_requirements) {
            const imp = viz.import_vs_requirements
            const { colElement, contentBody } = createDashboardCard('Import Health', 'col-md-6');
            leftPanelRow.appendChild(colElement);
            createChart(contentBody, 'radar', 'COVERAGE RATIO', ['MISSING', 'REDUNDANT'],
                [imp.missing_ratio || 0, imp.redundant_ratio || 0], 'rgba(168, 85, 247, 0.6)')
        }

        if ((viz.dependency_overview && viz.dependency_overview.dependency_files) ||
            (viz.import_vs_requirements && viz.import_vs_requirements.imports)) {
            const { colElement, contentBody } = createDashboardCard('Keywords & Modules', 'col-12');
            leftPanelRow.appendChild(colElement);
            if (viz.dependency_overview && viz.dependency_overview.dependency_files) {
                const tokens = clientSideTokenizeAndCount(viz.dependency_overview.dependency_files);
                drawWordCloud(contentBody, tokens, 'DEPENDENCY FILES');
            }
            if (viz.import_vs_requirements && viz.import_vs_requirements.imports) {
                const tokens = clientSideTokenizeAndCount(viz.import_vs_requirements.imports);
                drawWordCloud(contentBody, tokens, 'IMPORT MODULES');
            }
        }

        if (viz.dependency_staleness) {
            const stal = viz.dependency_staleness
            const { colElement, contentBody } = createDashboardCard('Dependency Staleness', 'col-12');
            rightPanelRow.appendChild(colElement);
            createChart(contentBody, 'bar', 'LAGGING DAYS', ['VS REPO', 'VS NOW'],
                [stal.days_behind_repo || 0, stal.days_behind_now || 0], [neonOrange, neonRed])
        }

        if (viz.issue_env_stats || viz.onboarding_stats) {
            const { colElement, contentBody } = createDashboardCard('Friction & Onboarding', 'col-12');
            rightPanelRow.appendChild(colElement);

            if (viz.onboarding_stats) {
                const onb = viz.onboarding_stats
                createChart(contentBody, 'bar', 'ONBOARDING FRICTION',
                    ['DOCS', 'NEW ISSUE', 'PR FAIL'],
                    [onb.contributing?.env_ratio || 0, onb.newcomer_issues?.env_ratio || 0, onb.newcomer_prs?.env_fail_ratio || 0],
                    [neonGreen, neonOrange, neonRed]
                )
            }
            if (viz.issue_env_stats) {
                const iss = viz.issue_env_stats
                if (iss.keyword_hits) {
                    let kwList = Object.entries(iss.keyword_hits).sort((a, b) => b[1] - a[1]).slice(0, 40)
                    if (kwList.length > 0) {
                        const max = kwList[0][1]
                        kwList = kwList.map(k => [k[0], 10 + k[1] / max * 50])
                        drawWordCloud(contentBody, kwList, 'ISSUE KEYWORDS')
                    }
                }
            }
        }

        const { colElement: aiColElement, contentBody: aiCardContentBody } = createDashboardCard('AI Analysis', 'col-12');
        container.appendChild(aiColElement);

        const aiCard = aiColElement.querySelector('.card');
        aiCard.id = 'repoAiBox';
        aiCard.querySelector('.card-title').style.display = 'none';

        aiCardContentBody.parentElement.innerHTML = `
        <div class="ai-terminal-header">
            <span>> SYSTEM AI LOG</span>
            <button id="triggerAiBtn" class="btn btn-sm btn-outline-success font-monospace">RUN_AI_MODEL()</button>
        </div>
        <div class="ai-output-area pt-2">
            <div class="text-muted">> Awaiting command for intelligent analysis...</div>
        </div>
    `;

        document.getElementById('triggerAiBtn').onclick = async function () {
    const btn = this;
    const outputArea = aiColElement.querySelector('.ai-output-area');

    // === 从本地配置中读取 AI 参数 ===
    const aiConfig = getAIConfig();
    if (!aiConfig.isConfigured) {
        outputArea.innerHTML = `
            <div class="text-danger">
                > ERROR: AI NOT CONFIGURED.<br>
                > PLEASE SET API KEY / BASE URL / MODEL IN SETTINGS.
            </div>
        `;
        return;
    }

    // 防止重复点击（真正运行中）
    if (btn.dataset.running === 'true') {
        return;
    }

    btn.dataset.running = 'true';
    btn.disabled = true;
    btn.textContent = 'PROCESSING...';

    outputArea.innerHTML = `
        <div class="mt-2 text-warning">
            > CONNECTING TO MODEL...
        </div>
    `;

    // === 构造 summary ===
    const summary_lines = [];

    if (viz?.dependency_overview) {
        summary_lines.push(
            `README Env Ratio: ${(viz.dependency_overview.readme_env_ratio || 0).toFixed(4)}`
        );
    }

    try {
        const resp = await axios.post('/api/repo-ai', {
            full_name: fullName,
            summary: summary_lines,

            // 前端传入的 AI 配置
            api_key: aiConfig.apiKey,
            base_url: aiConfig.baseUrl,
            model: aiConfig.model
        });

        const analysisText = (resp.data.analysis || '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

        outputArea.innerHTML = `
            <div class="mb-2 text-success">
                > ANALYSIS COMPLETE:
            </div>
            <div style="color: #e2e8f0; line-height: 1.6;">
                ${analysisText}
            </div>
        `;

        // === RE-RUN 已真正生效 ===
        btn.textContent = 'RE-RUN';
        btn.disabled = false;

    } catch (err) {
        outputArea.innerHTML = `
            <div class="text-danger mt-2">
                > ERROR: AI ANALYSIS FAILED.<br>
                > ${err.response?.data?.detail || err.message}
            </div>
        `;

        btn.textContent = 'RETRY';
        btn.disabled = false;
    } finally {
        // 释放运行状态（允许再次点击）
        btn.dataset.running = 'false';
    }
};


    } catch (e) {
        console.error('Render Detail Error:', e)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    init()
})