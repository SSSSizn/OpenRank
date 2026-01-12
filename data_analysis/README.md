# OpenRank 数据分析模块

本模块专注于对 Python 开源项目的环境依赖进行系统性分析，通过多维度数据收集和分析，帮助评估项目的工程健康度和社区友好度。

## 文件结构

```
data_analysis/
├── 操作指南.md              # 详细操作和分析说明
├── 进度.md                 # 项目开发进度记录
├── build_version_knowledge.py    # 构建版本知识库
├── github_spider.py         # GitHub 仓库采样爬虫
├── github_token.txt         # GitHub API Token 配置
├── step1_repo_dependency_overview.py     # 依赖文件存在性分析
├── step2_repo_import_vs_requirements.py  # 导入 vs 依赖一致性分析
├── step3_repo_dependency_staleness.py    # 依赖维护滞后分析
├── step4_issue_env_analysis.py          # Issue 环境问题分析
├── step5_onboarding_analysis.py         # 新贡献者入门分析
├── top_300_analysis.py      # Top 300 仓库批量分析
├── data/                   # 分析结果数据存储
│   ├── sampled_repos_buckets.json/csv    # 采样仓库列表
│   ├── sampled_repo_dependency_overview.json  # 依赖概览结果
│   ├── sampled_repo_import_vs_requirements.json  # 一致性分析结果
│   ├── sampled_repo_dependency_staleness.json   # 滞后分析结果
│   ├── sampled_repo_issue_env_stats.json       # Issue 分析结果
│   ├── sampled_repo_onboarding_stats.json      # 入门分析结果
│   ├── base_env.yaml         # 基准环境配置
│   ├── top-pypi-packages.min.json  # PyPI 包排行
│   ├── total_python_count.csv      # Stack Overflow 数据
│   └── env_relate.csv       # 环境相关问题数据
└── data_opendigger/         # OpenDigger 数据集
    └── [组织名]/[仓库名]/   # 各仓库分析结果
```

## 核心脚本说明

### github_spider.py - 仓库采样
**功能**: 从 GitHub 搜索 Python 项目，按 star 数分桶随机采样

**配置参数**:
- 语言: Python
- 时间范围: 2023-01-01 至 2025-12-31
- 分桶策略: 10-100, 101-1000, 1001-10000, 10000+ stars

**使用方法**:
```bash
python github_spider.py
```

**输出**: `sampled_repos_buckets.json/csv`

### step1_repo_dependency_overview.py - 依赖文件概览
**功能**: 检查仓库是否包含标准依赖文件，分析 README 中的环境配置比例

**检查的文件**:
- requirements.txt
- pyproject.toml
- setup.py
- environment.yml
- Dockerfile

**使用方法**:
```bash
python step1_repo_dependency_overview.py
```

**输出**: `sampled_repo_dependency_overview.json`

### step2_repo_import_vs_requirements.py - 导入一致性分析
**功能**: 分析代码导入的包是否在依赖声明中，计算缺失和冗余比例

**分析方法**:
- AST 解析 Python 代码提取 import
- 解析 requirements.txt 和 pyproject.toml
- 计算一致性比率

**使用方法**:
```bash
python step2_repo_import_vs_requirements.py
```

**输出**: `sampled_repo_import_vs_requirements.json`

### step3_repo_dependency_staleness.py - 依赖维护滞后
**功能**: 计算依赖文件的最后修改时间与仓库活跃度的差距

**指标**:
- 依赖文件 vs 仓库最后更新时间差
- 依赖文件 vs 当前时间差

**使用方法**:
```bash
python step3_repo_dependency_staleness.py
```

**输出**: `sampled_repo_dependency_staleness.json`

### step4_issue_env_analysis.py - Issue 环境问题分析
**功能**: 分析仓库 Issue 中与环境/依赖相关的问题

**关键词体系**:
- 环境关键词: install, environment, dependency 等
- 工具链关键词: error, fail, pip, conda 等

**使用方法**:
```bash
python step4_issue_env_analysis.py
```

