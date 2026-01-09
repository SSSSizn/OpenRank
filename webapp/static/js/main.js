// --- START OF FILE main.js ---

let files = []

// Chart.js 全局 Dark Mode 配置
Chart.defaults.color = '#94a3b8'; // 文字颜色
Chart.defaults.borderColor = '#334155'; // 网格线颜色
Chart.defaults.font.family = "'JetBrains Mono', 'Inter', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
Chart.defaults.plugins.tooltip.borderColor = '#38bdf8';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';

// 生成唯一ID
function uid(prefix){
    return prefix + '_' + Math.random().toString(36).slice(2,9)
}

// 初始化函数
async function init(){
  try {
    const r = await axios.get('/api/files')
    files = r.data

    const container = document.getElementById('fileSummaries')
    container.innerHTML = '' // 清空容器

    // 串行加载每个文件的摘要
    for(const f of files){
      try{
        console.log(`Loading summary for ${f}...`)
        const s = await axios.get('/api/summary', { params:{ name: f } })
        renderFileSummary(f, s.data)
      }catch(e){
        console.warn(`Error loading summary for ${f}`, e)
        const errDiv = document.createElement('div')
        errDiv.className = 'col-12 text-danger font-monospace'
        errDiv.textContent = `[ERROR] 加载 ${f} 失败`
        container.appendChild(errDiv)
      }
    }
  } catch(e) {
    console.error('Init failed', e)
  }
}

// --- 通用组件渲染函数 ---

/**
 * 绘制词云 (Dark Theme Optimized)
 */
function drawWordCloud(container, list, title) {
    if(!list || list.length === 0) return;

    // 1. 创建标题
    const label = document.createElement('div')
    label.className = 'label-text mt-3' // 增加顶部外边距
    label.textContent = title
    container.appendChild(label)

    // 2. 创建词云容器
    const wcId = uid('wc')
    const wcDiv = document.createElement('div')
    wcDiv.id = wcId
    wcDiv.className = 'wordcloud-container'
    container.appendChild(wcDiv)

    // 3. 延时绘制
    setTimeout(() => {
        const el = document.getElementById(wcId)
        if(el) {
            try {
                WordCloud(el, {
                    list: list,
                    gridSize: 10,
                    weightFactor: function (size) {
                        return Math.pow(size, 1.1) * 0.8;
                    },
                    fontFamily: 'JetBrains Mono, sans-serif',
                    color: 'random-light', // 改为浅色随机，适配深色背景
                    rotateRatio: 0.1,   // 保持轻微旋转
                    backgroundColor: 'transparent', // 透明背景
                    shrinkToFit: true,
                    drawOutOfBound: false,
                    minRotation: -Math.PI / 8, // 最小旋转角度
                    maxRotation: Math.PI / 8,  // 最大旋转角度
                })
            } catch(wcError) {
                console.warn('WordCloud lib error:', wcError)
            }
        }
    }, 300)
}

// --- 渲染文件总览 (Summary) ---

