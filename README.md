# 🚀 Python 开源项目环境依赖分析工具

本项目是一个综合性的工具套件，用于分析 GitHub 中的 Python 开源项目的环境依赖、健康度和社区友好度。通过数据爬取、静态分析和 AI 辅助分析，帮助开发者快速评估项目的工程成熟度。

## 📁 项目结构

```
openrank/
├── 📊 data_analysis/          # 数据分析核心模块
│   ├── github_spider.py       # GitHub 仓库采样爬虫
│   ├── step1-5_*.py           # 依赖分析脚本 (5个步骤)
│   ├── build_version_knowledge.py  # 版本知识库构建
│   ├── top_300_analysis.py    # Top 300 仓库分析
│   ├── github_token.txt       # GitHub API Token
│   ├── data/                  # 分析结果数据
│   ├── data_opendigger/       # OpenDigger 数据
│   ├── 操作指南.md             # 详细操作说明
│   └── 进度.md                # 项目进度记录
├── 🔧 github-import-analyzer/ # 浏览器扩展
│   ├── manifest.json          # 扩展配置
│   ├── background.js          # 后台服务
│   ├── content.js             # 内容脚本
│   ├── popup.js               # 弹出界面
│   ├── options.js             # 设置页面
│   ├── sidepanel.js           # 侧边面板
│   ├── dependency_version_knowledge.json  # 版本知识库
│   └── *.html/css             # UI 文件
├── 🌐 webapp/                 # Web 可视化仪表板
│   ├── app.py                 # Flask 应用
│   ├── requirements.txt       # Python 依赖
│   ├── static/                # 静态资源
│   └── templates/             # HTML 模板
├── README.md                  # 项目文档
└── LICENSE                    # MIT 许可证
```

### 📂 核心模块说明

| 模块 | 功能 | 主要文件 |
|------|------|----------|
| 📊 **数据分析** | 仓库采样、依赖分析、社区分析 | `data_analysis/` |
| 🔧 **浏览器扩展** | GitHub 页面智能分析 | `github-import-analyzer/` |
| 🌐 **Web 仪表板** | 数据可视化展示 | `webapp/` |

## ✨ 主要功能

### 1. 📊 数据分析模块 (`data_analysis/`)
- **🏗️ 仓库采样**: 从 GitHub 按 star 分桶随机采样 Python 项目
- **🔍 依赖分析**: 检查依赖文件存在性、导入一致性、维护滞后性
- **👥 社区分析**: 分析 Issue 中的环境问题、新贡献者入门障碍
- **📚 版本知识库**: 构建包版本共现和频率统计

### 2. 🔧 浏览器扩展 (`github-import-analyzer/`)
- **🧠 智能分析**: 在 GitHub 页面直接分析 Python 项目的依赖
- **🤖 AI 生成**: 使用 LLM 生成 requirements.txt 和 Dockerfile
- **⭐ 版本推荐**: 基于知识库提供兼容的包版本建议

### 3. 🌐 Web 仪表板 (`webapp/`)
- **📈 数据可视化**: 交互式图表展示分析结果
- **🔍 仓库查询**: 按名称搜索和锁定特定仓库
- **📋 统计摘要**: 自动生成项目健康度报告

## 🚀 快速开始

### 💻 环境要求
- Python 3.8+
- GitHub Personal Access Token (用于 API 访问)

### 📝 安装步骤

1. **📥 克隆项目**
   ```bash
   git clone <repository-url>
   cd openrank
   ```

2. **🔑 配置 GitHub Token**
   ```bash
   # 编辑 data_analysis/github_token.txt
   echo "your_github_token_here" > data_analysis/github_token.txt
   ```

3. **📦 安装依赖**
   ```bash
   # Web 应用依赖
   pip install -r webapp/requirements.txt

   # 数据分析依赖 (可选)
   pip install requests tqdm
   ```

4. **🔬 运行数据分析**
   ```bash
   cd data_analysis
   python github_spider.py  # 采样仓库
   python step1_repo_dependency_overview.py  # 依赖概览
   # 依次运行其他 step*.py 文件
   ```

5. **🌐 启动 Web 仪表板**
   ```bash
   python webapp/app.py
   # 访问 http://127.0.0.1:5000/
   ```

6. **🔧 安装浏览器扩展**
   - 打开 Chrome/Edge 扩展管理页面
   - 启用"开发者模式"
   - 加载 github-import-analyzer/ 文件夹

