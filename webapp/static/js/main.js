let files = []
let repoChart = null

function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9) }

async function init(){
  const r = await axios.get('/api/files')
  files = r.data
  
  // load summaries for each file directly
  const container = document.getElementById('fileSummaries')
  container.innerHTML = ''
  for(const f of files){
    try{
      const s = await axios.get('/api/summary', { params:{ name: f } })
      renderFileSummary(f, s.data)
    }catch(e){
      console.warn('summary error', f, e)
    }
  }
}

function tokenizeText(text){
  const parts = String(text).toLowerCase().match(/[a-z0-9_]+/g) || []
  return parts.filter(p => p.length >= 2)
}

function renderFileSummary(filename, summary){
  const container = document.getElementById('fileSummaries')
  const col = document.createElement('div')
  col.className = 'col-md-6 col-lg-4 mb-3'
  const card = document.createElement('div')
  card.className = 'card h-100'
  const body = document.createElement('div')
  body.className = 'card-body'
  body.style = 'overflow-y: auto; max-height: 600px;'
  
  const title = document.createElement('h6')
  title.textContent = `${filename} — ${summary.total} 条`
  body.appendChild(title)

  if(summary.type === 'dependency_overview'){
    if(summary.has_dependency_file){
      const pieId = uid('pie')
      const pieCan = document.createElement('canvas')
      pieCan.id = pieId
      pieCan.style.height = '150px'
      body.appendChild(document.createTextNode('是否有依赖文件'))
      body.appendChild(pieCan)
      const counts = summary.has_dependency_file
      new Chart(pieCan.getContext('2d'), {
        type: 'pie',
        data: { labels: Object.keys(counts), datasets:[{ data: Object.values(counts), backgroundColor:['#4dc9f6','#f67019']}]},
        options: { responsive:true, maintainAspectRatio:false }
      })
    }
    if(summary.dependency_files && Object.keys(summary.dependency_files).length>0){
      const barId = uid('bar')
      const barCan = document.createElement('canvas')
              wcDiv.className = 'wordcloud-container'
      barCan.style.height = '150px'
      body.appendChild(document.createElement('br'))
      body.appendChild(document.createTextNode('依赖文件类型'))
      body.appendChild(barCan)
      const labels = Object.keys(summary.dependency_files)
      const vals = Object.values(summary.dependency_files)
      new Chart(barCan.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets:[{ label:'次数', data: vals, backgroundColor:'rgba(75,192,192,0.6)' }]},
        options: { responsive:true, maintainAspectRatio:false, indexAxis:'y' }
      })
    }
    const metricsId = uid('metrics')
    const metricsCan = document.createElement('canvas')
    metricsCan.id = metricsId
    metricsCan.style.height = '150px'
    body.appendChild(document.createElement('br'))
    body.appendChild(document.createTextNode('README 环境指标均值'))
    body.appendChild(metricsCan)
    new Chart(metricsCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['env_ratio', 'total_lines', 'env_lines'], 
        datasets:[{ 
          label:'均值', 
          data: [summary.readme_env_ratio_mean, summary.readme_total_lines_mean, summary.readme_env_lines_mean], 
          backgroundColor:'rgba(153,102,255,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
  }
  else if(summary.type === 'dependency_staleness'){
    const stalId = uid('stal')
    const stalCan = document.createElement('canvas')
    stalCan.id = stalId
    stalCan.style.height = '180px'
    body.appendChild(document.createTextNode('依赖陈旧性（天）'))
    body.appendChild(stalCan)
    new Chart(stalCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['days_behind_repo', 'days_behind_now'], 
        datasets:[{ 
          label:'均值', 
          data: [summary.days_behind_repo_mean, summary.days_behind_now_mean], 
          backgroundColor:'rgba(255,159,64,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
  }
  else if(summary.type === 'import_vs_requirements'){
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '150px'
    body.appendChild(document.createTextNode('导入质量指标'))
    body.appendChild(ratioCan)
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['missing_ratio', 'redundant_ratio'], 
        datasets:[{ 
          label:'均值', 
          data: [summary.missing_ratio_mean, summary.redundant_ratio_mean], 
          backgroundColor:'rgba(54,162,235,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    // wordcloud for imports
    if((summary.tokens_top||[]).length>0){
      body.appendChild(document.createElement('br'))
        const wcLabel = document.createElement('div')
        wcLabel.className = 'label-text'
        wcLabel.textContent = '导入词频（该仓库）'
        body.appendChild(wcLabel)
        const wcId = uid('wc')
        const wcDiv = document.createElement('div')
        wcDiv.className = 'wordcloud-container'
        wcDiv.id = wcId
        body.appendChild(wcDiv)
      const list = summary.tokens_top.slice(0,80)
      setTimeout(()=>{
        try{
          const el = document.getElementById(wcId)
          if(el){
            WordCloud(el, { list: list, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
          }
        }catch(e){ console.warn('wordcloud error', e) }
        }, 350)
    }
  }
  else if(summary.type === 'issue_env_stats'){
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '150px'
    body.appendChild(document.createTextNode('环境问题比例'))
    body.appendChild(ratioCan)
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['env_issue_ratio'], 
        datasets:[{ 
          label:'均值', 
          data: [summary.env_issue_ratio_mean], 
          backgroundColor:'rgba(201,203,207,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    // wordcloud for keywords
    if((summary.tokens_top||[]).length>0){
      body.appendChild(document.createElement('br'))
      const wcLabel = document.createElement('div')
      wcLabel.className = 'label-text'
      wcLabel.textContent = '问题关键词'
      body.appendChild(wcLabel)
      const wcId = uid('wc')
      const wcDiv = document.createElement('div')
      wcDiv.className = 'wordcloud-container'
      wcDiv.id = wcId
      body.appendChild(wcDiv)
      const list = summary.tokens_top.slice(0,80)
      setTimeout(()=>{
        try{
          const el = document.getElementById(wcId)
          if(el){
            WordCloud(el, { list: list, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
          }
        }catch(e){ console.warn('wordcloud error', e) }
      }, 350)
    }
  }
  else if(summary.type === 'onboarding_stats'){
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '150px'
    body.appendChild(document.createTextNode('入门贡献指标均值'))
    body.appendChild(ratioCan)
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['contributing_env', 'newcomer_env', 'newcomer_fail'], 
        datasets:[{ 
          label:'比例', 
          data: [summary.contributing_env_ratio_mean, summary.newcomer_issues_env_ratio_mean, summary.newcomer_prs_env_fail_ratio_mean], 
          backgroundColor:'rgba(255,99,132,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    // wordcloud for newcomer keywords
    if((summary.tokens_top||[]).length>0){
      body.appendChild(document.createElement('br'))
      const wcLabel = document.createElement('div')
      wcLabel.className = 'label-text'
      wcLabel.textContent = '新人问题关键词'
      body.appendChild(wcLabel)
      const wcId = uid('wc')
      const wcDiv = document.createElement('div')
      wcDiv.className = 'wordcloud-container'
      wcDiv.id = wcId
      body.appendChild(wcDiv)
      const list = summary.tokens_top.slice(0,80)
      setTimeout(()=>{
        try{
          const el = document.getElementById(wcId)
          if(el){
            WordCloud(el, { list: list, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
          }
        }catch(e){ console.warn('wordcloud error', e) }
      }, 350)
    }
  }

  card.appendChild(body)
  col.appendChild(card)
  container.appendChild(col)
}

async function renderRepoDetail(fullName){
  const r = await axios.get('/api/repo', { params:{ full_name: fullName } })
  const d = r.data
  const container = document.getElementById('repoDetail')
  container.innerHTML = ''
  
  const title = document.createElement('h5')
  title.textContent = fullName
  container.appendChild(title)

  const viz = d.visualizations || {}

  // dependency_overview
  if(viz.dependency_overview){
    const dep = viz.dependency_overview
    const section = document.createElement('div')
    section.className = 'card mb-3'
    const bd = document.createElement('div')
    bd.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.textContent = '依赖概览'
    bd.appendChild(h6)
    
    const pieId = uid('pie')
    const pieCan = document.createElement('canvas')
    pieCan.id = pieId
    pieCan.style.height = '200px'
    bd.appendChild(pieCan)
    const hasDepData = dep.has_dependency_file ? [1, 0] : [0, 1]
    new Chart(pieCan.getContext('2d'), {
      type: 'pie',
      data: { labels: ['是', '否'], datasets:[{ data: hasDepData, backgroundColor:['#4dc9f6','#f67019']}]},
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    const metricsDiv = document.createElement('div')
    metricsDiv.className = 'alert alert-info'
    metricsDiv.innerHTML = `
      <strong>README 环境指标</strong><br/>
      环境比例: ${dep.readme_env_ratio.toFixed(3)}<br/>
      总行数: ${dep.readme_total_lines}<br/>
      环境行数: ${dep.readme_env_lines}
    `
    bd.appendChild(metricsDiv)
    section.appendChild(bd)
    container.appendChild(section)
  }

  // dependency_staleness
  if(viz.dependency_staleness){
    const stal = viz.dependency_staleness
    const section = document.createElement('div')
    section.className = 'card mb-3'
    const bd = document.createElement('div')
    bd.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.textContent = '依赖陈旧性'
    bd.appendChild(h6)
    const stalId = uid('stal')
    const stalCan = document.createElement('canvas')
    stalCan.id = stalId
    stalCan.style.height = '200px'
    bd.appendChild(stalCan)
    new Chart(stalCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['vs repo', 'vs now'], 
        datasets:[{ 
          label:'天数', 
          data: [stal.days_behind_repo || 0, stal.days_behind_now || 0], 
          backgroundColor:'rgba(255,159,64,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    section.appendChild(bd)
    container.appendChild(section)
  }

  // import_vs_requirements
  if(viz.import_vs_requirements){
    const imp = viz.import_vs_requirements
    const section = document.createElement('div')
    section.className = 'card mb-3'
    const bd = document.createElement('div')
    bd.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.textContent = '导入 vs 依赖'
    bd.appendChild(h6)
    
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '200px'
    bd.appendChild(ratioCan)
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['missing', 'redundant'], 
        datasets:[{ 
          label:'比例', 
          data: [imp.missing_ratio, imp.redundant_ratio], 
          backgroundColor:'rgba(54,162,235,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    if(imp.imports && imp.imports.length>0){
      const importWords = {}
      for(const im of imp.imports){
        const parts = tokenizeText(im)
        for(const p of parts){
          importWords[p] = (importWords[p]||0) + 1
        }
      }
      const top = Object.entries(importWords).sort((a,b)=>b[1]-a[1]).slice(0,60)
      if(top.length>0){
        const wcId = uid('wc')
        const wcDiv = document.createElement('div')
        wcDiv.className = 'wordcloud-container'
        wcDiv.id = wcId
        const wcLabel = document.createElement('div')
        wcLabel.className = 'label-text'
        wcLabel.textContent = '导入词频（该仓库）'
        bd.appendChild(wcLabel)
        bd.appendChild(wcDiv)
        setTimeout(()=>{
          try{
            const el = document.getElementById(wcId)
            if(el){
              WordCloud(el, { list: top, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
            }
          }catch(e){ console.warn('wordcloud error', e) }
        }, 350)
      }
    }
    section.appendChild(bd)
    container.appendChild(section)
  }

  // issue_env_stats
  if(viz.issue_env_stats){
    const iss = viz.issue_env_stats
    const section = document.createElement('div')
    section.className = 'card mb-3'
    const bd = document.createElement('div')
    bd.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.textContent = '问题环境统计'
    bd.appendChild(h6)
    
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '200px'
    bd.appendChild(ratioCan)
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['env_issue_ratio'], 
        datasets:[{ 
          label:'比例', 
          data: [iss.env_issue_ratio], 
          backgroundColor:'rgba(201,203,207,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    if(iss.keyword_hits && Object.keys(iss.keyword_hits).length>0){
      const kwList = Object.entries(iss.keyword_hits).sort((a,b)=>b[1]-a[1]).slice(0,60)
      if(kwList.length>0){
        const wcId = uid('wc')
        const wcDiv = document.createElement('div')
        wcDiv.className = 'wordcloud-container'
        wcDiv.id = wcId
        const wcLabel = document.createElement('div')
        wcLabel.className = 'label-text'
        wcLabel.textContent = '问题关键词（该仓库）'
        bd.appendChild(wcLabel)
        bd.appendChild(wcDiv)
        setTimeout(()=>{
          try{
            const el = document.getElementById(wcId)
            if(el){
              WordCloud(el, { list: kwList, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
            }
          }catch(e){ console.warn('wordcloud error', e) }
        }, 350)
      }
    }
    section.appendChild(bd)
    container.appendChild(section)
  }

  // onboarding_stats
  if(viz.onboarding_stats){
    const onb = viz.onboarding_stats
    const section = document.createElement('div')
    section.className = 'card mb-3'
    const bd = document.createElement('div')
    bd.className = 'card-body'
    const h6 = document.createElement('h6')
    h6.textContent = '入门统计'
    bd.appendChild(h6)
    
    const ratioId = uid('ratio')
    const ratioCan = document.createElement('canvas')
    ratioCan.id = ratioId
    ratioCan.style.height = '200px'
    bd.appendChild(ratioCan)
    
    const contrib_ratio = (onb.contributing && onb.contributing.env_ratio) ? onb.contributing.env_ratio : 0
    const newcomer_ratio = (onb.newcomer_issues && onb.newcomer_issues.env_ratio) ? onb.newcomer_issues.env_ratio : 0
    const pr_fail_ratio = (onb.newcomer_prs && onb.newcomer_prs.env_fail_ratio) ? onb.newcomer_prs.env_fail_ratio : 0
    
    new Chart(ratioCan.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['contributing', 'newcomer_issues', 'newcomer_prs'], 
        datasets:[{ 
          label:'比例', 
          data: [contrib_ratio, newcomer_ratio, pr_fail_ratio], 
          backgroundColor:'rgba(255,99,132,0.6)' 
        }]
      },
      options: { responsive:true, maintainAspectRatio:false }
    })
    
    if(onb.newcomer_issues && onb.newcomer_issues.keyword_hits){
      const kwList = Object.entries(onb.newcomer_issues.keyword_hits).sort((a,b)=>b[1]-a[1]).slice(0,60)
      if(kwList.length>0){
        const wcId = uid('wc')
        const wcDiv = document.createElement('div')
        wcDiv.className = 'wordcloud-container'
        wcDiv.id = wcId
        const wcLabel = document.createElement('div')
        wcLabel.className = 'label-text'
        wcLabel.textContent = '新人问题关键词（该仓库）'
        bd.appendChild(wcLabel)
        bd.appendChild(wcDiv)
        setTimeout(()=>{
          try{
            const el = document.getElementById(wcId)
            if(el){
              WordCloud(el, { list: kwList, gridSize: 8, weightFactor: 4, color: 'random', rotateRatio: 0.3 })
            }
          }catch(e){ console.warn('wordcloud error', e) }
        }, 350)
      }
    }
    section.appendChild(bd)
    container.appendChild(section)
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  init()
  
  // Load and display repos list
  let allRepos = []
  axios.get('/api/repos-list').then(r => {
    allRepos = r.data
    // Create and insert repos list below search box
    const searchForm = document.getElementById('searchForm')
    const reposList = document.createElement('div')
    reposList.id = 'reposList'
    reposList.style = 'margin-top: 10px; max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 8px; display: none;'
    searchForm.parentElement.appendChild(reposList)
    
    // Show/hide repos list on input
    const input = document.getElementById('searchInput')
    input.addEventListener('focus', ()=>{
      if(input.value.trim().length > 0){
        showReposList(input.value.trim())
      }
    })
    input.addEventListener('input', ()=>{
      const q = input.value.trim()
      if(q.length > 0){
        showReposList(q)
      } else {
        reposList.style.display = 'none'
      }
    })
    
    function showReposList(q){
      const filtered = allRepos.filter(r => r.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
      reposList.innerHTML = ''
      if(filtered.length === 0){
        reposList.style.display = 'none'
        return
      }
      reposList.style.display = 'block'
      for(const repo of filtered){
        const item = document.createElement('div')
        item.style = 'padding: 5px; cursor: pointer; border-radius: 3px;'
        item.textContent = repo
        item.addEventListener('mouseover', ()=>{ item.style.backgroundColor = '#f0f0f0' })
        item.addEventListener('mouseout', ()=>{ item.style.backgroundColor = 'transparent' })
        item.addEventListener('click', ()=>{
          input.value = repo
          reposList.style.display = 'none'
          renderRepoDetail(repo)
        })
        reposList.appendChild(item)
      }
    }
  }).catch(e => console.warn('Failed to load repos list', e))

  document.getElementById('searchBtn').addEventListener('click', async ()=>{
    const q = document.getElementById('searchInput').value.trim()
    if(!q) return
    const r = await axios.get('/api/search', { params:{ q } })
    const arr = r.data
    if(arr.length===0){ 
      alert('未找到匹配项');
      return 
    }
    const fullname = arr[0].record.full_name
    renderRepoDetail(fullname)
  })
})
