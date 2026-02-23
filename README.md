# RSSive

RSSive 是一个基于 React + TypeScript 的 RSS 阅读器，支持 Web 与 Desktop（Electron）双运行形态，包含 AI 摘要/翻译、TTS 朗读、离线缓存与多语言界面等能力。

## 主要功能

- RSS 订阅管理（新增、编辑、删除、分类）
- 时间线阅读与文章详情解析（Readability）
- AI 摘要与翻译
- TTS 朗读（多 Provider 配置）
- Web / Desktop 双端运行
- 离线缓存与基础开发日志导出

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS
- 路由：React Router
- 代理服务：Node.js（`server/rss-proxy.js`）
- 桌面端：Electron（`desktop/`）

## 环境要求

- Node.js（建议 LTS 版本）
- npm

## 快速开始（Web）

1. 安装依赖

```bash
npm install
```

2. 启动 RSS 代理（终端 1）

```bash
npm run proxy
```

3. 启动前端开发服务（终端 2）

```bash
npm run dev
```

4. 浏览器访问（默认）

```text
http://localhost:5173
```

## 快速开始（Desktop）

1. 安装根依赖与桌面端依赖

```bash
npm install
npm --prefix desktop install
```

2. 启动桌面开发模式

```bash
npm run desktop:dev
```

## 构建与预览

```bash
npm run build
npm run preview
```

桌面端构建：

```bash
npm run desktop:build
```

Windows 打包（在项目根目录执行）：

```bash
npm --prefix desktop run pack:win
```

## 常用脚本

```bash
# Web 开发
npm run dev

# RSS 代理
npm run proxy

# 前端构建
npm run build

# 桌面开发/构建
npm run desktop:dev
npm run desktop:build

# 发布基线检查
npm run verify:release-baseline
```

## 目录结构

```text
.
├─src/                 # 前端主代码
│  ├─app/              # 主壳与页面
│  ├─modules/          # AI / RSS / TTS / 阅读 / i18n / 离线等模块
│  └─shared/           # 跨模块共享状态与服务
├─server/              # Web 代理服务
├─desktop/             # Electron 桌面端
├─scripts/             # 工具脚本（如发布基线检查）
└─memory-bank/         # 项目文档与过程记录
```

## 配置说明（可选）

`server/rss-proxy.js` 支持通过环境变量覆盖部分参数，例如：

- `RSS_PROXY_PORT`
- `RSS_PROXY_TIMEOUT`
- `RSS_PROXY_GLOBAL_CONCURRENCY`
- `RSS_PROXY_HOST_CONCURRENCY`
- `QWEN_TTS_API_BASE`
- `QWEN_TTS_MODEL`
- `QWEN_TTS_VOICE`

PowerShell 示例：

```powershell
$env:RSS_PROXY_PORT=8787
npm run proxy
```

## 发布前建议

- 运行 `npm run verify:release-baseline`
- 确认未提交本地构建产物（如 `desktop/release/`）
- 确认未包含本地密钥、数据库快照和 `.env` 私密文件

## 许可证

本项目使用 `LICENSE` 中声明的许可证。
