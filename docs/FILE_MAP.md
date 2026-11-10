# แผนที่ไฟล์ที่แจกจ่าย

รายการนี้ครอบคลุมไฟล์โครงการที่แชร์ได้ทั้งหมดในชุดปัจจุบัน โดยไม่รวม `.git` และไฟล์ cache ที่ถูกละเว้น เนื้อหาในหน้าเว็บเป็นตัวอย่างเชิงการสอน เว้นแต่จะระบุว่าเป็นข้อมูลหรือการคำนวณที่หน้าเว็บทำจริง

## จุดเริ่มต้นและหน้าเว็บ

Current activation override: Overall keeps codec-only `uplink-motion.js`, `mission-kernel.js`, compatibility `autonomous-mission-model.js`, incoming/transport/presentation and `autonomous-mission.js` as the sole mission owner. `function-centered-overall.js` subscribes to snapshots for details and operates canonical mission controls for a timed caption tour; current automatic chapters do not yet synchronize the mission explanation focus. Isolated sample/RTH lab adapters remain contextual; `overall-completion.js` and legacy storyboards are not mounted. Legacy entries below describe reusable historical source, not additional active mission owners.

- `src/js/overall/function-centered-overall.js` — current timed nine-caption tour and canonical snapshot details; owns a presentation timeout, not a second mission model. Boot/reset/button fixes are verified separately; a complete causal movie is not yet delivered.
- `src/css/function-centered-overall.css` — initial builder UI base, overridden by the final flow layer.
- `src/css/function-flow.css` — final Overall-only hierarchy, causal detail and compact supporting mission layout.
- `tests/minimal-overall-browser.py` — historical three-area UI contract; its native group locators do not describe the current nine-caption tour. Preserve its results; do not claim it verifies movie playback.
- `tests/overall-story-boot-browser.py` — current native fresh boot/START regression, including preserved bounded labs and canonical mission-clock progress; requires a new `--out`.
- `tests/overall-story-reset-browser.py` — native RESET retires the story timeout, returns to intro and permits a fresh START; requires a new `--out`.
- `tests/overall-story-control-browser.py` — phone touch/off-hover START, PAUSE and RESUME computed-color readability; requires a new `--out`.
- `tests/overall-function-flow-browser.py` — preserved pre-minimal 63-check interface contract; saved results remain historical, not current three-area/disclosure acceptance.
- `tests/overall-function-regressions-browser.py` — native F1/F2/F3 regressions: real paused receipt/loss/reset, same-mode contextual PID links, and GRID/SPIRAL/RTH final-drive records; requires a fresh `--out` and preserves raw snapshots.
- `tests/function-centered-overall-browser.py` — capped builder's historical menu-layout checkpoint; its fixed builder evidence output must not be rerun over retained evidence.
- `docs/FUNCTION_CENTERED_OVERALL.md` — current activation, operation, verification/evidence and UI-versus-firmware review boundaries.

- `src/js/overall/mission-kernel.js` — canonical50ms state/plant, sample/hold/anomaly/spiral/RTH and frozen operation provenance
- `src/js/overall/mission-transport.js` — single bounded/coalesced immutable38B MessageChannel lifecycle
- `src/js/overall/autonomous-mission-model.js` — compatibility export to kernel; historical factory is never invoked
- `src/js/overall/autonomous-mission.js` — primary scene renderer, controls, source inspector and DATA shore DOM
- `src/css/autonomous-mission.css` — canonical scene/pan/controls/inspectors
- `tests/mission-policies.test.js` — behavioral policy/controller RED→GREEN and full plant mission regression
- `tests/mission-continuation-browser.py` — native single SIM/transport/loss/reset/layout evidence, Python wire decode

