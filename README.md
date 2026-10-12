# Smart Water Surface Boat Web Presentation

A static, GitHub Pages-ready project site and 20-slide web presentation built from the project report and selected implementation excerpts. It uses plain HTML, CSS, and JavaScript, with no build step or package installation.

## Shared interactive preview

The current interactive version is on branch `preview/boat-system-motion`; `main` is intentionally unchanged.

```bash
git clone --branch preview/boat-system-motion --single-branch https://github.com/maxessza/project-present.git
cd project-present
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/` and hard-refresh if necessary. On systems where Python is named `python3`, use that executable instead. No npm install or build is needed.

If you already have a clean clone:

```bash
git fetch origin
git switch --track origin/preview/boat-system-motion
# For subsequent updates, while on this branch:
git pull --ff-only
```

If this branch already exists locally, use `git switch preview/boat-system-motion` instead. Preserve or commit your own changes before switching; do not reset them to follow this guide.

- **Learn / Overview:** animated SMA, GRID-to-SPIRAL, task/radio/SD data flow, and HOME gates.
- **PID / Heading:** remaining heading error, qualitative P/I/D roles, PWM-command mixing and compass feedback.
- **Operate:** whole-mission simulation, checkpoints, What-if, RTH lab and retained technical details.
- Each teaching diagram has play/pause, next and reset; keyboard controls and reduced-motion preferences are supported.

This is a **shared educational prototype**, not a reviewed production/boat release. Read [PREVIEW_STATUS.md](PREVIEW_STATUS.md) for the verification boundary and remaining process holds. Values, timing and geometry are illustrative; no real boat connection, field dataset or measured PID response is included. Sharing this branch does not certify firmware or confirm backend/dashboard packet delivery.

## Open locally

Open index.html in a browser for the project overview. Open slides.html for the full slide deck. The pages work as a standalone folder because code and images use relative paths.

Use Left/Right arrows or Space to move between slides. Press F for fullscreen. Keep all project files and the assets folder together; the slide viewer shows a setup message if slide data is missing.

The site navigation has five sections: Overall, Waypoints, Heatmap, Sensors and Slides. The heat-map page explains the IDW method; it does not show sample measurements because the supplied report includes no field dataset.

## Overall mission mockup

The Overall page includes an offline SVG mission simulation. Its teaching flow asks why the boat does not start the spiral at WP1, then follows five stages: pass WP1, continue along GRID, calculate SMA(8), check safety before SPIRAL, and return HOME using RTH. The anomaly scene shows eight mock turbidity values, the 50 NTU threshold, and their 78 NTU mean as a bar chart. The boat approaches and confirms WP1, advances the Navigator index, and continues along the grid toward WP2. Only then can an anomaly move the FSM into SPIRAL, provided safety allows it; the spiral center is illustrated midway along the WP1–WP2 grid leg to show a current GPS fix after WP1, not WP1 itself. This offset is schematic, not a claimed real distance. During the spiral, it generates each target at a 45-degree increment and travels to that target before revealing the next one. After WP9, the mockup depicts firmware RTH as a direct-bearing leg to the stored SET_HOME fix; it stops at an illustrative 4 m arrival ring, holds for the 3-second confirmation, then enters STANDBY. The RTH leg is animated but its trail is hidden so the map only draws the planned route inside the grid. Use Start/Pause, Next step, Reset and the speed selector.

The spiral explanation follows the locally inspected 1_Firmware source: an 8-sample turbidity average above 50 NTU (or a sustained baseline deviation), a fixed GPS center, Archimedean radius 4–8 m, 45-degree increments and 3 turns (25 targets). Each target is revealed in order with its angle, radius and east/north offset before the boat travels to it. On exit, GRID resumes the existing Navigator index rather than selecting the nearest waypoint. Timeout, clean-water exit, safety priority and cooldown rules are explained separately; the animated scenario demonstrates normal completion.

All sensor readings and animation timings are illustrative; no boat connection or API is used. The simulated anomaly is the rolling turbidity check after WP1; temperature and pH do not trigger the spiral. Firmware also schedules quiet measurement holds every two waypoint boundaries (3-second settle plus 5-second measurement). Additional spiral readings and physical GPS/PID behavior are not simulated.

Edit overall.js for the scenario and decision messages, overall.css for its appearance, and index.html for the markup. The simulation starts only after user input and pauses when the tab is hidden.

## Update the presentation

Edit slides-data.js. It contains the slide content as a JavaScript array named window.presentationSlides.

- Update titles, descriptions, code excerpts, and source notes in the slide objects.
- Add another object to the array to add a slide.
- Use an existing type: cover, story, flow, code, diagram, phases, or closing.
- Add images under assets/ and reference them with a relative path such as assets/new-diagram.png.
- styles.css controls the visual design. app.js renders the slide types and handles navigation.

For a Thai talk track for all 20 slides, open speaker-notes-th.md. It also flags details that the source report does not quantify, such as threshold values and field-test results. site.css controls the five-section website; styles.css controls the slide viewer.

The code excerpts are selected from the supplied main.py and dashboard.html. The complete backend and dashboard files are not copied into this presentation project.

## Upload and publish with GitHub Pages

1. Create a GitHub repository and upload the contents of this folder to the repository root.
2. In the repository, open Settings → Pages.
3. Choose Deploy from a branch, then select the branch and /(root) folder containing index.html.
4. Save. Later pushes to that publishing branch update the site.

See the official [GitHub Pages publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

GitHub Pages publishes the selected files on the web. Keep passwords and private credentials out of the repository.

## Important source-code security note

The supplied main.py contains a database password directly in source code. This presentation does not include that value or copy the backend file. Before publishing the backend source, rotate that database credential and move credentials into environment variables. Do not upload the supplied main.py unchanged.

The IDW routine is present in dashboard.html, but the calls that start its general heat-map refresh are commented out in the supplied dashboard initialization. Confirm which heat-map view is active before describing it as automatically refreshing.

## Sources

- BETA TEST.docx — project description, system design, hardware wiring, and mission workflow.
- main.py — telemetry model, mission endpoints, sweep route generation, and mission summary query.
- dashboard.html — live dashboard refresh intervals, mission history, and IDW heat-map routine.

The source report does not include quantified field-performance results. The slides avoid adding sample measurements.
