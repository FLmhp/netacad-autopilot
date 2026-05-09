[![Release](https://img.shields.io/github/v/release/FLmhp/netacad-autopilot?display_name=tag)](https://github.com/FLmhp/netacad-autopilot/releases)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-2563eb)](https://github.com/FLmhp/netacad-autopilot)
[![Workflow](https://img.shields.io/badge/workflow-popup%20trigger%20%2B%20auto--submit-10b981)](https://github.com/FLmhp/netacad-autopilot)
[![Upstream Fork](https://img.shields.io/badge/fork-ingui--n%2Fnetacad--solver-f59e0b)](https://github.com/ingui-n/netacad-solver)

# NetAcad Autopilot

<!-- README-I18N:START -->

**English** | [简体中文](./README.zh-CN.md)

<!-- README-I18N:END -->

NetAcad Autopilot is a maintained fork of [ingui-n/netacad-solver](https://github.com/ingui-n/netacad-solver) focused on modern NetAcad assessment flows. It keeps the original click / `Ctrl`-hover solving experience, then adds popup-driven automation, auto-submit polling, restart-safety fixes, and broader compatibility for adaptive components.

<img alt="NetAcad Autopilot screenshot" width="300" src="assets/screenshots/my-offer.jpg"/>

## Highlights

- Popup-triggered automation with live status feedback
- Automatic answer selection plus 1-second submit polling to avoid stuck states
- Original manual solving still works: click a question or hold `Ctrl` while hovering answers
- Expanded compatibility for MCQ, matching, dropdown, yes/no, fill-in-the-blank, table, and open-text style components
- Restart-safe DOM reprocessing to reduce endless rebuild loops after extension reloads

## Why this fork

| Area | Upstream project | NetAcad Autopilot |
| --- | --- | --- |
| Trigger model | Click / hover only | Popup start plus original manual triggers |
| Submission flow | Manual submit | Automatic submit with polling and retry |
| Runtime feedback | No dedicated UI | Popup status for waiting / answering / submitting / completed |
| Adaptive assessment handling | Limited | Extra fallbacks for adaptive MCQ / matching layouts |
| Restart behavior | Can drift on dynamic pages | Added safeguards against repeated reprocessing loops |

## Installation

### Install from release

1. Open the [latest release](https://github.com/FLmhp/netacad-autopilot/releases/latest).
2. Download the packaged `dist.zip` artifact, or the source archive if you prefer building locally.
3. Extract the archive and load the unpacked `dist/` folder in your browser's extension manager.

### Build from source

```bash
git clone https://github.com/FLmhp/netacad-autopilot.git
cd netacad-autopilot
npm install
npm run build
```

Then load the generated `dist/` folder as an unpacked extension.

## Usage

1. Open a supported NetAcad assessment page.
2. Use one of these entry points:
   - Open the extension popup and click **Start**
   - Click the question area directly
   - Hold `Ctrl` and hover supported answer targets
3. The extension selects answers, polls the submit button every second, and submits once the page is ready.
4. On the final confirmation step, it checks the confirmation box, submits, and stops the automation flow.

## Current behavior

- The popup shows the current runtime status (`Idle`, `Waiting`, `Answering`, `Submitting`, `Completed`).
- Manual solving events can arm the auto-submit pipeline, so you can mix manual triggers with automated progression.
- The codebase targets current NetAcad DOM patterns, but the platform can still change markup without notice.

## Development notes

- Main entry points:
  - `src/content/content.js` - DOM detection, answer selection, polling, and submit flow
  - `src/background/background.js` - component metadata collection
  - `src/popup/popup.js` - popup start button and live status
- Build output goes to `dist/`.
- Both Manifest V3 and Manifest V2 metadata are present in `src/`.

## Acknowledgements

- Original project: [ingui-n/netacad-solver](https://github.com/ingui-n/netacad-solver)
- This fork extends the upstream idea with popup control, auto-submit flow, and compatibility fixes tailored to the current codebase
