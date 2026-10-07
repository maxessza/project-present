# Smart Water Surface Boat Web Presentation

A static, GitHub Pages-ready project site and 20-slide web presentation built from the project report and selected implementation excerpts. It uses plain HTML, CSS, and JavaScript, with no build step or package installation.

## Open locally

Open index.html in a browser for the project overview. Open slides.html for the full slide deck. The pages work as a standalone folder because code and images use relative paths.

Use Left/Right arrows or Space to move between slides. Press F for fullscreen. Keep all project files and the assets folder together; the slide viewer shows a setup message if slide data is missing.

The site navigation has five sections: Overall, Waypoints, Heatmap, Sensors and Slides. The heat-map page explains the IDW method; it does not show sample measurements because the supplied report includes no field dataset.

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
