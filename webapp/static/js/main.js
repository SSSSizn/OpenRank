// --- START OF FILE main.js ---

let files = []

// Chart.js 全局 Dark Mode 配置
Chart.defaults.color = '#94a3b8'; // 文字颜色
Chart.defaults.borderColor = '#334155'; // 网格线颜色
Chart.defaults.font.family = "'JetBrains Mono', 'Inter', sans-serif";

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
    label.className = 'label-text'
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
                        return Math.pow(size, 1.1) * 0.8; // 调整字体大小缩放
                    },
                    fontFamily: 'JetBrains Mono, sans-serif',
                    color: 'random-light', // 改为浅色随机，适配深色背景
                    rotateRatio: 0,   // 数据大屏通常喜欢水平排列，显得整洁，或设0.3
                    backgroundColor: 'transparent', // 透明背景
                    shrinkToFit: true,
                    drawOutOfBound: false
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
  col.className = 'col-md-6 col-lg-4 col-xl-3' // 响应式布局调整

  const card = document.createElement('div')
  card.className = 'card h-100' // 样式在 CSS 中定义

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

  // 根据不同类型渲染不同图表
  if(summary.type === 'dependency_overview'){
    if(summary.has_dependency_file){
      createChart(body, 'doughnut', 'DEPENDENCY FILE STATUS', ['YES', 'NO'],
        [summary.has_dependency_file['True']||0, summary.has_dependency_file['False']||0],
        [neonBlue, 'rgba(255,255,255,0.1)']) // 使用半透明灰作为“无”
    }
    if(summary.dependency_files){
      const entries = Object.entries(summary.dependency_files).sort((a,b)=>b[1]-a[1]).slice(0, 5) // Top 5 sufficient
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
      'rgba(56, 189, 248, 0.5)') // Radar needs transparency

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
  canvas.style.maxHeight = '180px' // Dashboard card chart height
  canvas.style.width = '100%'

  const wrapper = document.createElement('div')
  wrapper.style.marginBottom = '1.5rem'

  const title = document.createElement('div')
  title.className = 'label-text'
  title.textContent = label

  wrapper.appendChild(title)
  wrapper.appendChild(canvas)
  container.appendChild(wrapper)

  // 处理颜色：如果是单一颜色且是填充型图表，增加透明度
  let bgColors = color;
  let borderColors = color;

  if(typeof color === 'string' && (type === 'bar' || type === 'radar')){
      // 简单处理：不改变透明度，直接用Neon色
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
        borderRadius: 4, // 圆角柱状图
        barPercentage: 0.6
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
      scales: (type === 'pie' || type === 'doughnut' || type === 'radar') ? {} : {
          x: { grid: { display: false } }, // 隐藏X轴网格
          y: { grid: { color: '#334155', borderDash: [5, 5] } } // 虚线Y轴网格
      },
      elements: {
          line: { tension: 0.4 } // 平滑曲线
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
            if(max !== min) weight = 10 + ((val - min) / (max - min)) * 50 // 加大字号范围
            return [item[0], weight]
        })
    }
    return sorted
}

