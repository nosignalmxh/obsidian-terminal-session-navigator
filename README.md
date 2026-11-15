# Terminal Session Navigator · 终端会话导航

A lightweight Obsidian desktop plugin that adds a vertical, searchable list of existing Terminal tabs, with custom names, groups, and click-to-switch navigation. Keep using your terminal and Codex CLI. The current interface is in Chinese.

给 Obsidian 的 [Terminal（polyipseity）](https://github.com/polyipseity/obsidian-terminal) 插件增加一个纵向会话列表。终端很多时，可以通过任务名和分组找到目标，不必挨个查看顶部标签。

```text
┌──────────────────┬──────────────────────┬───────────────────┐
│ Markdown 笔记    │ 终端会话             │ 原有 Terminal     │
│                  │ 搜索名称、分组或目录 │                   │
│ 项目记录         │ ▾ 科研               │ 当前选中的终端    │
│ 上下文文档       │   项目 A：修改论文   │ Codex CLI / shell │
│ 每日任务         │   项目 B：检查实验   │                   │
│                  │ ▸ 生活               │                   │
└──────────────────┴──────────────────────┴───────────────────┘
```

上图是布局示意。终端位于右侧栏时，新建列表默认插在主区域 Markdown 与右侧终端之间；布局不同的 vault 可以自行拖动列表面板。

## 功能

- 自动列出当前打开的 Terminal 标签，点击切换并聚焦原终端。
- 双击、右键或点击条目右侧 `⋯`，设置容易识别的任务名称。
- 新增、重命名、折叠分组，以及移动会话；预设分组为「科研」「Simple」「生活」。
- 按名称、分组或工作目录搜索；搜索时临时展开匹配分组。
- 名称自动换行，列表纵向滚动，面板宽度可拖动调整。
- 支持键盘操作和 Obsidian 命令面板。

纯 JavaScript + CSS，无构建步骤、额外服务、npm 运行时依赖或后台轮询。

## 使用前提

1. 桌面版 Obsidian。
2. 已安装并启用 **Terminal（作者 polyipseity，插件 ID 为 `terminal`）**，能够打开集成终端。Terminal 本身的安装和环境要求见[上游说明](https://github.com/polyipseity/obsidian-terminal)。
3. 要在终端中使用 Codex，请自行安装并配置 Codex CLI。导航插件本身不依赖 Codex，也可以导航普通 shell。

已实际验证：macOS、Obsidian **1.14.5**、Terminal **3.23.0**。清单声明的最低 Obsidian 版本为 1.5.0，但尚未在该旧版本或 Windows/Linux 上实测。本插件按 Terminal 的视图类型、工作目录和聚焦接口进行适配；上游接口变化可能需要相应更新。详见 [VALIDATION.md](VALIDATION.md)。

## 安装

当前采用 GitHub 分发，尚未收录进 Obsidian 社区插件目录。

[下载 0.1.1 安装包](https://github.com/nosignalmxh/obsidian-terminal-session-navigator/releases/download/0.1.1/terminal-session-navigator-0.1.1.zip) · [查看所有版本](https://github.com/nosignalmxh/obsidian-terminal-session-navigator/releases)

1. 先安装、启用 Terminal，并确认其集成终端可用。
2. 从上方安装包解压出 `terminal-session-navigator` 文件夹，放到 vault 的 `.obsidian/plugins/` 中。也可以从源码或 Release 单独复制以下三个文件：

   ```text
   <vault>/.obsidian/plugins/terminal-session-navigator/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

3. 打开「设置 → 第三方插件」，启用 **终端会话导航**。
4. 点击工具栏的列表树图标，或在命令面板运行 **终端会话导航：打开终端会话列表**。

如果新插件没有出现在列表中，可关闭后重新打开设置面板。仍无法识别时，先结束或妥善保存正在运行的终端任务，再重启 Obsidian。

首次打开时，列表优先出现在主区域可见 Markdown 的右侧，目标宽度约 240px；没有主区域 Markdown 时使用左侧栏。已有面板的位置和手动调整的宽度会保留。

更新时只替换上述三个文件，并停用后重新启用本插件；保留原来的 `data.json`，其中存有你的别名和分组。安装或更新导航插件不需要重载 Terminal。

## 日常使用

| 操作 | 方法 |
| --- | --- |
| 查看某个终端 | 点击对应条目 |
| 设置任务名 | 双击条目，或 `⋯ → 重命名`；留空恢复默认名称 |
| 移入分组 | 条目 `⋯ → 移动到分组…` |
| 新建分组 | 顶部文件夹加号，或分组选择窗口中的新建按钮 |
| 重命名／移除分组 | 分组标题右侧 `⋯` |
| 折叠分组 | 点击分组标题 |
| 搜索 | 输入任务名称、分组或目录；Esc 清空 |
| 键盘切换 | 搜索框中按 ↓ 进入列表；列表中 ↑/↓ 移动，Enter 切换，F2 重命名 |

搜索框中按 Enter 可切换到第一条匹配结果。清空搜索后，分组恢复原来的折叠状态。移除分组会把会话移回「未分组」。

可在 Obsidian「快捷键」中为打开列表、搜索、重命名当前终端、将当前终端移入分组和新建分组设置快捷键。

## 名称、数据和会话恢复

名称是导航列表中的别名，与原 Terminal 标签标题及终端内程序的会话名称独立。别名绑定 Obsidian 的终端标签 ID，所以同一目录下的多个终端可以分别命名。

- 名称、分组、编号和折叠状态保存在本插件目录的 `data.json`。该文件属于个人配置，已被仓库的 `.gitignore` 排除。
- Obsidian 恢复相同标签 ID 时，插件可以重新关联这些元数据。关闭后新建的标签具有新的身份，需要重新命名。
- 在同一个终端里改开另一项任务，列表中的别名会保留，可以手动修改。
- 本插件自身没有网络请求，也不解析或复制终端输出、笔记正文、模型聊天记录。

终端进程及 Codex 会话由原 Terminal 和 Codex 管理。本插件不提供进程保活、自动恢复对话或执行状态识别；选中标记表示最近激活的终端。

## 停用

在第三方插件设置中停用 **终端会话导航**，即可移除导航面板。它仅移除自己的视图，已有 Terminal 标签继续保留。需要彻底卸载时，再删除插件目录；如需保留别名和分组，先备份 `data.json`。

## 开发与验证

`main.js` 就是源码，直接编辑即可，无需 npm 安装或打包。CSS 样式位于 `styles.css`。

在支持 `node:test` 的 Node.js 环境中运行：

```bash
node --check main.js
node --test tests/terminal-session-navigator.test.cjs
```

测试覆盖同目录多终端独立命名、保存顺序、恢复元数据、聚焦原终端、删除分组、保存失败和停用行为。真实 Obsidian 中的验证范围记录在 [VALIDATION.md](VALIDATION.md)。

布局适配使用了工作区标签 ID 和部分布局对象接口；这些接口的跨版本稳定性有限。提交问题时，请附上 Obsidian、Terminal 和本插件版本，以及布局和复现步骤。

## 许可证

[MIT](LICENSE)。本仓库仅分发导航插件自己的代码；Terminal、Obsidian 和 Codex 由各自项目提供并适用各自条款。

发布流程见 [PUBLISHING.md](PUBLISHING.md)。
