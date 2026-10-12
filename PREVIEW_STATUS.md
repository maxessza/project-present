# Preview status — shared for viewing and discussion

Branch: `preview/boat-system-motion`.

## Included

- Existing Overall / Waypoints / Heatmap / Sensors / Slides presentation pages and local assets.
- Whole-mission SVG simulation, technical explanations, Interactive Labs, checkpoints and What-if controls.
- Seven finite animated educational diagrams: SMA, GRID-to-SPIRAL, data flow, HOME/RTH, heading error, qualitative PID, and PWM/compass feedback.
- Controls remain usable manually with reduced motion; teaching sequences pause on visibility changes and do not silently resume.

## Evidence and limitations

- The source candidate passed 45/45 local host checks before sharing. Actual desktop and phone interactions were exercised, including the repaired SMA source-caption/incomplete-description behavior, HOME approach-before-stop geometry and a live reduced-motion change during playback. Those task-owned test logs are not bundled here; this repository is the static viewing artifact, not a claim of new GitHub CI coverage.
- The independent reviewer provided partial feedback reporting functional PASS, methodology FAIL and overall FAIL. Its complete written requirements ledger/verdict was not produced before the bounded review stopped. Full independent acceptance remains **NOT VERIFIED / HELD**.
- Original test-order deviations and batched regression ordering remain unwaived; passing tests and later browser checks do not reconstruct original test-first history. Earlier project process holds are not accepted by this preview publication.
- Owner-authorized Git sharing allows friends to view and discuss this candidate. It is not a merge into `main`, a production release, or acceptance of the outstanding process exceptions.
- Sensor values, virtual times, routes and motion cues are illustrative. There is no live telemetry, measured thrust/PID response, physical GPS/compass/noise/current simulation or field-performance claim.
- The site does not include the complete backend, hardware firmware or credentials. Backend/dashboard architecture shown in the presentation is not proof that packet delivery, wiring or every endpoint is active.
- No physical boat or projector/display validation is claimed. Verify the target display and presentation pacing yourself.

## Try it

Follow the clone/serve commands in README.md. Start with Learn, use Next to inspect the heading error, then open Operate and move through the mission checkpoints. The illustrative normal mission returns to GRID after the spiral, then uses RTH to return HOME and finally STANDBY. This does not cover every physical fault or emergency condition.
