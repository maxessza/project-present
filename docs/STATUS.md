# สถานะและขอบเขต

## Current Overall presentation checkpoint — 2026-11-13

See [PREVIEW_CHECKPOINT.md](PREVIEW_CHECKPOINT.md) for this exact preview and [Thai operating guide](PRESENTATION_GUIDE_TH.md). **Known issue: navigation explanation disappears after WP2 while the model continues toward WP3; NOT fixed by this publication.** Report/reset/ownership/SVG repairs are included, but full independent acceptance remains NOT VERIFIED. Publication is not approval or deployment. All sections below are retained historical records, not current acceptance claims.

## Current continuation — t_6328f694 (2026-10-20)

Active Overall is now mission-kernel + autonomous renderer + one mission-fed MessageChannel transport; not system/*. Nav50ms, ADS250ms, TX1000ms; signed controller-driven plant, water hold/quiet mean, absolute SMA8, spiral/resume and RTH bounded subset. Current evidence/HANDOFF: D:/Presention/presention-unified-sim-20261020/evidence/continuation. Current native run passed20/20 checks before final freeze; final commands/counts are recorded in HANDOFF rather than inferred from historical counts below. Independent presentation acceptance remains pending; physical/high-risk firmware/navigation/concurrency/ABI gate HELD / NOT VERIFIED. All sections below are historical evidence and do not certify this candidate.

## ฉากระบบรวมและสมการปัจจุบัน

- Overall เปิดฉาก `#system` ก่อนตัวอย่างเดิมใน shell navy/cyan เดียวกัน: readiness → START → GRID → SMA/absolute decision → optional SPIRAL → GRID resume → RTH → STANDBY
- Sensor, pose/heading, steering, source snapshot, 38-byte codec, MessageChannel receiver และจอฝั่งมี data lineage จริงในเบราว์เซอร์ ไม่ใช่ widgets อิสระที่อ้างว่าเชื่อมกัน
- แสดง8กลุ่มคำนวณ พร้อม symbolic formula/ค่าที่แทน/ผลลัพธ์; เลือกกลุ่มหรือแสดงทั้งหมดได้ โดย view selection ไม่เปลี่ยน mission state. ข้อแตกต่างจาก firmware อยู่ใน `docs/EQUATIONS.md`
- แผนที่เป็น schematic interpolation แยกจาก toy yaw plant; GRID PI−heading-rate และ SPIRAL/RTH PID เป็นแบบจำลองหน่วย normalized ไม่ใช่ PWM จริง. New scene ใช้ spiral4–8m/3turns ตาม source snapshot; ตัวอย่างเก่าไม่ถูกแก้
- ใช้ fixed250ms numerical step; playback เปลี่ยน cadence ไม่เปลี่ยนผลต่อ step. Motor meters เป็นคำสั่งจำลอง ไม่ใช่ actuator feedback
- Drop/retry ใช้ immutable bytes เดิม; link off ไม่อัปเดตจอฝั่งแต่ memory log ยังเดิน; reset retire callbacks/ports/timers; STANDBY ส่งน้ำเป็นNaN ไม่ปลอม last reading

## หลักฐานฉากใหม่

- Coordinator native Chromium: 36 behavioral cases ผ่าน รวม native post/receipt instrumentation, independent Python struct decode, real controls, reset race, clean/dirty mission, RTH gate และ NaN standby
- Readability/mobile: 13 native checks ผ่าน (44px targets,14px primary formulae, arrow-tip anchor, readable pan region, no body overflow)
- Independent scalar calculations by coordinator: 15 numeric examples ผ่าน; ไม่ใช่ independent agent approval
- Builderหยุดที่900s (exit124) โดยเก็บpartial sourceไว้; coordinatorแก้ startup/schema, motor sign, late plume resume, missing spiral/RTH source updates, dt scaling และ premature render counter พร้อม retained RED→GREEN regressions. ไม่เรียกcapped attempt ว่าPASS
- Current Node: 65/65 tests ผ่าน; local paths/anchors: 207 references ผ่าน; CRLF-aware diff check ผ่าน
- Existing detailed-view compatibility: 40 native cases ผ่าน; รวมกับฉากใหม่และreadabilityเป็น 89 browser checks. Extra boundary/unchanged-codec guard: 4 cases ผ่าน
- FILE_MAP accounts for 70 packaged paths; no missing/extra entries. Existing codec factory preserved; original protected sources unchanged
- Independent review ของ frozen candidate ก่อนแก้: **FAIL** ที่ F1 (คิว sample ใหม่เขียนทับป้าย/hex ของ TX เก่าที่กำลังretry); wire bytes ไม่เสีย. แก้ controller ให้บันทึก TX ตอนpromoteเข้าactiveและแยก LATEST SOURCE / ACTIVEหรือLAST TX / LAST RX แล้ว
- F1 coordinator closure: meaningful native behavior RED→GREEN, 5 cases ผ่าน พร้อม raw post/receipt bytes และ independent Python struct decode; rerun 36 new-scene native cases และ65 Node tests ผ่าน. ไม่ซื้อworker/reviewรอบใหม่และไม่เปลี่ยนรายงานเดิมให้เป็นPASS
- Current independent acceptance: **NOT VERIFIED**. รุ่นแก้ยังไม่ได้independent re-review; P1ยังholdเพราะ REDต้นรอบbuilderเป็นMODULE_NOT_FOUND ไม่ใช่behavioral failure. Later RED→GREEN ไม่สร้างประวัติย้อนหลัง และไม่มีowner exceptionโดยปริยาย
- ยังไม่มีการอนุมัติ firmware/navigation/radio/safety/packet ABI gate และไม่ปลด historical holds
- Local preview only: ไม่commit/push/merge/deploy ในรอบนี้. Sourceเดิมและfirmwareไม่แก้; ผู้ใช้ยังต้องดูจอจริง/โปรเจกเตอร์เอง

---

## ประวัติรุ่นลบคำถาม (ไม่ใช่ผลตรวจรุ่นระบบรวม)


### รูปแบบนำเสนอหลังลบคำถาม

- เปิด `index.html` เข้าสู่ Overall เดิมพร้อม query/hash; shared navy/cyan header และเมนูเก้าปลายทางยังอยู่
- ตัด quiz/คำตอบ/เฉลย/checkpoint/coach ชวนทายจาก Classroom รวม markup, scripts และ styles; ไม่มีการซ่อนด้วย CSS อย่างเดียว
- ทุกหน้าที่ใช้งานและข้อความสไลด์ใช้หัวข้อบอกเล่าแทนคำถาม; ตัดบทความอ่านต่อใน PID และบทความ firmware/project legacy ใน Overall
- คงภาพจำลอง ปุ่ม P/I/D, readiness/START, Story, What-if/RTH และ inspector ของ packet/attempt/log ไว้ เพราะเป็นส่วนดูผลและปรับการจำลอง ไม่ใช่การถามผู้ชม

### หลักฐานรอบลบคำถาม

- Node: 47 tests ผ่าน ไม่มี failure. จำนวนลดจาก53เพราะนำ7quiz testsและ1coach-style testที่เป็นของ feature ที่เจ้าของสั่งลบออก แล้วเพิ่ม2presentation-only regressions; ไม่ลด assertion ของการจำลองที่ยังใช้งาน
- Local path/anchor/resource checker: 200 references ผ่าน
- Chromium: 40 integration cases (file/HTTP, navigation, PID, mission readiness/START/motors/movement/reset, Story, Uplink loss/hold/stale, Slides, keyboard/mobile) +6context links +6contrast/mobile regressions +36rendered presentation checks =88checks ผ่าน
- Rendered presentation checks ตรวจ8หน้าที่ใช้จริงบน1440px/390px และ20สไลด์; ไม่พบคำถาม/quiz/prediction/read-more UI ตามรูปแบบที่ทดสอบ
- JavaScript ที่คงอยู่13ไฟล์เหมือน baseline แบบbyte-for-byte รวม calculation models, mission/story controllers, packet codec/transport. อีก2ไฟล์แก้เฉพาะ display strings (PID rendererและslide2); quiz model/adapterถูกลบตามคำขอ
- Migration map บันทึก37active mappingsและ2historical removal tombstones; FILE_MAPตรงกับ63public files

### สถานะการยอมรับรอบลบคำถาม

Software checks ข้างต้น PASS. Independent acceptance ยัง **NOT VERIFIED**; ใช้หลักฐานของ coordinator ไม่ใช่ final independent report. ไม่เริ่ม paid review รอบใหม่อัตโนมัติ และไม่ได้ปิด historical review/process/firmware holds

### ขอบเขตและงานค้างเดิม

- การจำลองเป็น browser-only ไม่เชื่อมเรือ วิทยุ หรือ telemetry จริง ไม่รับรอง gains/ขั้นตอน operator หรือการใช้งานภาคสนาม
- ไม่มีการแก้ firmware, main merge หรือ public hosting ในรอบนี้
- การตรวจข้อความของslide18ไม่ได้ปิดประเด็น source/undefined ที่มีรายงานเดิม; ไม่รับรองความถูกต้องของทุกเนื้อหาจากการตรวจคำถาม
- Heatmap ยังไม่มี field-data pipeline; Monitor extension ยังไม่ได้ขยาย
- ผู้ใช้ยังต้องดูการจัดวางกับจอ/โปรเจกเตอร์ที่ใช้เสนอจริง
