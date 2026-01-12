# 🔧 GitHub Import Analyzer - 浏览器扩展

一个智能的浏览器扩展，用于在 GitHub Python 项目页面直接分析代码依赖，自动生成 `requirements.txt` 和 `Dockerfile`，并提供版本兼容性建议。

## ✨ 功能特性

- **🧠 智能依赖分析**: 自动扫描 Python 文件提取 import 语句
- **🤖 AI 生成配置**: 使用大语言模型生成项目依赖文件
- **📊 版本知识库**: 基于大规模数据统计的包版本推荐
- **🔄 多模型支持**: 支持 OpenAI、DeepSeek 等主流 LLM API
- **📋 一键复制**: 生成的配置文件支持一键复制到剪贴板
- **📱 侧边面板**: 提供便捷的分析结果查看界面

## 📁 文件结构

```
github-import-analyzer/
├── [manifest.json](manifest.json)           # 扩展清单配置
├── [background.js](background.js)           # 后台服务脚本
├── [content.js](content.js)              # 页面内容脚本
├── [popup.js](popup.js)                # 弹出页面逻辑
├── [options.js](options.js)              # 设置页面逻辑
├── [sidepanel.js](sidepanel.js)            # 侧边面板逻辑
├── [utils.js](utils.js)                # 工具函数
├── [dependency_version_knowledge.json](dependency_version_knowledge.json)  # 版本知识库
├── [popup.html](popup.html)              # 弹出页面
├── [options.html](options.html)            # 设置页面
├── [sidepanel.html](sidepanel.html)          # 侧边面板
├── [style.css](style.css)               # 样式文件
└── [stdlib.js](stdlib.js)               # Python 标准库定义
```

## 📥 安装方法

### 🌐 Chrome/Edge 浏览器

1. **📦 下载扩展文件**
   ```bash
   # 克隆或下载整个 github-import-analyzer 目录
   ```

2. **⚙️ 打开扩展管理页面**
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. **🔧 启用开发者模式**
   - 右上角开启"开发者模式"

4. **📂 加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择 `github-import-analyzer` 文件夹

5. **✅ 验证安装**
   - 扩展图标应出现在工具栏
   - 在 GitHub Python 项目页面应能看到扩展激活

## 📖 使用指南

### 1. ⚙️ 配置 API 设置

首次使用前需要配置 LLM API:

1. 点击扩展图标打开弹出页面
2. 点击"设置"按钮或右键扩展图标选择"选项"
3. 填写以下信息:
   - **🌐 Base URL**: API 基础地址 (如 `https://api.openai.com/v1`)
   - **🔑 API Key**: 您的 API 密钥
   - **🤖 Model**: 模型名称 (如 `gpt-4`, `deepseek-chat`)

### 2. 🔍 分析项目

在 GitHub Python 项目页面:

1. **🚀 激活扩展**: 点击工具栏中的扩展图标
2. **📋 选择分析模式**:
   - 弹出页面: 快速分析
   - 侧边面板: 详细结果查看
3. **▶️ 点击"分析"**: 开始自动分析
4. **👀 查看结果**:
   - `requirements.txt`: 生成的依赖文件
   - `Dockerfile`: 容器化配置
   - 解释说明: AI 生成的分析说明

### 3. 📋 复制配置

- 点击文件内容区域自动复制到剪贴板
- 或点击"复制"按钮手动复制

## 🛠️ 技术实现

### 🔧 核心组件

#### [manifest.json](manifest.json)
扩展配置清单，定义权限和资源:
```json
{
  "manifest_version": 3,
  "name": "Github PyAnalyzer",
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "host_permissions": ["https://github.com/*", "https://api.github.com/*"]
}
```

#### [content.js](content.js)
页面内容脚本，负责:
- 检测 GitHub Python 项目页面
- 提取代码文件列表
- 扫描 Python 代码获取 import

