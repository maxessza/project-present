# Smart Water Boat

> **Current work-in-progress preview:** see [Overall checkpoint and known limits](docs/PREVIEW_CHECKPOINT.md). This branch is not an independently accepted release.

This site explains the project and provides interactive browser demonstrations. Open [index.html](index.html) to reach the existing Overall experience immediately. The root redirect keeps the incoming query string and hash, so links such as `#pid` and `#ms-uplink-panel` still reach their Overall sections.

Keep the project folder together after extracting a ZIP. The pages load shared CSS, scripts, and images from `pages/`, `src/`, and `assets/`.

## Presentation mode

The presenter explains through diagrams and controls. Audience quizzes, prediction questions, answer checkpoints and narrative read-more blocks are removed; technical packet/log inspectors and model-only boundaries remain.

## Navigate the site

The shared Smart Water Boat header keeps five main destinations: Overall, Waypoints, Heatmap, Sensors, and Slides. Scroll Overall for its mission, PID, and Uplink sections instead of using separate top-level function entries. Classroom, Story Lab, and the detailed Heading / PID lessons are preserved through contextual links inside Overall; those lessons link back to their relevant Overall section.

Suggested route: start with [Overall](pages/overall.html), try the [Classroom](pages/classroom.html) and [Story Lab](pages/story.html) mission lessons, explore [Uplink](pages/overall.html#ms-uplink-panel), then compare the [Heading / PID](pages/heading-pid.html) experiment. [Waypoints](pages/waypoints.html), [Sensors](pages/sensors.html), [Heatmap](pages/heatmap.html), and [Slides](pages/slides.html) add project detail.

Waypoints has an interactive manual placement and 15-point Auto Sweep schematic. Heatmap lets the presenter run a boat simulation from WP1 and switch between Live, Final, and Mission views using synthetic sensor values; neither demo connects to the backend or field data.

Overall opens with a shared-state mission demo: adjust readiness, synthetic turbidity voltage, demo gains and transport faults; step or play one mission clock; and follow active equations from the sample buffer through steering and a 38-byte browser MessageChannel receiver. The route interpolation is schematic, GPS/pH/temperature are synthetic, and browser memory does not represent a physical SD card or radio link. See [equation sources and limits](docs/EQUATIONS.md).

Values in the lessons are examples or browser simulation output. The site does not connect to a boat, radio, or shore station, and Heatmap has no field-data pipeline.

## Open and verify locally

Open `index.html` directly, or run a local server from the project root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/`. Developer checks are `node --test` and `python tools/check-links.py`.

## Maintainer docs

- [File map](docs/FILE_MAP.md)
- [Website guide](docs/WEBSITE_GUIDE.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Status and limits](docs/STATUS.md)
- [Live mission equations and source limits](docs/EQUATIONS.md)
- [Migration map](docs/MIGRATION_MAP.json)
- [Speaker notes](docs/SPEAKER_NOTES.md), retained as historical presentation notes