**输出**: `sampled_repo_issue_env_stats.json`

### step5_onboarding_analysis.py - 新贡献者入门分析
**功能**: 分析新贡献者在项目初期的环境配置体验

**分析维度**:
- CONTRIBUTING.md 环境配置指导
- 新贡献者 Issue 环境问题
- 新贡献者 PR 失败原因分析

**使用方法**:
```bash
python step5_onboarding_analysis.py
```

**输出**: `sampled_repo_onboarding_stats.json`

### build_version_knowledge.py - 版本知识库构建
**功能**: 从分析结果中提取包版本统计和共现关系

**输出**: `dependency_version_knowledge.json`

### top_300_analysis.py - Top 300 仓库分析
**功能**: 对 OpenDigger Top 300 Python 仓库进行批量依赖分析

**使用方法**:
```bash
python top_300_analysis.py
```

**输出**: `data_opendigger/` 目录下的各仓库分析结果

## 数据文件说明

### 采样数据
- **sampled_repos_buckets.json**: 采样仓库的详细信息
- **sampled_repos_buckets.csv**: CSV 格式的采样数据

### 分析结果
- **dependency_overview**: 依赖文件存在性和 README 环境比例
- **import_vs_requirements**: 导入依赖一致性比率
- **dependency_staleness**: 依赖维护滞后天数
- **issue_env_stats**: Issue 中环境问题统计
- **onboarding_stats**: 新贡献者入门分析

### 辅助数据
- **base_env.yaml**: 推荐的基准 Python 环境配置
- **top-pypi-packages.min.json**: PyPI 包下载量排行
- **total_python_count.csv**: Stack Overflow Python 问题数量统计
- **env_relate.csv**: 环境相关问题统计

## 使用流程

1. **配置环境**
   ```bash
   # 安装依赖
   pip install requests tqdm tomli  # Python < 3.11
   # 或 pip install requests tqdm  # Python >= 3.11

   # 配置 GitHub Token
   echo "your_token" > github_token.txt
   ```

2. **执行分析**
   ```bash
   # 1. 采样仓库
   python github_spider.py

   # 2. 依次执行分析步骤
   python step1_repo_dependency_overview.py
   python step2_repo_import_vs_requirements.py
   python step3_repo_dependency_staleness.py
   python step4_issue_env_analysis.py
   python step5_onboarding_analysis.py

   # 3. 构建知识库
   python build_version_knowledge.py
   ```

3. **查看结果**
   - 结果 JSON 文件存储在 `data/` 目录
   - 可通过 webapp 可视化查看

## 配置要求

### GitHub Token
需要有效的 GitHub Personal Access Token，具有以下权限:
- `public_repo` (读取公共仓库)
- `read:user` (读取用户信息)

### Python 版本
- Python 3.8+ (推荐 3.10+)
- 支持 tomllib (Python 3.11+) 或 tomli (早期版本)

### 系统依赖
- requests: HTTP 请求
- tqdm: 进度条显示

## 注意事项

- **API 限制**: GitHub API 有速率限制，Token 可提高限制
- **网络稳定性**: 分析过程涉及大量 API 调用，确保网络稳定
- **数据量**: 采样分析可能需要较长时间，请耐心等待
- **隐私**: Token 文件已加入 .gitignore，请勿提交到版本控制

## 输出格式

所有分析结果以 JSON 格式存储，包含:
- `full_name`: 仓库完整名称
- 分析指标: 数值、比率、统计信息
- 元数据: 时间戳、状态信息

## 故障排除

**问题**: GitHub API 速率限制
**解决**: 使用有效的 Token，或等待限制重置

**问题**: 网络超时
**解决**: 检查网络连接，适当增加超时时间

**问题**: 依赖解析失败
**解决**: 检查 Python 环境，确保 tomli/tomllib 已安装

## 扩展开发

模块设计支持扩展新的分析维度:
1. 在 `step*.py` 中实现分析逻辑
2. 更新 `操作指南.md` 文档
3. 添加相应的数据结构和可视化支持