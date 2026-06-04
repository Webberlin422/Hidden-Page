# 隐页 HiddenPage

HiddenPage 是一个运行在 Windows 上的轻量本地小说阅读器，基于 Electron + TypeScript + Vite 构建。它主打托盘常驻、快捷隐藏、快速恢复和简洁阅读界面，适合在工作或学习场景中安静阅读 TXT 小说。

## 功能特点

- 托盘常驻，窗口不显示在 Windows 任务栏
- 阅读页和设置页分离，打开程序默认进入阅读页
- 阅读页极简，只保留小说内容显示区域
- 支持从托盘菜单打开本地 TXT 小说
- 支持拖拽 TXT 文件到阅读页打开
- 支持阅读进度自动保存
- 支持全局快捷键隐藏或显示阅读页
- 支持自定义快捷键
- 设置页支持快捷键录入模式，点击输入框后直接按下新快捷键即可替换
- 提供最近打开记录

## 默认快捷键

- `Alt + M`：隐藏或显示阅读页
- `Alt + ,`：上一页
- `Alt + .`：下一页

快捷键可以在设置页中修改。

## 使用方式

1. 启动程序后，应用会直接进入阅读页。
2. 从托盘菜单选择“打开小说”，导入本地 TXT 文件。
3. 使用快捷键翻页，或在阅读页中滚动阅读。
4. 需要修改快捷键时，从托盘菜单打开设置页进行配置。
5. 按 `Alt + M` 可快速隐藏或显示阅读页。

## 运行要求

- Windows 10 / 11
- Node.js 18+
- npm

## 本地运行

安装依赖：

```bash
npm install
```

开发模式运行：

```bash
npm run dev
```

构建项目：

```bash
npm run build
```

## 项目结构

```bash
Hidden-Page/
├── electron/
│   ├── main.ts              # 应用入口、IPC 注册、生命周期
│   ├── preload.ts            # contextBridge API
│   ├── shortcuts.ts          # 全局快捷键注册
│   ├── state.ts              # 共享状态管理
│   └── types.ts              # 共享类型定义
├── novels/
│   ├── book-of-the-lantern-river.txt
│   └── whisper-in-the-rain.txt
├── src/
│   ├── app.ts                # 渲染进程入口、模式调度
│   ├── picker.ts             # 屏幕取色器模块
│   ├── styles/
│   │   └── app.css
│   ├── types/
│   │   ├── global.d.ts       # window.hiddenPage 类型声明
│   │   └── styles.d.ts       # CSS 模块声明
│   └── utils/
│       ├── shortcut.ts       # 快捷键解析/匹配
│       └── storage.ts        # localStorage 封装
├── assets/
│   ├── icon.ico
│   └── icon.png
├── .editorconfig
├── .gitignore
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── readme.md
```

## 说明

- 当前版本优先支持 TXT 阅读。
- 设置会保存在本地，不依赖云端账号。
- 示例小说文件位于 `novels/whisper-in-the-rain.txt`。

## 开发说明

如果你想继续扩展这个项目，比较适合的方向是：

- 增加 EPUB 支持
- 增加字体、行距、背景色等阅读样式设置
- 增加主题切换
- 增加更完整的分页与书签功能
- 增加导入历史和书库管理
