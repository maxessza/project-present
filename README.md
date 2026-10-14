# Smart Water Boat

This site explains the project and provides browser based learning simulations. Open [index.html](index.html) to reach the existing Overall experience immediately. The root redirect keeps the incoming query string and hash, so links such as `#pid` and `#ms-uplink-panel` still reach their Overall sections.

Keep the project folder together after extracting a ZIP. The pages load shared CSS, scripts, and images from `pages/`, `src/`, and `assets/`.

## Navigate the site

The shared Smart Water Boat header is available on all active pages. Its nine destinations are Overall, Waypoints, Heatmap, Sensors, Slides, Classroom, Story, Heading / PID, and Uplink. Overall links into the detailed Classroom, Story Lab, and Heading / PID lessons; those lessons link back to their relevant Overall section.

Suggested route: start with [Overall](pages/overall.html), try the [Classroom](pages/classroom.html) and [Story Lab](pages/story.html) mission lessons, explore [Uplink](pages/overall.html#ms-uplink-panel), then compare the [Heading / PID](pages/heading-pid.html) experiment. [Waypoints](pages/waypoints.html), [Sensors](pages/sensors.html), [Heatmap](pages/heatmap.html), and [Slides](pages/slides.html) add project detail.

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
- [Migration map](docs/MIGRATION_MAP.json)
- [Speaker notes](docs/SPEAKER_NOTES.md), retained as historical presentation notes
