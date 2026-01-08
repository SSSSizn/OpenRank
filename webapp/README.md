# OpenRank 数据可视化仪表板

## 项目说明

本项目为 openrank 的 `data_analysis` 文件夹中的 JSON 数据提供一个交互式 Web 仪表板。

### 主要功能

**首页可视化**：
- 每个 sampled JSON 文件都有一个统计卡片，包含：
  - **sampled_repo_dependency_overview**：依赖文件的布尔分布（饼图）、文件类型占比（柱状图）、README 环境指标均值
  - **sampled_repo_dependency_staleness**：依赖陈旧性天数均值对比
  - **sampled_repo_import_vs_requirements**：缺失率、冗余率均值 + 导入词云
  - **sampled_repo_issue_env_stats**：环境问题比例均值 + 关键词词云
  - **sampled_repo_onboarding_stats**：入门贡献指标均值 + 新人问题关键词词云

**仓库锁定查询**：
- 在搜索框输入仓库名称进行查询
- 点击搜索结果的标题可"锁定"该仓库
- 展示该仓库在各个文件中的具体数据、图表和词云（词云词范围限制在该仓库内部）

**文件加载与展示**：
- 选择任意 sampled JSON 文件加载并查看前 100 条记录表格
- 自动提取数值字段并绘制平均值柱状图

## 快速开始

### 1. 创建虚拟环境
```bash
python -m venv .venv
```

### 2. 激活虚拟环境

**Windows:**
```bash
.venv\Scripts\activate
```

**Linux/Mac:**
```bash
source .venv/bin/activate
```

### 3. 安装依赖
```bash
pip install -r webapp/requirements.txt
```

### 4. 运行应用
```bash
python webapp/app.py
```

应用会在 `http://127.0.0.1:5000/` 上启动。

### 5. 在浏览器中打开
访问 `http://127.0.0.1:5000/`

## 数据源

- 应用会自动扫描工程根目录下 `data_analysis` 文件夹内所有 `sampled_` 开头的 JSON 文件
- 数据**只读**，不会对原文件进行任何修改

## 技术栈

- **后端**：Flask（Python）
- **前端**：Bootstrap 5、Chart.js、Wordcloud2.js
- **数据处理**：JSON、统计聚合

## API 端点

| 端点 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `/api/files` | GET | - | 列出所有 sampled JSON 文件 |
| `/api/data` | GET | `name` | 获取指定文件的完整数据 |
| `/api/summary` | GET | `name` | 获取指定文件的统计摘要（含图表数据） |
| `/api/search` | GET | `q` | 按仓库名搜索 |
| `/api/repo` | GET | `full_name` | 获取单个仓库的详细数据与可视化信息 |

## 故障排除

**问题**：无法加载词云  
**解决**：检查浏览器控制台，确保 CDN 链接 `wordcloud2.js` 可访问。

**问题**：数据加载失败  
**解决**：确保 `data_analysis` 目录存在且包含 JSON 文件，后端会在启动时扫描目录。

**问题**：图表显示异常  
**解决**：清除浏览器缓存，刷新页面。

