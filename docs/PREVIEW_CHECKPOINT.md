# Current Overall preview checkpoint

This is a work-in-progress presentation preview, **not an accepted release or firmware safety approval**. Open the repository's `index.html`; the entry redirects to `pages/overall.html` and keeps the supporting files together.

## Included

- One START-driven Overall movie using the existing shared mission model and event-linked chapters.
- A navigation explanation showing recorded position/projection, LOS aim, waypoint acceptance region, target/compass heading and signed final-drive PWM.
- Removal of the presentation's unintended automatic FORCE_RTH after spiral scanning. The native browser journey resumes the pending GRID target, completes all nine example waypoints, returns HOME and reaches the model's COMPLETE/stopped state. Explicit manual FORCE_RTH remains available.
- Removal of the gold marker ahead of the cyan boat glyph, and explicit station icon/text styling after the map is moved into the movie stage.
- Existing other pages and detailed Heading/PID lab retained. Older standalone experiments remain in the repository; they are not additional authoritative mission runtimes for Overall.

## Verified boundary and remaining work

Coordinator browser checks on the current source: **28/29 passed**. The failed check is presentation layout: on a 1264x800 desktop, the navigation mechanism is below the initial viewport and needs scrolling. Acceptance-transition geometry and final integrated-map coverage are not fully verified. Owner/projector acceptance and independent review remain **NOT VERIFIED**.

Node checks with the explicit read-only firmware checkout configured: **154/156 passed**, with the same two failures in the frozen pre-change baseline and this candidate: the expected stylesheet-version literal and the migration/source-hash map. These failures are not waived or described as green CI.

The builder reached its runtime cap. The coordinator recovered and checked the partial artifact without restarting the worker or purchasing another review. This checkpoint does not close earlier review/process or firmware/navigation/safety/concurrency/packet-ABI gates.

## Local checks

Browser use needs no real boat, radio, credentials or firmware checkout. Inputs and hull motion are illustrative; MessageChannel and memory logs are not ESP-NOW or a physical SD card.

For source-binding/native tests, configure `OVERALL_FIRMWARE_ROOT` to your own read-only firmware checkout. The native GRID test also supports `GRID_FIRMWARE_ROOT`, `CXX`, and `GRID_EVIDENCE_DIR`; put generated verification output outside the website. Maintainer-specific paths in historical documents/tests are not portable installation requirements.

Raw local agent logs, private work ledgers, compiled test executables and runtime evidence are deliberately excluded from this Git preview. No main merge or hosting/deployment change is included.