function renderFileSummary(filename, summary){
  const container = document.getElementById('fileSummaries')
  const col = document.createElement('div')
  // 调整列宽：在 extra-large 屏幕上显示 3 列，以实现 3+2 的布局
  col.className = 'col-md-6 col-lg-4 col-xl-4'

  const card = document.createElement('div')
  card.className = 'card h-100'

  const body = document.createElement('div')
  body.className = 'card-body'

  // 标题区域
  const headerDiv = document.createElement('div')
  headerDiv.className = 'd-flex justify-content-between align-items-start mb-3 border-bottom border-secondary pb-2'

  const titleGroup = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'card-title m-0 text-info fw-bold'
  title.textContent = filename.replace('.json', '').replace('sampled_', '').toUpperCase()

  const subTitle = document.createElement('small')
  subTitle.className = 'text-muted font-monospace'
  subTitle.style.fontSize = '0.75rem'
  subTitle.textContent = `REPOS: ${summary.total}`

  titleGroup.appendChild(title)
  titleGroup.appendChild(subTitle)
  headerDiv.appendChild(titleGroup)

  body.appendChild(headerDiv)

  // Neon 配色板
  const neonBlue = '#38bdf8';
  const neonPurple = '#a855f7';
  const neonGreen = '#4ade80';
  const neonOrange = '#fb923c';
  const neonRed = '#f87171';
  const lightGrey = 'rgba(255,255,255,0.15)'; // 用于背景或次要部分

  // 根据不同类型渲染不同图表
  if(summary.type === 'dependency_overview'){
    if(summary.has_dependency_file){
      createChart(body, 'doughnut', 'DEPENDENCY FILE STATUS', ['YES', 'NO'],
        [summary.has_dependency_file['True']||0, summary.has_dependency_file['False']||0],
        [neonBlue, lightGrey])
    }
    if(summary.dependency_files){
      const entries = Object.entries(summary.dependency_files).sort((a,b)=>b[1]-a[1]).slice(0, 5)
      if(entries.length > 0){
        createChart(body, 'bar', 'TOP 5 DEP FILES', entries.map(e=>e[0]), entries.map(e=>e[1]), neonPurple, 'y')
      }
    }
    drawWordCloud(body, summary.tokens_top, 'KEYWORDS CLOUD')
  }

  else if(summary.type === 'dependency_staleness'){
    createChart(body, 'bar', 'STALENESS DAYS (AVG)',
      ['VS REPO', 'VS NOW'],
      [summary.days_behind_repo_mean, summary.days_behind_now_mean],
      [neonOrange, neonRed])
  }

  else if(summary.type === 'import_vs_requirements'){
    createChart(body, 'radar', 'COVERAGE RATIO',
      ['MISSING', 'REDUNDANT'],
      [summary.missing_ratio_mean, summary.redundant_ratio_mean],
      'rgba(56, 189, 248, 0.5)')

    drawWordCloud(body, summary.tokens_top, 'TOP IMPORTS')
  }

  else if(summary.type === 'issue_env_stats'){
    createChart(body, 'bar', 'ENV ISSUE RATIO', ['RATIO'], [summary.env_issue_ratio_mean], neonRed)
    drawWordCloud(body, summary.tokens_top, 'ISSUE KEYWORDS')
  }

  else if(summary.type === 'onboarding_stats'){
    createChart(body, 'bar', 'ONBOARDING FRICTION',
      ['DOCS', 'ISSUES', 'PR FAIL'],
      [summary.contributing_env_ratio_mean, summary.newcomer_issues_env_ratio_mean, summary.newcomer_prs_env_fail_ratio_mean],
      [neonGreen, neonOrange, neonRed])

    drawWordCloud(body, summary.tokens_top, 'NEWCOMER TOPICS')
  }

  card.appendChild(body)
  col.appendChild(card)
  container.appendChild(col)
}

// 辅助：创建图表
function createChart(container, type, label, labels, data, color, indexAxis='x'){
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

  if (type === 'radar') { // Radar charts usually look better with a filled area
    if (typeof color === 'string') {
      bgColors = color; // Already rgba
      borderColors = color.replace('0.5', '1'); // Make border more solid
    } else { // Array of colors for radar is rare
      bgColors = color.map(c => c.replace('1)', '0.5)'));
      borderColors = color;
    }
  } else if (type === 'bar' || type === 'doughnut' || type === 'pie') {
    if (!Array.isArray(color)) { // Single color for bar, doughnut
      bgColors = [color];
      borderColors = [color];
    } else { // Multiple colors
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
        fill: type === 'radar' // Fill area for radar chart
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
              labels: { boxWidth: 10, padding: 10 }
          }
      },
      scales: (type === 'pie' || type === 'doughnut' || type === 'radar') ? {
          r: { // Radar specific scale options
            angleLines: { color: '#334155' },
            grid: { color: '#334155' },
            pointLabels: { color: '#cbd5e1' },
            ticks: { color: '#64748b', backdropColor: 'rgba(15, 23, 42, 0.8)' }
          }
      } : {
          x: { grid: { display: false } },
          y: { grid: { color: '#334155', borderDash: [5, 5] } }
      },
      elements: {
          line: { tension: 0.4 }
      }
    }
  }
  new Chart(canvas.getContext('2d'), config)
}

// --- 渲染单个仓库详情 (Detail) ---

