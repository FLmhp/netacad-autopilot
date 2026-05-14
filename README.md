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
- Repeated **Start** clicks on the same page no longer reset the final-submit flow mid-run
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
2. Use the artifact or distribution channel that matches your browser:
   - Chromium browsers: there is currently **no browser-store build**, because the author has not paid the Google Chrome developer registration fee yet. Use `netacad-autopilot-<version>-manifest-v3.zip` with **Developer mode** -> **Load unpacked**.
   - Firefox: install the signed `netacad-autopilot-<version>-manifest-v2.xpi` when it is attached to an official release.
   - Manual packages: `netacad-autopilot-<version>-manifest-v3.zip` or `netacad-autopilot-<version>-manifest-v2.zip`
3. If you use a `.zip` artifact, extract it first:
   - Chromium browsers: open the extension manager, enable **Developer mode**, then choose **Load unpacked**.
   - Firefox: open `about:debugging`, choose **This Firefox**, then use **Load Temporary Add-on** and select the extracted `manifest.json`.

### Build from source

```bash
git clone https://github.com/FLmhp/netacad-autopilot.git
cd netacad-autopilot
npm install
npm run build:release
```

Release-ready artifacts are generated in `release-artifacts/`. Local builds always emit the Manifest V2 / V3 ZIP packages. A signed Firefox `.xpi` is only generated when `REQUIRE_FIREFOX_SIGNING=true`, `FIREFOX_EXTENSION_ID`, `WEB_EXT_API_KEY`, and `WEB_EXT_API_SECRET` are configured.

### Release distribution

- Official tag releases are built by `.github/workflows/release.yml`.
- There is currently no Chrome Web Store / browser-store release, because the author has not paid the Google Chrome developer registration fee yet.
- The Manifest V3 ZIP is the current Chromium manual-install package and the future browser-store submission package.
- GitHub Releases no longer ship a `.crx`, because current Chromium browsers reject external CRX installs with `CRX_REQUIRED_PROOF_MISSING`.
- The Firefox `.xpi` is produced through Mozilla signing and attached only when the signing credentials are configured for the release workflow.

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
- Repeated **Start** clicks on the same page are ignored while automation is already running, so the final-submit flow keeps its state.
- Manual solving events can arm the auto-submit pipeline, so you can mix manual triggers with automated progression.
- The codebase targets current NetAcad DOM patterns, but the platform can still change markup without notice.

## Development notes

- Main entry points:
  - `src/content/content.js` - DOM detection, answer selection, polling, and submit flow
  - `src/background/background.js` - component metadata collection
  - `src/popup/popup.js` - popup start button and live status
- Build output goes to `dist/`.
- Release artifacts are packaged into `release-artifacts/`; ZIP assets are always local-build safe, and the Firefox XPI is signing-gated.
- Both Manifest V3 and Manifest V2 metadata are present in `src/`.

## Acknowledgements

- Original project: [ingui-n/netacad-solver](https://github.com/ingui-n/netacad-solver)
- This fork extends the upstream idea with popup control, auto-submit flow, and compatibility fixes tailored to the current codebase
