[![Release](https://img.shields.io/github/v/release/FLmhp/netacad-autopilot?display_name=tag)](https://github.com/FLmhp/netacad-autopilot/releases)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-2563eb)](https://github.com/FLmhp/netacad-autopilot)
[![Workflow](https://img.shields.io/badge/workflow-popup%20trigger%20%2B%20auto--submit-10b981)](https://github.com/FLmhp/netacad-autopilot)
[![Upstream Fork](https://img.shields.io/badge/fork-ingui--n%2Fnetacad--solver-f59e0b)](https://github.com/ingui-n/netacad-solver)

# NetAcad Autopilot

<!-- README-I18N:START -->

[English](./README.md) | **简体中文**

<!-- README-I18N:END -->

NetAcad Autopilot 是基于 [ingui-n/netacad-solver](https://github.com/ingui-n/netacad-solver) 持续改进的分支，面向更新的 NetAcad 测评流程。它保留了原项目“点击题目 / 按住 `Ctrl` 悬停答案自动解题”的体验，并进一步加入了弹窗触发、自动提交轮询、重启稳定性修复，以及对更多自适应组件的兼容。

<img alt="NetAcad Autopilot 截图" width="300" src="assets/screenshots/my-offer.jpg"/>

## 亮点

- 通过扩展弹窗启动自动流程，并显示实时状态
- 自动选答案后以 1 秒轮询方式等待提交按钮可用，降低卡死概率
- 原有手动解题方式仍可使用：点击题目，或按住 `Ctrl` 悬停答案
- 扩展了对 MCQ、匹配题、下拉题、是非题、填空题、表格题、开放文本题等组件的兼容
- 增加了扩展重启后的重建保护，减少动态页面上的循环扫描

## 相比原项目的优势

| 维度 | 上游项目 | NetAcad Autopilot |
| --- | --- | --- |
| 触发方式 | 仅点击 / 悬停 | 弹窗启动 + 保留原有手动触发 |
| 提交流程 | 需要手动提交 | 自动轮询提交并带重试 |
| 运行反馈 | 无专门状态界面 | 弹窗显示等待 / 解题 / 提交 / 完成状态 |
| 自适应测评兼容 | 较有限 | 增加了针对自适应 MCQ / 匹配题布局的兜底 |
| 重启稳定性 | 动态页面上可能反复重建 | 加入了循环重建防护 |

## 安装

### 从 Release 安装

1. 打开 [最新 Release](https://github.com/FLmhp/netacad-autopilot/releases/latest)。
2. 下载打包好的 `dist.zip` 产物，或者下载源码自行构建。
3. 解压后，在浏览器扩展管理页中加载其中的 `dist/` 目录。

### 从源码构建

```bash
git clone https://github.com/FLmhp/netacad-autopilot.git
cd netacad-autopilot
npm install
npm run build
```

构建完成后，将生成的 `dist/` 目录作为未打包扩展加载。

## 使用方式

1. 打开受支持的 NetAcad 测评页面。
2. 通过以下任一入口启动：
   - 打开扩展弹窗并点击 **Start**
   - 直接点击题目区域
   - 按住 `Ctrl` 并悬停在受支持的答案目标上
3. 插件会自动选择答案，并以 1 秒间隔轮询提交按钮，在页面可提交时自动提交。
4. 到最终确认步骤时，会自动勾选确认框、提交，并停止自动流程。

## 当前行为说明

- 弹窗会显示当前运行状态（`Idle`、`Waiting`、`Answering`、`Submitting`、`Completed`）。
- 手动解题操作会自动接管后续提交流程，因此可以混合使用手动触发与自动推进。
- 代码当前针对现有 NetAcad DOM 结构做了兼容，但平台后续仍可能调整页面标记。

## 开发说明

- 主要入口：
  - `src/content/content.js` - DOM 识别、答题、轮询和提交流程
  - `src/background/background.js` - 组件元数据采集
  - `src/popup/popup.js` - 弹窗启动按钮与状态同步
- 构建产物输出到 `dist/`。
- `src/` 中同时保留了 Manifest V3 与 Manifest V2 元数据。

## 致谢

- 原始项目：[ingui-n/netacad-solver](https://github.com/ingui-n/netacad-solver)
- 本分支在原思路基础上增加了弹窗控制、自动提交流程和针对当前代码库的兼容性修复