function clientSideTokenizeAndCount(items) {
    const counter = {}
    if(!items || !Array.isArray(items)) return [];
    items.forEach(text => {
        if(!text) return;
        const parts = String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/)
        parts.forEach(p => {
            if(p.length > 2) counter[p] = (counter[p] || 0) + 1
        })
    })
    let sorted = Object.entries(counter).sort((a,b) => b[1] - a[1]).slice(0, 50)
    if(sorted.length > 0) {
        const max = sorted[0][1]
        const min = sorted[sorted.length-1][1]
        sorted = sorted.map(item => {
            const val = item[1]
            let weight = 20
            if(max !== min) weight = 10 + ((val - min) / (max - min)) * 50
            return [item[0], weight]
        })
    }
    return sorted
}

// Helper to create a Bootstrap card wrapped in a column
function createDashboardCard(titleText, colClass = 'col-md-6') {
    const col = document.createElement('div');
    col.className = colClass;

    const card = document.createElement('div');
    card.className = 'card h-100 p-3'; // Card styling from CSS

    const h6 = document.createElement('h6');
    h6.className = 'card-title';
    h6.textContent = titleText;
    card.appendChild(h6);

    // This div will contain all the charts/wordclouds
    const contentBody = document.createElement('div');
    card.appendChild(contentBody);

    col.appendChild(card);
    return { colElement: col, contentBody: contentBody }; // Return the column and its content div
}