- `README.md` — คู่มือเปิดเว็บ เส้นทางเริ่มต้น คำสั่งตรวจในเครื่อง และลิงก์เอกสาร
- `index.html` — redirect แบบเรียบง่ายไปยัง `pages/overall.html`; ส่งต่อ query/hash เดิมและมีลิงก์ fallback ที่เข้าถึงด้วยแป้นพิมพ์ได้
- `.gitignore` — ละเว้นไฟล์สภาพแวดล้อม Python และ cache (`.env`, `.venv`, `__pycache__`)
- `.gitattributes` — เก็บ bytes ของไฟล์ตามต้นฉบับ ไม่แปลง line endings ตอน clone เพื่อรักษา hashes ของ source/tests และ migration map
- `pages/classroom.html` — หน้า Classroom; markup ของ storyboard เตรียมภารกิจ 8 ขั้น โหลดเฉพาะโมเดลและตัวควบคุมภารกิจ ไม่มีส่วนถามตอบ
- `pages/heading-pid.html` — หน้า Heading / PID; markup ของหน้าปัด A/B, target, gain controls, transport และกราฟที่ `HeadingLab` วาด
- `pages/heatmap.html` — หน้าอธิบายการประมาณค่าระหว่างจุดวัดด้วยข้อความและแผนภาพ ไม่มี script หรือชุดข้อมูลที่สร้าง heatmap จริง
- `pages/overall.html` — หน้า Overall: ผังฟังก์ชันเป็นทางเข้าหลัก เจาะ input → predicate → output ด้วย snapshot ร่วม; `#system` เป็นหลักฐานจำลองประกอบ ภาพ/controls ที่ซ้ำถูก retire จาก live DOM และไม่ mount OPERATE controller เดิม; หน้าอื่นไม่เปลี่ยน
- `pages/sensors.html` — หน้าอธิบายเซนเซอร์น้ำและโมดูลสนับสนุนด้วยเนื้อหา/ภาพ ไม่มีการอ่านค่า sensor จากอุปกรณ์
- `pages/slides.html` — โครงเวทีและ controls ของชุดสไลด์; `slides-data.js` ป้อนข้อมูลให้ `app.js`
- `pages/story.html` — หน้า Story Lab; เจ้าของ markup ของ 4 ฉาก readiness, permission, motors, movement และแผนภาพเส้นทาง WP1
- `pages/waypoints.html` — หน้าแนวคิดการวางเส้นทาง; มีแผนภาพและ code snippet เพื่ออธิบายแนวกวาด ไม่ได้ประมวลผลเส้นทางภาคสนามในหน้านี้

## ภาพประกอบ

- `assets/images/activity-flow.png` — แผนภาพลำดับกิจกรรมในหน้า Waypoints และสไลด์; ใช้เล่า workflow ไม่ได้รันภารกิจ
- `assets/images/boat-structure.png` — ภาพโครงสร้างเรือในสไลด์; เป็นแบบประกอบคำอธิบาย ไม่ใช่การตรวจยืนยันตัวเรือจริง
- `assets/images/hardware-wiring.png` — ภาพผังสายเซนเซอร์/โมดูลใน Sensors และสไลด์; เป็นภาพอ้างอิง ไม่ได้อ่านวงจรหรือยืนยัน hardware จริง

## สไตล์

- `src/css/heading.css` — รูปแบบหน้าปัดสอง lane, กราฟ, gain controls, responsive layout และ reduced-motion ของ Heading / PID
- `src/css/learning-theme.css` — ใช้ tokens สี navy/cyan เดียวกับเว็บหลักกับ Classroom, Story, Heading / PID และ Slides โดยคงสถานะ A/B และ controls เฉพาะหน้า
- `src/css/learn.css` — หัวข้อสั้น แผนภาพและ controls ของ Classroom
- `src/css/mission-start.css` — สไตล์เฉพาะ namespace `.mission-start` สำหรับ storyboard readiness, แผนที่เก้าจุด, controls และ telemetry ที่ใช้ใน Classroom/Overall
- `src/css/navigation.css` — รูปแบบลิงก์ตามบริบทจากบทเรียนกลับไปยังส่วนที่เกี่ยวข้องใน Overall
- `src/css/overall-visuals.css` — รูปแบบ SVG/diagram และสถานะการเคลื่อนไหวของตัวอย่างภาพใน Overall
- `src/css/overall.css` — layout, panels, charts, inspector และ controls ของหน้า Overall
- `src/css/site.css` — shared tokens, SW shell, touch-sized navigation และ section/card styles ของหน้า active ทั้งหมด
- `src/css/system.css` — layout responsive และสถานะภาพเฉพาะ `.system-mission`, สมการ, แผนที่, controls และ transport inspector ของฉากใหม่ใน Overall
- `src/css/story.css` — scene panels, SVG, readiness controls, responsive viewport และ reduced-motion ของ Story Lab
- `src/css/styles.css` — deck, stage, slide layouts, navigation และ responsive rules ของหน้า Slides

