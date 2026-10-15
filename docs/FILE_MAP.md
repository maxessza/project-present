# แผนที่ไฟล์ที่แจกจ่าย

รายการนี้ครอบคลุมไฟล์โครงการที่แชร์ได้ทั้งหมดในชุดปัจจุบัน โดยไม่รวม `.git` และไฟล์ cache ที่ถูกละเว้น เนื้อหาในหน้าเว็บเป็นตัวอย่างเชิงการสอน เว้นแต่จะระบุว่าเป็นข้อมูลหรือการคำนวณที่หน้าเว็บทำจริง

## จุดเริ่มต้นและหน้าเว็บ

- `README.md` — คู่มือเปิดเว็บ เส้นทางเริ่มต้น คำสั่งตรวจในเครื่อง และลิงก์เอกสาร
- `index.html` — redirect แบบเรียบง่ายไปยัง `pages/overall.html`; ส่งต่อ query/hash เดิมและมีลิงก์ fallback ที่เข้าถึงด้วยแป้นพิมพ์ได้
- `.gitignore` — ละเว้นไฟล์สภาพแวดล้อม Python และ cache (`.env`, `.venv`, `__pycache__`)
- `.gitattributes` — เก็บ bytes ของไฟล์ตามต้นฉบับ ไม่แปลง line endings ตอน clone เพื่อรักษา hashes ของ source/tests และ migration map
- `pages/classroom.html` — หน้า Classroom; markup ของ storyboard เตรียมภารกิจ 8 ขั้น โหลดเฉพาะโมเดลและตัวควบคุมภารกิจ ไม่มีส่วนถามตอบ
- `pages/heading-pid.html` — หน้า Heading / PID; markup ของหน้าปัด A/B, target, gain controls, transport และกราฟที่ `HeadingLab` วาด
- `pages/heatmap.html` — หน้าอธิบายการประมาณค่าระหว่างจุดวัดด้วยข้อความและแผนภาพ ไม่มี script หรือชุดข้อมูลที่สร้าง heatmap จริง
- `pages/overall.html` — หน้า Overall แบบบูรณาการ; markup ของบทเรียน route/task/PID/mission, ตัวอย่างตัวเลข, inspector และแผง Uplink ซึ่งโหลด Overall และ mission scripts
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
- `src/css/story.css` — scene panels, SVG, readiness controls, responsive viewport และ reduced-motion ของ Story Lab
- `src/css/styles.css` — deck, stage, slide layouts, navigation และ responsive rules ของหน้า Slides

## JavaScript: Heading

- `src/js/heading/heading-model.js` — แบบจำลอง yaw/PID สอง lane; global `HeadingModel`, ฟังก์ชัน `wrapError`, `initial`, `control`, `advance`, `createRun`, `stepRun`, `resetRun`; ไม่มี DOM dependency
- `src/js/heading/heading.js` — controller/renderer ของหน้า Heading; global `HeadingLab`, ฟังก์ชัน `render`, `oneStep`, `syncControls`, `configure`, `frame`, `setPlaying`; ใช้ `HeadingModel`, controls และ SVG/plot ใน `heading-pid.html`

## JavaScript: mission, Overall และ Story

- `src/js/mission/mission-start-model.js` — สถานะจำลองการเตรียม/เริ่มภารกิจ; global `MissionStartModel`, ฟังก์ชัน `createState`, `advance`, `simulateGpsReady`, `setReadiness`, `acceptStart`, `play`, `pause`, `reset`, `motorsActive`, `boatMoved`; shared โดย Classroom, Story และ Overall
- `src/js/mission/mission-start-telemetry-model.js` — สร้าง run และฉาย/เก็บ snapshot ของ storyboard เป็นรายละเอียด telemetry/log เพื่อสอน; global `MissionStartTelemetry`, ฟังก์ชัน `createRun`, `project`, `record`; เป็นคนละเส้นทางกับ codec/transport ใน `uplink-motion.js` ซึ่งประกอบ sample และส่ง bytes ของตัวเอง
- `src/js/mission/mission-start.js` — controller ของ storyboard readiness และการเคลื่อนแผนภาพ; global `MissionStartStoryboard`, ฟังก์ชัน `install`, `recordEvent`, `renderTelemetry`, `listen`, `stopTimer`, `canAnimate`, `schedule`, `tick`, `render`, `toggleTour`; ผูก `MissionStartModel` กับ markup ของ Classroom/Overall
- `src/js/mission/uplink-motion.js` — controller/renderer ของการส่ง packet บนจอ; global `UplinkMotion`, ฟังก์ชัน `encodeTelemetry`, `decodeTelemetry`, `install`, `initialState`, `renderBytes`, `renderInspector`, `updateShore`, `schedule`, `animatePacket`, `beginRetry`, `receiverCallback`, `send`, `cancelFlight`, `reset`, `verifyInvalidLength`; อ่าน controls ของแผง Overall, สร้าง sample/packet, ใช้ `ArrayBuffer` กับ browser `MessageChannel` และจำลอง loss/retry/stale state โดยไม่ส่งวิทยุ
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
- `tests/structure.test.js` — ตรวจ root redirect, ลิงก์กลับบริบทใน Overall และ hash ปัจจุบันของ migration map
- `tests/shared-shell.test.js` — regression contract สำหรับ shared shell, 9 ปลายทาง, dark tokens, touch targets และ context navigation
- `tests/visual-rework.test.js` — ตรวจ marker รูปลูกศรและขนาด/การตอบสนองของภาพ PWM
- `tools/check-links.py` — ตรวจ local href/src, CSS `url()`, anchor ใน HTML, image path ของสไลด์ และลิงก์ Markdown โดยไม่แก้ไฟล์

## เอกสารและไฟล์ประวัติ

- `docs/DEVELOPMENT.md` — จุดแก้ markup/model/controller/styles/data และวิธีเปิด/ตรวจเว็บ
- `docs/FILE_MAP.md` — รายการบทบาทของทุกไฟล์ที่แชร์ได้ในโครงการนี้ รวมไฟล์เอกสารฉบับนี้
- `docs/MIGRATION_MAP.json` — ตารางพาธเดิม→ปัจจุบันพร้อม hash และชนิดการย้าย/แก้ resource
- `docs/SPEAKER_NOTES.md` — โน้ตผู้บรรยายสไลด์เดิม เก็บเป็นเอกสารประวัติ ไม่ใช่แผนผังสถาปัตยกรรมปัจจุบัน
- `docs/STATUS.md` — สถานะการตรวจและข้อจำกัดที่ยังค้าง โดยแยก organization evidence ออกจากการตรวจระบบจริง
- `docs/WEBSITE_GUIDE.md` — วัตถุประสงค์แต่ละหน้าและลำดับการนำเสนอและขอบเขตแต่ละหน้า
- `docs/legacy/mission-start-fragment.html` — HTML fragment เก่าที่เก็บไว้เป็นประวัติ ไม่ใช่หน้าเว็บที่ลิงก์หรือเป็นเจ้าของ interaction ปัจจุบัน
