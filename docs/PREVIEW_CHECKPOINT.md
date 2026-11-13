# Current Overall presentation checkpoint — 2026-11-13

This commit saves the current displayed website **as a preview, not an accepted release**. Open `index.html` to enter `pages/overall.html`; keep the complete extracted project tree together. See [Thai operating guide](PRESENTATION_GUIDE_TH.md).

## Known visible issue — NOT fixed in this checkpoint

After WP2, when the boat resumes GRID travel toward WP3, the movie can remain on **พักเรือและวัดน้ำ** and hide its navigation explanation. The model continues navigating and the hidden segment labels update, but the selected presentation chapter does not return to navigation. The current movie advances through its chapters only once.

Native reproduction on this source observed navigation visible for Start→WP1 and WP1→WP2, then hidden during moving WP2→WP3 while the displayed chapter remained `water`. Publishing this snapshot does not repair or accept that behavior. Continuous per-leg explanation is pending; no controller/route changes were made for this publication.

## Included current behavior

- One START-driven Overall movie, short Thai system/role/measurement explanations, existing common mission state and optional technical details.
- Navigation geometry, LOS aim, acceptance region, target/compass heading and signed applied motor outputs. These are browser-model values, not live vessel measurements.
- A labelled persistent synthetic turbidity scenario demonstrating all25 scan targets without removing safety/clear-abort logic; continued survey and route-complete return HOME.
- Correct report-table DOM ownership for all9 transmitted fields, actual browser receiver identity, RESET and replay.
- RESET clears the mission/report/timers while preserving explicit user settings/faults; presentation-owned temporary turbidity is released rather than silently replacing user input.
- Rendered SVG font sizing and separated boat/HOME and short-leg A/B captions. Other pages and detailed Heading/PID lab remain present.

## Evidence and honest limits

Retained source-bound native evidence includes two full movies44/44 (8chapters,25scan targets,9accepted survey points, HOME/COMPLETE/applied0-0), report9/9, reset configuration4/4, natural ownership/takeover8/8, and trusted real-tab visibility7/7. The final change after the full-movie evidence was only one CSS caption translation; unchanged runtime evidence was reused after checking relevance, not described as a newly rerun full mission. A separate independent natural short-leg caption probe passed12/12 at1366/1264/390, with source/archive guards.

**Full independent acceptance remains NOT VERIFIED:** the final bounded review produced a scoped caption PASS report and raw passing checks but timed out before completing its final machine ledger/results/handoff. Earlier passing assertions do not establish continuous explanatory correctness after every waypoint, as the known issue above demonstrates. No claim is made that the entire historical Node/CI suite is green.

Owner/audience/projector acceptance, real boat/sensors/GPS/Compass/radio/e-stop/motor/SD/bench/pond validation and the reserved high-risk algorithm approval remain NOT VERIFIED. This browser simulation is not calibrated vessel physics, ESP-NOW, physical SD durability or a real-water safety assessment.

## Publication boundary

This is a normal preview-branch checkpoint only: no main merge, force push, hosting setting, deployment, firmware edit or additional paid implementation/review. An isolated publication worktree preserves the original dirty source/index. Local worker logs, raw evidence, executables and credentials are excluded. Workstation-bound documents/tests are not newly copied; their existing upstream history is preserved. Previously published historical documentation remains historical, not current acceptance evidence.