#### [background.js](background.js)
后台服务，负责:
- 处理扩展生命周期
- 管理 API 请求
- 协调各组件通信

#### [popup.js](popup.js)/[options.js](options.js)
用户界面逻辑:
- API 配置管理
- 分析结果展示
- 用户交互处理

### 🔄 分析流程

1. **🔍 页面检测**: 识别 GitHub Python 仓库
2. **📂 文件扫描**: 获取仓库文件树，筛选 .py 文件
3. **💻 代码分析**: 下载并解析 Python 文件提取 import
4. **🔧 依赖过滤**: 排除标准库和本地模块
5. **🤖 AI 生成**: 调用 LLM 生成配置文件
6. **📊 结果展示**: 格式化显示生成的内容

### 📚 版本知识库

`[dependency_version_knowledge.json](dependency_version_knowledge.json)` 包含:
- **📈 包版本频率**: 各包的版本使用统计
- **🔗 版本共现**: 包之间的版本兼容关系
- **💡 推荐策略**: 基于统计的版本选择建议

## ⚙️ 配置选项

### 🔑 API 设置
- **🌐 Base URL**: LLM API 的基础 URL
- **🔐 API Key**: 访问密钥 (本地存储，安全保存)
- **🤖 Model**: 使用的模型名称

### 🔍 分析参数
- **📁 最大文件数**: 单次分析的最大 Python 文件数量 (默认 20)
- **⏱️ 超时时间**: API 请求超时设置 (默认 60 秒)

## 🌐 支持的平台

### 🤖 LLM API
- OpenAI GPT 系列
- DeepSeek
- 其他兼容 OpenAI API 的服务

### 🌐 浏览器
- Google Chrome 88+
- Microsoft Edge 88+
- 其他 Chromium 内核浏览器

## 🔒 权限说明

扩展需要以下权限:

- **📄 activeTab**: 获取当前标签页信息
- **💻 scripting**: 执行内容脚本
- **💾 storage**: 保存用户配置
- **📱 sidePanel**: 提供侧边面板界面
- **🌍 host_permissions**: 访问 GitHub 和 API 域名

## 🛡️ 安全考虑

- API Key 仅存储在本地浏览器存储中
- 不会上传您的代码或个人数据
- 所有分析在本地进行，敏感信息不外传

## 🔧 故障排除

### ❓ 扩展无法加载
- 确保文件夹完整，包含所有必需文件
- 检查 [manifest.json](manifest.json) 格式是否正确
- 尝试重新加载扩展

### ❓ API 配置无效
- 验证 Base URL 和 API Key 的正确性
- 检查网络连接和 API 服务状态
- 确认模型名称是否支持

### ❓ 分析失败
- 检查是否在有效的 GitHub Python 项目页面
- 确认仓库包含 Python 文件
- 查看浏览器控制台的错误信息

### ❓ 结果不准确
- 扩展分析基于静态 import，可能遗漏动态导入
- 复杂项目建议手动 review 生成的配置

## 🛠️ 开发和贡献

### 💻 本地开发
1. 修改代码文件
2. 在扩展管理页面点击"重新加载"
3. 测试修改效果

### 🐛 调试技巧
- 使用 `console.log()` 在控制台查看调试信息
- 检查后台页面: 扩展管理 → 扩展详情 → 后台页面
- 分析网络请求: 开发者工具 → 网络面板

### 🔌 扩展 API
扩展使用了 Chrome Extension Manifest V3 API:
- `chrome.scripting`: 内容脚本注入
- `chrome.storage`: 配置存储
- `chrome.sidePanel`: 侧边面板管理

## 📄 许可证

[MIT License](../LICENSE)

## 🔗 相关链接

- [Chrome 扩展开发文档](https://developer.chrome.com/docs/extensions/)
- [GitHub API 文档](https://docs.github.com/en/rest)
- [OpenAI API 参考](https://platform.openai.com/docs/api-reference)