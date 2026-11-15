# 维护与发布

源码仓库为 [nosignalmxh/obsidian-terminal-session-navigator](https://github.com/nosignalmxh/obsidian-terminal-session-navigator)，采用 MIT 许可证。此仓库包含插件源码及文档。个人 vault、截图、终端记录和 `data.json` 不属于分发内容。

## 一次发布需要什么

1. `manifest.json` 中的 `version` 与发布版本保持一致。
2. `versions.json` 记录该版本对应的最低 Obsidian 版本。
3. 更新 `CHANGELOG.md`，运行语法检查和现有测试；涉及界面或兼容性改动时在 Obsidian 中验证。
4. 提交源码，创建与版本完全一致的 Git 标签，例如 **`0.1.1`**，不加 `v` 前缀。
5. 创建对应的 GitHub Release，把 **`main.js`、`manifest.json`、`styles.css`** 分别上传为附件；也可附带包含这三个文件及许可证的安装 ZIP。

这些文件位置与标签规则来自 [Obsidian 官方示例插件的发布说明](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases)。

本插件没有编译步骤。发布的三个运行文件应与对应 Git 提交中的文件完全一致。安装 ZIP 解压后应有一个 `terminal-session-navigator/` 文件夹，用户将其放进 `.obsidian/plugins/` 即可。

## 代码备份与个人数据备份

GitHub 仓库用于保存插件代码、说明和版本历史。每次后续修改仍需提交并推送，GitHub 不会自动同步本机插件目录。

个人别名和分组位于已安装插件目录的 `data.json`，可随 vault 做自己的备份。它绑定终端标签 ID，只备份该文件并不等于保存了终端进程或 Codex 对话。

## 社区插件目录

发布到 GitHub 后，其他人可以直接手动安装。进入 Obsidian 内置的社区插件目录，需要另行向 `obsidianmd/obsidian-releases` 提交申请并通过审核。

官方也支持先提供公开测试版本，再考虑提交社区目录。参见 [Obsidian 社区插件分发说明](https://github.com/obsidianmd/obsidian-releases#how-community-plugins-are-pulled)。当前材料用于独立 GitHub 分发，尚未提交社区目录审核。
