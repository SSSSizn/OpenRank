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

### 参考文献与相关工作

本项目在设计与实现过程中，参考的文献如下：

1. **Zhu, H.-N., & Rubio-González, C.** (2023).  
   *On the Reproducibility of Software Defect Datasets*.  
   In *Proceedings of the 45th International Conference on Software Engineering (ICSE 2023)*, pp. 2324–2335. IEEE Press.  
   DOI: 10.1109/ICSE48619.2023.00195

2. **Sharma, A., Baudry, B., & Monperrus, M.** (2026).  
   *Causes and Canonicalization of Unreproducible Builds in Java*.  
   *IEEE Transactions on Software Engineering*, 52(1), 54–69.  
   DOI: 10.1109/TSE.2025.3627891

3. **Hassan, Z., Treude, C., Norrish, M., Williams, G., & Potanin, A.** (2025).  
   *Characterising Reproducibility Debt in Scientific Software: A Systematic Literature Review*.  
   *Journal of Systems and Software*, 222, Article 112327.  
   DOI: 10.1016/j.jss.2024.112327

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系

如有问题请通过 GitHub Issues 联系。