async function renderRepoDetail(fullName){
  try {
    window.currentRepoFullName = fullName

    // Update UI state for current repo badge
    const badge = document.getElementById('currentRepoBadge')
    badge.classList.remove('d-none', 'bg-dark', 'text-secondary')
    badge.classList.add('bg-info', 'text-dark', 'shadow-sm')
    badge.textContent = fullName.toUpperCase()

    const r = await axios.get('/api/repo', { params:{ full_name: fullName } })
    const d = r.data
    const container = document.getElementById('repoDetail')
    container.innerHTML = '' // Clear existing content
    // repoDetail itself is already a row (see index.html)

    // Remove empty state if it exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const viz = d.visualizations || {}

    const neonBlue = '#38bdf8';
    const neonPurple = '#a855f7';
    const neonGreen = '#4ade80';
    const neonOrange = '#fb923c';
    const neonRed = '#f87171';
    const lightGrey = 'rgba(255,255,255,0.15)';


    // --- Left Main Panel (col-lg-8) ---
    const leftPanelCol = document.createElement('div');
    leftPanelCol.className = 'col-lg-8';
    const leftPanelRow = document.createElement('div');
    leftPanelRow.className = 'row g-4'; // Nested row for cards inside left panel
    leftPanelCol.appendChild(leftPanelRow);
    container.appendChild(leftPanelCol);

    // --- Right Side Panel (col-lg-4) ---
    const rightPanelCol = document.createElement('div');
    rightPanelCol.className = 'col-lg-4';
    const rightPanelRow = document.createElement('div');
    rightPanelRow.className = 'row g-4'; // Nested row for cards inside right panel
    rightPanelCol.appendChild(rightPanelRow);
    container.appendChild(rightPanelCol);

    // --- Individual Visualizations ---

    // 1. Dependency Overview (into leftPanelRow)
    if(viz.dependency_overview){
        const dep = viz.dependency_overview
        const { colElement, contentBody } = createDashboardCard('Dependency Overview', 'col-md-6');
        leftPanelRow.appendChild(colElement);

        createChart(contentBody, 'doughnut', 'HAS DEPENDENCY FILE', ['YES', 'NO'],
            [dep.has_dependency_file?1:0, dep.has_dependency_file?0:1], [neonBlue, lightGrey])

        const info = document.createElement('div')
        info.className = 'mt-3 p-2 border border-secondary rounded bg-dark font-monospace text-muted'
        info.style.fontSize = '0.8rem'
        info.innerHTML = `
            <div class="d-flex justify-content-between"><span>README ENV RATIO:</span> <span class="text-white">${(dep.readme_env_ratio||0).toFixed(4)}</span></div>
            <div class="d-flex justify-content-between"><span>TOTAL LINES:</span> <span class="text-white">${dep.readme_total_lines||0}</span></div>
            <div class="d-flex justify-content-between"><span>ENV LINES:</span> <span class="text-white">${dep.readme_env_lines||0}</span></div>
        `
        contentBody.appendChild(info)
    }

    // 2. Import vs Requirements (into leftPanelRow)
    if(viz.import_vs_requirements){
        const imp = viz.import_vs_requirements
        const { colElement, contentBody } = createDashboardCard('Import Health', 'col-md-6');
        leftPanelRow.appendChild(colElement);

        createChart(contentBody, 'radar', 'COVERAGE RATIO', ['MISSING', 'REDUNDANT'],
            [imp.missing_ratio||0, imp.redundant_ratio||0], 'rgba(168, 85, 247, 0.6)') // Neon Purple for Radar
    }

    // 3. Dependency Word Clouds (Combined into a separate card in leftPanelRow)
    if( (viz.dependency_overview && viz.dependency_overview.dependency_files) ||
        (viz.import_vs_requirements && viz.import_vs_requirements.imports) ) {
        const { colElement, contentBody } = createDashboardCard('Keywords & Modules', 'col-12'); // Full width for word clouds
        leftPanelRow.appendChild(colElement);

        if(viz.dependency_overview && viz.dependency_overview.dependency_files){
            const tokens = clientSideTokenizeAndCount(viz.dependency_overview.dependency_files);
            drawWordCloud(contentBody, tokens, 'DEPENDENCY FILES');
        }
        if(viz.import_vs_requirements && viz.import_vs_requirements.imports){
            const tokens = clientSideTokenizeAndCount(viz.import_vs_requirements.imports);
            drawWordCloud(contentBody, tokens, 'IMPORT MODULES');
        }
    }


    // 4. Staleness (into rightPanelRow)
    if(viz.dependency_staleness){
        const stal = viz.dependency_staleness
        const { colElement, contentBody } = createDashboardCard('Dependency Staleness', 'col-12');
        rightPanelRow.appendChild(colElement);

        createChart(contentBody, 'bar', 'LAGGING DAYS', ['VS REPO', 'VS NOW'],
            [stal.days_behind_repo||0, stal.days_behind_now||0], [neonOrange, neonRed])
    }

    // 5. Issue Env Stats & Onboarding (Combined into one card in rightPanelRow)
    if(viz.issue_env_stats || viz.onboarding_stats){
        const { colElement, contentBody } = createDashboardCard('Friction & Onboarding', 'col-12');
        rightPanelRow.appendChild(colElement);

        if(viz.onboarding_stats){
             const onb = viz.onboarding_stats
             createChart(contentBody, 'bar', 'ONBOARDING FRICTION',
                ['DOCS', 'NEW ISSUE', 'PR FAIL'],
                [onb.contributing?.env_ratio||0, onb.newcomer_issues?.env_ratio||0, onb.newcomer_prs?.env_fail_ratio||0],
                [neonGreen, neonOrange, neonRed]
             )
        }
        if(viz.issue_env_stats){
             const iss = viz.issue_env_stats
             if(iss.keyword_hits){
                 let kwList = Object.entries(iss.keyword_hits).sort((a,b)=>b[1]-a[1]).slice(0, 40)
                 if(kwList.length > 0) {
                     const max = kwList[0][1]
                     kwList = kwList.map(k => [k[0], 10 + k[1]/max*50])
                     drawWordCloud(contentBody, kwList, 'ISSUE KEYWORDS')
                 }
             }
        }
    }

    // --- AI Analysis Full Width at bottom (outside left/right panels) ---
    const { colElement: aiColElement, contentBody: aiCardContentBody } = createDashboardCard('AI Analysis', 'col-12');
    container.appendChild(aiColElement);

    // Override default card content for terminal-like display
    aiCardContentBody.parentElement.id = 'repoAiBox'; // Set ID on the card itself
    aiCardContentBody.parentElement.innerHTML = `
        <div class="ai-terminal-header">
            <span>> SYSTEM AI LOG</span>
            <button id="triggerAiBtn" class="btn btn-sm btn-outline-success font-monospace">RUN_AI_MODEL()</button>
        </div>
        <div class="ai-output-area pt-2">
            <div class="text-muted">> Awaiting command for intelligent analysis...</div>
        </div>
    `;

    // Bind AI Event
    document.getElementById('triggerAiBtn').onclick = async function() {
        const btn = this;
        const outputArea = aiColElement.querySelector('.ai-output-area');
        btn.disabled = true;
        btn.textContent = 'PROCESSING...';
        outputArea.innerHTML = `<div class="mt-2 text-warning">> CONNECTING TO DEEPSEEK-V3...</div>`;

        let summary_lines = []
        // Construct prompt summary for AI
        if (viz.dependency_overview) {
            summary_lines.push(`README Env Ratio: ${(viz.dependency_overview.readme_env_ratio||0).toFixed(4)}`)
            summary_lines.push(`Total lines in README: ${viz.dependency_overview.readme_total_lines||0}`)
            summary_lines.push(`Environment related lines in README: ${viz.dependency_overview.readme_env_lines||0}`)
        }
        // Add more relevant summary points if available and concise
        if (viz.dependency_staleness) {
            summary_lines.push(`Avg days behind repo: ${viz.dependency_staleness.days_behind_repo||0}`)
            summary_lines.push(`Avg days behind now: ${viz.dependency_staleness.days_behind_now||0}`)
        }
        if (viz.import_vs_requirements) {
            summary_lines.push(`Import missing ratio: ${viz.import_vs_requirements.missing_ratio||0}`)
            summary_lines.push(`Import redundant ratio: ${viz.import_vs_requirements.redundant_ratio||0}`)
        }
        if (viz.issue_env_stats) {
            summary_lines.push(`Environment issue ratio: ${viz.issue_env_stats.env_issue_ratio||0}`)
        }
        if (viz.onboarding_stats) {
            summary_lines.push(`Contributing env ratio: ${viz.onboarding_stats.contributing?.env_ratio || 0}`)
            summary_lines.push(`Newcomer issue env ratio: ${viz.onboarding_stats.newcomer_issues?.env_ratio || 0}`)
            summary_lines.push(`Newcomer PR env fail ratio: ${viz.onboarding_stats.newcomer_prs?.env_fail_ratio || 0}`)
        }


        try {
            const resp = await axios.post('/api/repo-ai', {
                full_name: fullName,
                summary: summary_lines
            })
            const analysisText = resp.data.analysis.replace(/\n/g, '<br>');
            outputArea.innerHTML = `
                <div class="mb-2 text-success">> ANALYSIS COMPLETE:</div>
                <div style="color: #e2e8f0; line-height: 1.6;">${analysisText}</div>
            `
        } catch (err) {
            outputArea.innerHTML += `<div class="text-danger mt-2">> ERROR: AI ANALYSIS FAILED. DETAIL: ${err.message}</div>`
            console.error("AI Analysis Failed:", err);
            btn.disabled = false;
            btn.textContent = 'RETRY';
        }
    }

  } catch(e) {
    console.error('Render Detail Error:', e)
    const container = document.getElementById('repoDetail');
    container.innerHTML = `<div class="col-12 text-danger text-center p-5 font-monospace">[FATAL ERROR] FAILED TO LOAD REPOSITORY DETAIL.<br>Please check console for details: ${e.message}</div>`;
    // Re-add empty state if detail fails, but with error
    const badge = document.getElementById('currentRepoBadge');
    badge.classList.remove('bg-info', 'text-dark');
    badge.classList.add('bg-danger', 'text-white');
    badge.textContent = `ERROR LOADING ${window.currentRepoFullName ? window.currentRepoFullName.toUpperCase() : 'REPO'}`;
  }
}

