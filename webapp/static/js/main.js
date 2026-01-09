// --- START OF FILE main.js ---

let files = []

// 生成唯一ID，防止Chart/Canvas冲突
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
    
    // 串行加载每个文件的摘要，避免并发请求过多导致卡顿
    for(const f of files){
      try{
        console.log(`Loading summary for ${f}...`)
        const s = await axios.get('/api/summary', { params:{ name: f } })
        renderFileSummary(f, s.data)
      }catch(e){
        console.warn(`Error loading summary for ${f}`, e)
        // 即使出错也继续加载下一个
        const errDiv = document.createElement('div')
        errDiv.className = 'col-12 text-danger'
        errDiv.textContent = `加载 ${f} 失败`
        container.appendChild(errDiv)
      }
    }
  } catch(e) {
    console.error('Init failed', e)
  }
}

// --- 通用组件渲染函数 ---

/**
 * 绘制词云的通用函数
 * @param {HTMLElement} container - 父容器
 * @param {Array} list - 数据列表 [['word', 12], ['test', 10]]
 * @param {String} title - 标题
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
    // 强制样式确保可见性
    wcDiv.style.width = '100%'
    wcDiv.style.height = '240px'
    wcDiv.style.position = 'relative'
    container.appendChild(wcDiv)

    // 3. 延时绘制，确保DOM已插入且有高度
    setTimeout(() => {
        const el = document.getElementById(wcId)
        if(el) {
            try {
                WordCloud(el, { 
                    list: list, 
                    gridSize: 12,       // 调大网格，渲染更快
                    weightFactor: 1,    // 后端已归一化，直接用
                    fontFamily: 'Segoe UI, sans-serif',
                    color: 'random-dark', // 深色随机，在浅色背景更清晰
                    rotateRatio: 0.3,   // 30%概率旋转
                    backgroundColor: '#fafafa',
                    shrinkToFit: true,  // 关键：字太大时自动缩小
                    drawOutOfBound: false
                })
            } catch(wcError) {
                console.warn('WordCloud lib error:', wcError)
            }
        }
    }, 200) // 200ms延时
}

// --- 渲染文件总览 (Summary) ---

function renderFileSummary(filename, summary){
  const container = document.getElementById('fileSummaries')
  const col = document.createElement('div')
  col.className = 'col-md-6 col-lg-4 mb-3'
  
  const card = document.createElement('div')
  card.className = 'card h-100 shadow-sm'
  
  const body = document.createElement('div')
  body.className = 'card-body'
  
  const title = document.createElement('h6')
  title.className = 'card-title text-primary'
  title.textContent = `${filename}`
  const subTitle = document.createElement('small')
  subTitle.className = 'text-muted d-block mb-3'
  subTitle.textContent = `包含 ${summary.total} 个仓库`
  
  body.appendChild(title)
  body.appendChild(subTitle)

  // 根据不同类型渲染不同图表
  if(summary.type === 'dependency_overview'){
    // Pie: 是否有依赖文件
    if(summary.has_dependency_file){
      createChart(body, 'pie', '是否有依赖文件', ['是', '否'], 
        [summary.has_dependency_file['True']||0, summary.has_dependency_file['False']||0], 
        ['#4bc0c0', '#ff9f40'])
    }
    // Bar: 依赖文件类型 (Top 10)
    if(summary.dependency_files){
      const entries = Object.entries(summary.dependency_files).sort((a,b)=>b[1]-a[1]).slice(0, 10)
      if(entries.length > 0){
        createChart(body, 'bar', 'Top 10 依赖文件', entries.map(e=>e[0]), entries.map(e=>e[1]), '#36a2eb', 'y')
      }
    }
    // WordCloud
    drawWordCloud(body, summary.tokens_top, '依赖文件名词云')
  }

  else if(summary.type === 'dependency_staleness'){
    createChart(body, 'bar', '依赖陈旧天数 (均值)', 
      ['vs Repo', 'vs Now'], 
      [summary.days_behind_repo_mean, summary.days_behind_now_mean], 
      '#ffcd56')
  }

  else if(summary.type === 'import_vs_requirements'){
    createChart(body, 'bar', '导入覆盖率 (均值)', 
      ['缺失率 (Missing)', '冗余率 (Redundant)'], 
      [summary.missing_ratio_mean, summary.redundant_ratio_mean], 
      '#9966ff')
    
    drawWordCloud(body, summary.tokens_top, '高频 Import 库')
  }

  else if(summary.type === 'issue_env_stats'){
    createChart(body, 'bar', '环境问题比例', ['环境问题占比'], [summary.env_issue_ratio_mean], '#ff6384')
    drawWordCloud(body, summary.tokens_top, 'Issue 关键词')
  }

  else if(summary.type === 'onboarding_stats'){
    createChart(body, 'bar', '新手/贡献环境阻碍', 
      ['贡献文档提及环境', '新人Issue是环境', '新人PR环境失败'], 
      [summary.contributing_env_ratio_mean, summary.newcomer_issues_env_ratio_mean, summary.newcomer_prs_env_fail_ratio_mean],
      '#c9cbcf')
    
    drawWordCloud(body, summary.tokens_top, '新人 Issue 关键词')
  }

  card.appendChild(body)
  col.appendChild(card)
  container.appendChild(col)
}

// 辅助：创建简单的 Chart.js 图表
function createChart(container, type, label, labels, data, color, indexAxis='x'){
  const canvas = document.createElement('canvas')
  canvas.style.maxHeight = '200px' // 限制高度
  canvas.style.width = '100%'
  const wrapper = document.createElement('div')
  wrapper.style.marginBottom = '1rem'
  
  const title = document.createElement('div')
  title.className = 'label-text'
  title.textContent = label
  
  wrapper.appendChild(title)
  wrapper.appendChild(canvas)
  container.appendChild(wrapper)

  const config = {
    type: type,
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: Array.isArray(color) ? color : color,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: indexAxis, // 'y' for horizontal bar
      plugins: { legend: { display: type === 'pie' } }
    }
  }
  new Chart(canvas.getContext('2d'), config)
}

// --- 渲染单个仓库详情 (Detail) ---

// 简单的客户端分词 (用于详情页，因为API只返回了Raw Data)
function clientSideTokenizeAndCount(items) {
    const counter = {}
    if(!items || !Array.isArray(items)) return [];
    
    items.forEach(text => {
        if(!text) return;
        // 简单分词：转小写，非字母数字换空格，分割
        const parts = String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/)
        parts.forEach(p => {
            if(p.length > 2) {
                counter[p] = (counter[p] || 0) + 1
            }
        })
    })

    // 转换为列表并排序
    let sorted = Object.entries(counter).sort((a,b) => b[1] - a[1]).slice(0, 50)
    
    // 简单的归一化: max mapped to 50, min to 10
    if(sorted.length > 0) {
        const max = sorted[0][1]
        const min = sorted[sorted.length-1][1]
        sorted = sorted.map(item => {
            const val = item[1]
            let weight = 20
            if(max !== min) {
                weight = 10 + ((val - min) / (max - min)) * 40
            }
            return [item[0], weight]
        })
    }
    return sorted
}

async function renderRepoDetail(fullName){
  try {
    const r = await axios.get('/api/repo', { params:{ full_name: fullName } })
    const d = r.data
    const container = document.getElementById('repoDetail')
    container.innerHTML = ''
    
    // 标题
    const header = document.createElement('div')
    header.className = 'd-flex justify-content-between align-items-center mb-3'
    header.innerHTML = `<h5 class="text-primary m-0">${fullName}</h5>`
    container.appendChild(header)

    const viz = d.visualizations || {}

    // 1. Dependency Overview
    if(viz.dependency_overview){
        const dep = viz.dependency_overview
        const card = createDetailCard('依赖概览')
        
        // 饼图
        createChart(card.body, 'pie', '依赖文件存在', ['是', '否'], 
            [dep.has_dependency_file?1:0, dep.has_dependency_file?0:1], ['#36a2eb', '#ff6384'])
            
        // 文本信息
        const info = document.createElement('div')
        info.className = 'alert alert-light border mt-3'
        info.innerHTML = `
            <div><strong>README 环境比例:</strong> ${(dep.readme_env_ratio||0).toFixed(4)}</div>
            <div><strong>总行数:</strong> ${dep.readme_total_lines||0}</div>
            <div><strong>环境相关行数:</strong> ${dep.readme_env_lines||0}</div>
        `
        card.body.appendChild(info)
        
        // 单仓库依赖文件词云
        const tokens = clientSideTokenizeAndCount(dep.dependency_files)
        drawWordCloud(card.body, tokens, '依赖文件分布')
        
        container.appendChild(card.el)
    }

    // 2. Staleness
    if(viz.dependency_staleness){
        const stal = viz.dependency_staleness
        const card = createDetailCard('依赖陈旧性')
        createChart(card.body, 'bar', '滞后天数', ['vs Repo', 'vs Now'], 
            [stal.days_behind_repo||0, stal.days_behind_now||0], '#ff9f40')
        container.appendChild(card.el)
    }

    // 3. Import vs Requirements
    if(viz.import_vs_requirements){
        const imp = viz.import_vs_requirements
        const card = createDetailCard('Import 分析')
        createChart(card.body, 'bar', '比例', ['缺失率', '冗余率'], 
            [imp.missing_ratio, imp.redundant_ratio], '#4bc0c0')
        
        // 词云
        const tokens = clientSideTokenizeAndCount(imp.imports)
        drawWordCloud(card.body, tokens, 'Import 库词云')
        
        container.appendChild(card.el)
    }

    // 4. Issue Env Stats
    if(viz.issue_env_stats){
        const iss = viz.issue_env_stats
        const card = createDetailCard('Issue 环境统计')
        createChart(card.body, 'bar', '比例', ['环境Issue占比'], [iss.env_issue_ratio], '#9966ff')
        
        // 这里的 keyword_hits 是个对象 {word: count}，需要转一下格式
        let kwList = []
        if(iss.keyword_hits){
             kwList = Object.entries(iss.keyword_hits)
                .sort((a,b)=>b[1]-a[1])
                .slice(0, 50)
                // 归一化
             if(kwList.length > 0){
                 const max = kwList[0][1]
                 kwList = kwList.map(k => [k[0], 10 + k[1]/max * 40])
             }
        }
        drawWordCloud(card.body, kwList, 'Issue 关键词')
        
        container.appendChild(card.el)
    }

    // 5. Onboarding
    if(viz.onboarding_stats){
        const onb = viz.onboarding_stats
        const card = createDetailCard('入门/贡献体验')
        
        const c_ratio = onb.contributing?.env_ratio || 0
        const n_ratio = onb.newcomer_issues?.env_ratio || 0
        const p_ratio = onb.newcomer_prs?.env_fail_ratio || 0
        
        createChart(card.body, 'bar', '比例', ['Contributing Env', 'Newcomer Issue Env', 'PR Fail Env'], 
            [c_ratio, n_ratio, p_ratio], '#c9cbcf')
            
        // 关键词词云
        let kwList = []
        if(onb.newcomer_issues?.keyword_hits){
            kwList = Object.entries(onb.newcomer_issues.keyword_hits)
                .sort((a,b)=>b[1]-a[1]).slice(0, 50)
             if(kwList.length > 0){
                 const max = kwList[0][1]
                 kwList = kwList.map(k => [k[0], 10 + k[1]/max * 40])
             }
        }
        drawWordCloud(card.body, kwList, '新人 Issue 关键词')
        
        container.appendChild(card.el)
    }
  } catch(e) {
    console.error('Render Detail Error', e)
    alert('加载仓库详情失败')
  }
}

function createDetailCard(titleText){
    const el = document.createElement('div')
    el.className = 'card mb-4 shadow-sm'
    const body = document.createElement('div')
    body.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.className = 'card-title border-bottom pb-2 mb-3'
    h6.textContent = titleText
    body.appendChild(h6)
    el.appendChild(body)
    return { el, body }
}

// --- 事件监听与搜索逻辑 ---

document.addEventListener('DOMContentLoaded', ()=>{
  // 1. 加载文件摘要
  init()
  
  // 2. 加载仓库列表（用于自动补全）
  let allRepos = []
  axios.get('/api/repos-list').then(r => {
    allRepos = r.data
    
    const searchForm = document.getElementById('searchForm')
    const input = document.getElementById('searchInput')
    
    // 创建下拉列表容器
    const listDiv = document.createElement('div')
    listDiv.id = 'reposList'
    listDiv.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 300px; 
        overflow-y: auto; 
        background: white; 
        border: 1px solid #ddd; 
        border-radius: 4px; 
        display: none; 
        z-index: 1050;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `
    // 让 searchForm 相对定位，以便下拉列表对其
    searchForm.style.position = 'relative'
    searchForm.appendChild(listDiv)
    
    // 输入事件
    input.addEventListener('input', (e)=>{
        const val = e.target.value.trim().toLowerCase()
        if(val.length < 1){
            listDiv.style.display = 'none'
            return
        }
        
        // 过滤
        const matches = allRepos.filter(r => r.toLowerCase().includes(val)).slice(0, 15)
        
        listDiv.innerHTML = ''
        if(matches.length > 0){
            listDiv.style.display = 'block'
            matches.forEach(repo => {
                const item = document.createElement('div')
                item.textContent = repo
                item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;'
                item.onmouseover = () => item.style.backgroundColor = '#f8f9fa'
                item.onmouseout = () => item.style.backgroundColor = 'white'
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
        if(!searchForm.contains(e.target)){
            listDiv.style.display = 'none'
        }
    })

  }).catch(e => console.warn('Failed to load repos list', e))

  // 3. 搜索按钮点击
  document.getElementById('searchBtn').addEventListener('click', async ()=>{
    const q = document.getElementById('searchInput').value.trim()
    if(!q) return
    
    try {
        const r = await axios.get('/api/search', { params:{ q } })
        const arr = r.data
        if(arr.length === 0){ 
          alert('未找到匹配项');
          return 
        }
        // 默认显示第一个结果
        renderRepoDetail(arr[0].full_name || arr[0].record.full_name)
    } catch(e) {
        console.error('Search error', e)
        alert('搜索出错')
    }
  })
})