## JavaScript: Heading

- `src/js/heading/heading-model.js` — แบบจำลอง yaw/PID สอง lane; global `HeadingModel`, ฟังก์ชัน `wrapError`, `initial`, `control`, `advance`, `createRun`, `stepRun`, `resetRun`; ไม่มี DOM dependency
- `src/js/heading/heading.js` — controller/renderer ของหน้า Heading; global `HeadingLab`, ฟังก์ชัน `render`, `oneStep`, `syncControls`, `configure`, `frame`, `setPlaying`; ใช้ `HeadingModel`, controls และ SVG/plot ใน `heading-pid.html`

## JavaScript: mission, Overall และ Story

- `src/js/mission/mission-start-model.js` — สถานะจำลองการเตรียม/เริ่มภารกิจ; global `MissionStartModel`, ฟังก์ชัน `createState`, `advance`, `simulateGpsReady`, `setReadiness`, `acceptStart`, `play`, `pause`, `reset`, `motorsActive`, `boatMoved`; shared โดย Classroom, Story และ Overall
- `src/js/mission/mission-start-telemetry-model.js` — สร้าง run และฉาย/เก็บ snapshot ของ storyboard เป็นรายละเอียด telemetry/log เพื่อสอน; global `MissionStartTelemetry`, ฟังก์ชัน `createRun`, `project`, `record`; เป็นคนละเส้นทางกับ codec/transport ใน `uplink-motion.js` ซึ่งประกอบ sample และส่ง bytes ของตัวเอง
- `src/js/mission/mission-start.js` — controller ของ storyboard readiness และการเคลื่อนแผนภาพ; global `MissionStartStoryboard`, ฟังก์ชัน `install`, `recordEvent`, `renderTelemetry`, `listen`, `stopTimer`, `canAnimate`, `schedule`, `tick`, `render`, `toggleTour`; ผูก `MissionStartModel` กับ markup ของ Classroom/Overall
- `src/js/mission/uplink-motion.js` — controller/renderer ของแผง Uplink เดิม; global `UplinkMotion` และ additive `window.UplinkCodec` อ้างถึงฟังก์ชันเดิม `encodeTelemetry`/`decodeTelemetry`/`PACKET_BYTES`; codec, layout และ ABI ไม่ถูกเขียนใหม่
- `src/js/system/system-model.js` — pure CommonJS/browser model ของฉาก mission รวม readiness, route/pose, sample rolling SMA, active formulae, gains, dwell, source snapshot และ browser transport/shore records; global `SystemMissionModel`, ไม่มี DOM dependency
- `src/js/system/system.js` — namespaced `#system` renderer/controller และ bounded `window.SystemMission` API (`snapshot`, `prepare`, `readiness`, `start`, `step`, `setInput`, `setGains`, `setLink`, `setDrop`, `reset`); ส่ง byte snapshot ผ่าน MessageChannel แล้ว decode จาก callback bytes
- `src/js/overall/overall-labs-model.js` — คำนวณตัวอย่างและสถานะ lab ของ Overall; global `OverallLabsModel`, ฟังก์ชัน `finiteMean`, `parseSamples`, `evaluateWhatIf`, `getCheckpointIndices`, `finiteDistance`, `createRthState`, `updateRth`; รับข้อมูลตัวอย่างที่ป้อนในหน้า ไม่ใช่ pipeline ภาคสนาม
- `src/js/overall/overall-labs.js` — adapter/render สำหรับ what-if และ RTH controls; ฟังก์ชัน `announce`, `numberField`, `formatNumber`, `sampleErrorText`, `renderWhatIf`, `rthInputs`, `renderRth`; ใช้ `OverallLabsModel` และ markup ของ Overall
- `src/js/overall/overall-model.js` — model หลักของ mission/decision visualization ใน Overall; global `OverallModel`, ฟังก์ชัน `analyzeSma`, `generateSpiralTargets`, `createMission`, `add`, `rthStopPoint`; สร้างขั้น/จุดหมายและผลจำลองให้หน้า Overall
- `src/js/overall/overall-visual-motion.js` — controller ของภาพเคลื่อนไหว Overall และ global `OverallVisualMotion` (`play`, `pause`, `next`, `reset`, `snapshot`); ฟังก์ชันภายใน `createController`, `render`, `clear`, `pauseState`, `pauseOthers`, `advance`, `schedule`; เชื่อมปุ่ม SVG กับ visibility และ reduced-motion ของเบราว์เซอร์
- `src/js/overall/overall.js` — controller/renderer หลักของหน้า Overall; global `OverallControls`, ฟังก์ชัน `setText`, `renderSmaChart`, `renderInspector`, `renderFsm`, `renderReadings`, `playback`, `enter`, `draw`, `finish`, `tick`, `pause`, `restoreTo`; ใช้ `OverallModel` และ `OverallLabsModel` เพื่อแสดง state/แผนภาพ
- `src/js/story/story-model.js` — model ของการทดลอง 4 ฉาก; global `StoryModel`, ฟังก์ชัน `createFixture`, `createStory`, `getSnapshot`, `selectScene`, `setReadiness`, `sendStart`, `nextEffect`, `reset`; ใช้ `MissionStartModel` ผ่าน global ใน browser และ CommonJS fallback ใน tests
- `src/js/story/story.js` — controller/view ของ Story Lab; globals `StoryLab`, `StoryView`, ฟังก์ชัน `mountStory`, `render`, `missingChecks`, `onClick`, `replayPackets`, `onChange`, `onKeydown`; ใช้ `StoryModel` เพื่อเปลี่ยน readiness, packet และ SVG indicator

