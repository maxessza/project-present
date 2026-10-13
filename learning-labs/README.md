# Smart Water Boat — shared interactive learning previews

Preview branch: `preview/interactive-learning-labs`. This folder adds the current teaching experiments without replacing the existing website or changing `main`.

## Open without installing anything
1. Download this branch as ZIP and extract it.
2. Open **`learning-labs/site/labs.html`** in Chrome, Edge or Firefox.
3. Choose Story Lab, Heading/PID Lab, Classroom or Overall. The site uses local classic JavaScript/CSS/assets and does not connect to a boat.

## Clone and run a local server (optional)
```sh
git clone --branch preview/interactive-learning-labs --single-branch https://github.com/maxessza/project-present.git
cd project-present
python -m http.server 8765 --bind 127.0.0.1
```
Open `http://127.0.0.1:8765/learning-labs/site/labs.html`. On a system where the interpreter is named `python3`, use that instead of `python`.

For an existing clean clone:
```sh
git fetch origin
git switch --track origin/preview/interactive-learning-labs
```
Do not overwrite a dirty working tree; keep your work before switching. If this branch already exists locally, switch to it and use `git pull --ff-only`.

## Included pages
- `site/story.html`: four scenes separating START request, readiness, permission, motor activity and illustrative movement to WP1. Restoring HOME after a rejected command does not resend START.
- `site/heading.html`: two heading arrows with shared target and disturbance, separate P/I/D settings, computed signed-error traces, play/pause/manual-step/replay. The toy plant rotates in place and is NOT a firmware port or real boat tuning tool.
- `site/learn.html`: startup lesson, readiness experiments and two short isolated questions.
- `site/index.html`: inherited Overall system, nine-point illustrative grid/startup, mission simulation and existing technical labs.
- `site/waypoints.html`, `heatmap.html`, `sensors.html`, `slides.html`: existing project pages, retained rather than redesigned.

## Evidence and limits
The original prototype source/test bytes are listed in `SOURCE_SHA256.json`. Existing current software evidence before packaging: Story19 unit tests and14 Chromium cases; Heading11 unit tests and24 Chromium cases; Classroom9 new unit tests. The packaging smoke additionally checks the assembled unit suite, links and primary teaching paths from a fresh checkout. These are separate scopes, not a combined hardware acceptance score.

- **Heading independent review: NOT VERIFIED.** Its bounded review stopped before the final verdict; chronology evidence (timestamps and original reduced-motion RED) is incomplete.
- **Story UI review: PASS; overall process: HELD.** Original TDD chronology hold remains.
- **Classroom independent review: NOT VERIFIED; process gap remains.**
- Inherited Overall/mission/labs have their earlier unresolved acceptance holds; sharing does not waive them. Existing unrelated display/copy findings were not bundled into this publication task.
- Arrows, routes, timing, readiness and measurements are illustrative. No GPS/PWM/telemetry is live; presets are not calibrated gains. GRID uses PI plus heading-rate damping, not identical PID in every mode.
- Source sharing is not release certification, projector/bench/pond validation or permission to operate motors. Owner still evaluates presentation readability and teaching effectiveness.

No Obsidian notes, credentials, internal worker logs, firmware source or private absolute workstation paths are included. No GitHub Pages or other public hosting is configured by this preview push; GitHub's file view does not execute HTML. Download/clone and open the entry page as above.

## Run existing unit tests
Requires Node.js (not required just to view the pages):
```sh
node --test learning-labs/tests/*.test.js
```
Tests load the actual bundled model and adapter files. No dependency install is required.