// --- 事件监听与搜索逻辑 ---

document.addEventListener('DOMContentLoaded', ()=>{
  init()

  // 搜索自动补全逻辑
  let allRepos = []
  axios.get('/api/repos-list').then(r => allRepos = r.data)

  const input = document.getElementById('searchInput')
  const listDiv = document.getElementById('reposList')
  const form = document.getElementById('searchForm')

  input.addEventListener('input', (e)=>{
      const val = e.target.value.trim().toLowerCase()
      if(val.length < 1){
          listDiv.style.display = 'none'
          return
      }
      const matches = allRepos.filter(r => r.toLowerCase().includes(val)).slice(0, 10) // Limit to 10 suggestions
      listDiv.innerHTML = ''
      if(matches.length > 0){
          listDiv.style.display = 'block'
          matches.forEach(repo => {
              const item = document.createElement('div')
              item.textContent = repo
              item.onclick = () => {
                  input.value = repo
                  listDiv.style.display = 'none'
                  renderRepoDetail(repo)
              }
              listDiv.appendChild(item)
          })
      } else {
          listDiv.style.display = 'none'
      }
  })

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
      if(!form.contains(e.target)){
          listDiv.style.display = 'none'
      }
  })

  document.getElementById('searchBtn').addEventListener('click', async ()=>{
    const q = input.value.trim()
    if(q) {
        renderRepoDetail(q)
    }
  })
})