## JavaScript: Slides

- `src/js/slides/slides-data.js` — ข้อมูลหัวข้อ ข้อความ รูปแบบ และ paths ของเนื้อหาสไลด์; กำหนด `window.presentationSlides`; ข้อความที่เล่า architecture เป็นเนื้อหานำเสนอ ไม่ได้ทำให้ backend หรืออุปกรณ์ทำงานในเว็บ
- `src/js/slides/app.js` — สร้าง DOM ของ slide ตาม `presentationSlides`; ฟังก์ชัน `element`, `add`, `addEyebrow`, `addFooter`, `addTitle`, `renderCover`, `renderStory`, `renderFlow`, `renderCode`, `openImage`, `renderDiagram`, `renderPhases`, `renderClosing`, `show`; ดูแล next/previous, keyboard, touch และ image dialog

## Tests และเครื่องมือ

- `tests/presentation-only.test.js` — ป้องกันการใส่คำถาม แบบทดสอบ prompt ชวนทาย และบทความอ่านต่อกลับในหน้าที่ใช้งานและข้อความทุกสไลด์

- `tests/approved-correction.test.js` — ตรวจ storyboard การเลี้ยว/การตอบสนอง yaw, ตำแหน่ง HOME, packet projection, แผง log และ START/readiness/reset
- `tests/classroom-page.test.js` — ตรวจ waypoint grid, ข้อความว่าไม่ใช่สถานะสด, resource ภายใน และการไม่มี checkpoint
- `tests/forward-caption.test.js` — ตรวจคำอธิบาย PWM ว่า base ± correction ใช้กับการผสมแรงเดินหน้า ไม่ใช่การหมุนอยู่กับที่
- `tests/heading-model.test.js` — ตรวจ wrapping มุม, P/I/D, windup, yaw plant, สอง lane, horizon 20 วินาที และ validation ของ input
- `tests/packet-projection.test.js` — ตรวจการฉาย stage/readiness/route flag จาก packet model
- `tests/page-identity.test.js` — ตรวจชื่อ/เอกลักษณ์ของหน้า Story และ favicon แบบ inline
- `tests/reduced-motion.test.js` — ตรวจว่ากฎ CSS ของ Story ลด/ปิด motion เมื่อผู้ใช้ตั้ง reduced motion
- `tests/review-ui.test.js` — ตรวจขนาดปุ่มขั้นต่ำ, ตำแหน่ง control บน desktop และ viewport แผนภาพสำหรับจอเล็ก
- `tests/story-model.test.js` — ตรวจ fixture readiness, การเลือก scene, gate ของ START, effects และ reset ใน Story model
- `tests/story-rework.test.js` — ตรวจ SVG readiness, สถานะมอเตอร์/การเคลื่อน, packet replay และ behavior ของ viewport/control
- `tests/story-ui.test.js` — ตรวจ 4 ฉาก picture-first, controls และพิกัด route diagram ของ Story
- `tests/system-model.test.js` — ตรวจ START gate, sample window/eligibility, clean/dirty branch, numeric conversion/navigation/spiral/steering, RTH dwell และ source bytes เทียบกับ decoded shore data
- `tests/system-integration-regression.test.js` — behavioral regressions for shared HOME, motor sign convention, late-plume resume, current SPIRAL/RTH telemetry, fixed numeric timestep, correct substituted control input and separate decode/render evidence
- `tests/system-page.test.js` — ตรวจลำดับ `#system`, bounded API hooks, browser MessageChannel/postMessage/decode และ additive codec export
- `tests/structure.test.js` — ตรวจ root redirect, ลิงก์กลับบริบทใน Overall และ hash ปัจจุบันของ migration map
- `tests/shared-shell.test.js` — regression contract สำหรับ shared shell, 9 ปลายทาง, dark tokens, touch targets และ context navigation
- `tests/visual-rework.test.js` — ตรวจ marker รูปลูกศรและขนาด/การตอบสนองของภาพ PWM
- `tools/check-links.py` — ตรวจ local href/src, CSS `url()`, anchor ใน HTML, image path ของสไลด์ และลิงก์ Markdown โดยไม่แก้ไฟล์

