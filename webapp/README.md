# 🌐 OpenRank Web 可视化仪表板

基于 Flask 的交互式 Web 应用，用于可视化展示 OpenRank 数据分析的结果，提供直观的图表、搜索和详细的项目分析视图。

## ✨ 功能特性

### 📊 数据可视化
- **📈 统计卡片**: 各分析维度的汇总统计
- **📉 交互图表**: 饼图、柱状图、词云等可视化组件
- **🔄 实时更新**: 自动检测数据文件变化并刷新

### 🔍 仓库查询
- **🔎 智能搜索**: 按仓库名称实时搜索
- **📌 锁定查看**: 固定特定仓库进行深入分析
- **🔗 跨文件关联**: 展示同一仓库在不同分析中的结果

### 📈 分析维度
- **📋 依赖概览**: 文件存在性、README 环境配置比例
- **🔗 一致性分析**: 导入 vs 依赖的匹配程度
- **⏰ 维护滞后**: 依赖更新频率与项目活跃度对比
- **🐛 社区问题**: Issue 中的环境相关问题统计
- **👥 入门友好**: 新贡献者的配置体验分析

### 🤖 AI 增强分析
- **🧠 智能评估**: 基于 LLM 的项目工程成熟度分析
- **⚙️ 配置驱动**: 支持多种 AI 模型和 API
- **💡 专业建议**: 提供改进建议和最佳实践

## 📁 文件结构

```
webapp/
├── [app.py](app.py)                 # Flask 应用主文件
├── [requirements.txt](requirements.txt)       # Python 依赖列表
├── [README.md](README.md)              # 项目文档
├── [static/](static/)                # 静态资源
│   ├── css/
│   ├── js/
│   └── images/
└── [templates/](templates/)            # HTML 模板
    ├── index.html         # 首页模板
    ├── base.html          # 基础模板
    └── components/        # 组件模板
```

## 🚀 快速开始

### 💻 环境要求
- Python 3.8+
- Flask 2.0+
- 数据文件: `../data_analysis/` 目录中的 JSON 文件

### 📝 安装运行

1. **📦 创建虚拟环境**
   ```bash
   python -m venv venv
   ```

2. **▶️ 激活环境**
   ```bash
   # Windows
   venv\Scripts\activate
   # Linux/Mac
   source venv/bin/activate
   ```

3. **📥 安装依赖**
   ```bash
   pip install -r [requirements.txt](requirements.txt)
   ```

4. **🌐 启动应用**
   ```bash
   python [app.py](app.py)
   ```

5. **👀 访问应用**
   打开浏览器访问: `http://127.0.0.1:5000/`

## 📖 使用指南

### 🏠 首页浏览
- **📊 统计概览**: 查看各分析文件的汇总统计
- **📈 可视化图表**: 饼图显示依赖文件分布，柱状图显示均值
- **☁️ 词云展示**: 热门关键词的可视化

### 🔍 仓库搜索
1. 在搜索框输入仓库名称 (如: `psf/requests`)
2. 点击搜索结果锁定仓库
3. 查看该仓库的详细分析数据

### 📋 数据文件查看
- 点击文件卡片加载完整数据表格
- 支持数值字段的自动图表生成
- 前 100 条记录的分页显示

### 🤖 AI 分析
1. 锁定仓库后，配置 AI API 参数
2. 点击"生成分析"获取专业评估
3. 查看工程成熟度报告和改进建议

## 🔌 API 接口

### 📊 数据接口
- `GET /api/files`: 获取所有数据文件列表
- `GET /api/data?name=filename`: 获取指定文件的完整数据
- `GET /api/summary?name=filename`: 获取文件的统计摘要
- `GET /api/search?q=query`: 按仓库名搜索
- `GET /api/repos-list`: 获取所有仓库列表

### 🏗️ 仓库接口
- `GET /api/repo?full_name=name`: 获取仓库详细分析数据
- `POST /api/repo-ai`: AI 增强分析 (需要 API 配置)

### 📝 请求示例
```bash
# 获取文件列表
curl http://localhost:5000/api/files

# 搜索仓库
curl "http://localhost:5000/api/search?q=requests"

# 获取仓库详情
curl "http://localhost:5000/api/repo?full_name=psf/requests"
```

## 🛠️ 技术栈

### 🔧 后端
- **Flask**: Web 框架
- **🐍 Python**: 核心语言
- **📄 JSON**: 数据处理

### 🎨 前端
- **Bootstrap 5**: UI 框架
- **📈 Chart.js**: 图表库
- **☁️ WordCloud2.js**: 词云组件
- **💻 jQuery**: DOM 操作

### 📈 数据处理
- **📊 统计聚合**: 自动计算均值、分布等统计指标
- **💾 缓存机制**: 文件修改时间检测，避免重复加载
- **🔍 索引构建**: 仓库名称到记录的快速映射

## ⚙️ 配置说明

### 📂 数据路径
应用自动扫描 `../data_analysis/` 目录中的 `sampled_*.json` 文件

### 💾 缓存设置
- 数据加载后缓存到内存
- 文件修改时自动重新加载
- 支持多线程数据处理

### 🤖 AI 配置
通过前端界面配置:
- 🌐 Base URL: API 基础地址
- 🔑 API Key: 访问密钥
- 🤖 Model: 模型名称

## 📦 依赖包

```
Flask>=2.0.0        # Web 框架
requests>=2.25.0    # HTTP 请求
openai>=1.0.0       # AI API 客户端
statistics          # Python 内置统计模块
collections         # Python 内置集合模块
pathlib             # Python 内置路径处理
threading           # Python 内置多线程
json                # Python 内置 JSON 处理
```

## 🚀 部署说明

### 💻 本地开发
```bash
export FLASK_ENV=development
python [app.py](app.py)
```

### 🐳 Docker 部署
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
```

## 🔧 故障排除

### ❓ 数据不显示
- 检查 `data_analysis` 目录是否存在
- 确认 JSON 文件格式正确
- 查看控制台错误信息

### ❓ 图表不渲染
- 确认 Chart.js CDN 可访问
- 检查浏览器兼容性
- 尝试刷新页面

### ❓ AI 分析失败
- 验证 API 配置正确性
- 检查网络连接
- 确认 API Key 有足够额度

### ❓ 性能问题
- 大文件可能导致加载缓慢
- 考虑增加分页或虚拟滚动
- 优化数据库查询 (如适用)

## 🛠️ 开发指南

### ➕ 添加新图表
1. 在 `templates/` 中添加图表组件
2. 在 `app.py` 中实现数据处理逻辑
3. 更新前端 JavaScript 渲染

### 🔌 扩展 API
1. 在 `app.py` 中添加路由
2. 实现数据处理函数
3. 更新前端 AJAX 调用

### 🎨 自定义样式
- 修改 `static/css/` 中的样式文件
- 使用 Bootstrap 变量定制主题
- 响应式设计适配移动端

## 📄 许可证

[MIT License](../LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### ⚙️ 开发环境设置
```bash
git clone <repo>
cd webapp
pip install -r [requirements.txt](requirements.txt)
python [app.py](app.py)
```

### 📏 代码规范
- 使用 Black 格式化代码
- 添加类型提示
- 编写单元测试