async function renderRepoDetail(fullName){
  try {
    window.currentRepoFullName = fullName
    // 更新 UI 状态
    const badge = document.getElementById('currentRepoBadge')
    badge.classList.remove('d-none')
    badge.textContent = fullName.toUpperCase()
    badge.className = 'badge bg-info text-dark shadow-sm'

    const r = await axios.get('/api/repo', { params:{ full_name: fullName } })
    const d = r.data
    const container = document.getElementById('repoDetail')
    container.innerHTML = '' // Clear
    container.className = 'row g-4' // 使用 Grid

    const viz = d.visualizations || {}

    // 辅助：创建详情卡片 Col
    function createColCard(title, colClass='col-md-6'){
        const col = document.createElement('div')
        col.className = colClass
        const card = document.createElement('div')
        card.className = 'card h-100 p-3'
        const h6 = document.createElement('h6')
        h6.className = 'card-title'
        h6.textContent = title
        card.appendChild(h6)
        col.appendChild(card)
        return { col, body: card }
    }

    // 1. Dependency Overview
    if(viz.dependency_overview){
        const dep = viz.dependency_overview
        const { col, body } = createColCard('Dependency Overview', 'col-md-4')

        // 使用两个小图表
        createChart(body, 'doughnut', 'HAS FILE', ['YES', 'NO'],
            [dep.has_dependency_file?1:0, dep.has_dependency_file?0:1], ['#38bdf8', '#1e293b'])

        const info = document.createElement('div')
        info.className = 'mt-3 p-2 border border-secondary rounded bg-dark font-monospace text-muted'
        info.style.fontSize = '0.8rem'
        info.innerHTML = `
            <div class="d-flex justify-content-between"><span>README RATIO:</span> <span class="text-white">${(dep.readme_env_ratio||0).toFixed(4)}</span></div>
            <div class="d-flex justify-content-between"><span>ENV LINES:</span> <span class="text-white">${dep.readme_env_lines||0}</span></div>
        `
        body.appendChild(info)
        container.appendChild(col)

        // 词云单独放一个卡片
        if(dep.dependency_files){
             const { col: wcCol, body: wcBody } = createColCard('File Types Cloud', 'col-md-4')
             const tokens = clientSideTokenizeAndCount(dep.dependency_files)
             drawWordCloud(wcBody, tokens, 'TYPES')
             container.appendChild(wcCol)
        }
    }

    // 2. Import Analysis (Radar Chart looks cool in dashboards)
    if(viz.import_vs_requirements){
        const imp = viz.import_vs_requirements
        const { col, body } = createColCard('Import Health', 'col-md-4')

        createChart(body, 'radar', 'METRICS', ['MISSING', 'REDUNDANT'],
            [imp.missing_ratio||0, imp.redundant_ratio||0], 'rgba(168, 85, 247, 0.6)')

        container.appendChild(col)
    }

    // 3. Issue & Onboarding (Combined)
    if(viz.onboarding_stats || viz.issue_env_stats){
        const { col, body } = createColCard('Friction Analysis', 'col-12')
        // 创建一个 Flex 容器放横向柱状图
        const flexDiv = document.createElement('div')
        flexDiv.className = 'row'
        body.appendChild(flexDiv)

        if(viz.onboarding_stats){
             const onb = viz.onboarding_stats
             const subDiv = document.createElement('div')
             subDiv.className = 'col-md-6'
             flexDiv.appendChild(subDiv)
             createChart(subDiv, 'bar', 'ONBOARDING FRICTION',
                ['CONTRIB', 'NEW ISSUE', 'PR FAIL'],
                [onb.contributing?.env_ratio||0, onb.newcomer_issues?.env_ratio||0, onb.newcomer_prs?.env_fail_ratio||0],
                ['#4ade80', '#fb923c', '#f87171']
             )
        }
        if(viz.issue_env_stats){
             const iss = viz.issue_env_stats
             const subDiv = document.createElement('div')
             subDiv.className = 'col-md-6'
             flexDiv.appendChild(subDiv)
             if(iss.keyword_hits){
                 let kwList = Object.entries(iss.keyword_hits).sort((a,b)=>b[1]-a[1]).slice(0, 40)
                 if(kwList.length > 0) {
                     const max = kwList[0][1]
                     kwList = kwList.map(k => [k[0], 10 + k[1]/max*50])
                     drawWordCloud(subDiv, kwList, 'ISSUE KEYWORDS')
                 }
             }
        }
        container.appendChild(col)
    }

    // --- AI Section ---
    const aiCol = document.createElement('div')
    aiCol.className = 'col-12'
    const aiBox = document.createElement('div')
    aiBox.id = 'repoAiBox'
    aiBox.className = 'mt-2'
    aiBox.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <span>> READY FOR ANALYSIS...</span>
            <button id="triggerAiBtn" class="btn btn-sm btn-outline-success font-monospace">RUN_AI_MODEL()</button>
        </div>
    `
    aiCol.appendChild(aiBox)
    container.appendChild(aiCol)

    // Bind AI Event
    document.getElementById('triggerAiBtn').onclick = async function() {
        const btn = this;
        btn.disabled = true;
        btn.textContent = 'PROCESSING...';
        aiBox.innerHTML += `<div class="mt-2 text-warning">> Connecting to DeepSeek-V3...</div>`

        let summary_lines = []
        // 构建简单的 prompt summary
        if (viz.dependency_overview) {
            summary_lines.push(`Env Ratio: ${(viz.dependency_overview.readme_env_ratio||0).toFixed(4)}`)
        }

        try {
            const resp = await axios.post('/api/repo-ai', {
                full_name: fullName,
                summary: summary_lines
            })
            // 打字机效果输出
            const analysisText = resp.data.analysis.replace(/\n/g, '<br>');
            aiBox.innerHTML = `
                <div class="mb-2 text-success">> ANALYSIS COMPLETE:</div>
                <div style="color: #e2e8f0; line-height: 1.6;">${analysisText}</div>
            `
        } catch (err) {
            aiBox.innerHTML += `<div class="text-danger">> ERROR: CONNECTION FAILED</div>`
            btn.disabled = false;
            btn.textContent = 'RETRY';
        }
    }

  } catch(e) {
    console.error('Render Detail Error:', e)
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
      const matches = allRepos.filter(r => r.toLowerCase().includes(val)).slice(0, 10)
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
        // 先尝试精确匹配，或者调用搜索API
        renderRepoDetail(q)
    }
  })
})