## เอกสารและไฟล์ประวัติ

- `docs/DEVELOPMENT.md` — จุดแก้ markup/model/controller/styles/data และวิธีเปิด/ตรวจเว็บ
- `docs/EQUATIONS.md` — สมการที่ active ใน `#system`, relative source/function provenance และขอบเขต demo เทียบ firmware reference
- `docs/FILE_MAP.md` — รายการบทบาทของทุกไฟล์ที่แชร์ได้ในโครงการนี้ รวมไฟล์เอกสารฉบับนี้
- `docs/MIGRATION_MAP.json` — ตารางพาธเดิม→ปัจจุบันพร้อม hash และชนิดการย้าย/แก้ resource
- `docs/SPEAKER_NOTES.md` — โน้ตผู้บรรยายสไลด์เดิม เก็บเป็นเอกสารประวัติ ไม่ใช่แผนผังสถาปัตยกรรมปัจจุบัน
- `docs/STATUS.md` — สถานะการตรวจและข้อจำกัดที่ยังค้าง โดยแยก organization evidence ออกจากการตรวจระบบจริง
- `docs/WEBSITE_GUIDE.md` — วัตถุประสงค์แต่ละหน้าและลำดับการนำเสนอและขอบเขตแต่ละหน้า
- `docs/legacy/mission-start-fragment.html` — HTML fragment เก่าที่เก็บไว้เป็นประวัติ ไม่ใช่หน้าเว็บที่ลิงก์หรือเป็นเจ้าของ interaction ปัจจุบัน