## 📖 使用方法

### 🔬 数据分析流程
1. **🎯 采样**: 运行 `github_spider.py` 获取仓库样本
2. **📊 分析**: 依次执行 step1-5 的分析脚本
3. **📈 可视化**: 启动 webapp/ 查看结果

### 🔧 浏览器扩展使用
1. 在 GitHub Python 项目页面点击扩展图标
2. 配置 AI API 设置 (支持 OpenAI/DeepSeek 等)
3. 点击"分析"生成依赖文件和 Dockerfile

### 🌐 Web 仪表板操作
- **🏠 首页**: 查看整体统计和可视化
- **🔍 搜索**: 输入仓库名查询具体项目
- **📋 详情**: 点击仓库查看详细分析结果

## 📊 数据文件说明

### 🎯 采样数据
- `sampled_repos_buckets.json/csv`: 分桶采样的仓库列表

### 📈 分析结果
- `sampled_repo_dependency_overview.json`: 依赖文件存在性
- `sampled_repo_import_vs_requirements.json`: 导入依赖一致性
- `sampled_repo_dependency_staleness.json`: 依赖维护滞后
- `sampled_repo_issue_env_stats.json`: Issue 环境问题
- `sampled_repo_onboarding_stats.json`: 新贡献者分析

### 📚 知识库
- `dependency_version_knowledge.json`: 包版本统计
- `top-pypi-packages.min.json`: PyPI 下载排行

## 🔌 API 接口

Web 应用提供 REST API:

- `GET /api/files`: 列出数据文件
- `GET /api/data?name=filename`: 获取文件数据
- `GET /api/summary?name=filename`: 获取统计摘要
- `GET /api/search?q=query`: 搜索仓库
- `GET /api/repo?full_name=name`: 获取仓库详情

## 📦 依赖

### 🐍 Python 包
```
Flask>=2.0
requests
openai
```

### 🌐 外部服务
- GitHub API (需要 Token)
- LLM API (OpenAI/DeepSeek 等)


## 👥 项目成员

#### 🧑‍💻 @SSSSizn：架构设计、AI 逻辑、 Web 后端与集成规范

1.  **数据分析架构设计与基本实现**
    *   收集整理相关开源数据与背景，设计构建开源项目环境依赖问题的数据分析流程。
    *   制定 OpenDigger 数据（Top 300）在项目中的应用策略与筛选标准。
    
2.  **Web 仪表板与后端开发**
    *   **Web后端开发**：搭建 Flask 后端框架与基础功能实现，实现前后端数据交互。
    *   设计并实现 REST API 接口，处理跨域与认证问题。

3.  **AI 智能分析与提示词工程**
    *   **Dockerfile 生成逻辑**：负责 LLM 的 Prompt Engineering，优化提示词以确保生成的 Dockerfile 可用性，并设计验证逻辑。
    *   **后端代理服务**：解决前端直接调用 AI API 被封禁的问题，搭建后端转发服务，统一管理 API Key。
    *   **知识库检索链路**：设计“本地分析结果 -> Libraries.io API -> PyPI JSON API”的三级兜底检索策略，确保依赖数据的准确性。

4.  **系统集成与规范化**
    *   项目文件结构的重构与命名规范化。
    *   编写项目文档及录制演示视频。



#### 🧑‍💻 @AM-SuSh：算法优化、插件开发与Web 前端

1.  **数据采集与性能优化**
    *   优化数据采集分析实现算法，实现基于 Star 数的分桶采样策略，解决单一维度采样偏差问题。
    *   分析算法加速，重构仓库分析逻辑，显著降低网络请求耗时。

2.  **浏览器插件开发与Web前端优化**
    *   **UI/UX 交互设计**：实现插件的侧边栏布局、功能迁移与优化，提升用户体验。
    *   **配置管理与逻辑流实现**：优化插件设置，实现 LLM API 配置的本地存储与安全读取，设计“草稿版快速分析 -> AI 深度优化”的两阶段分析逻辑。
    *   **Web前端设计**：修正词云生成算法与前端展示的排版 Bug，优化集成可视化图表显示逻辑，设计前端页面。

3.  **数据整合与分析**
    *   编写分析 OpenDigger 数据处理，辅助知识库构建。
    *   编写项目文档及PPT制作。


## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系

如有问题请通过 GitHub Issues 联系。
