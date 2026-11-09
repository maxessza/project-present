# Overall — function-centered presentation

## เปิดและใช้งาน
เปิด `index.html` ของโฟลเดอร์นี้; redirect เดิมไป `pages/overall.html` พร้อมส่งต่อ query/hash หน้า Waypoints / Heatmap / Sensors / Slides และ detailed PID lab ไม่เปลี่ยน

1. เริ่มจากภาพรวมมินิมอล 3 ส่วน: เริ่มภารกิจ / นำทางและควบคุม / วัดน้ำและรายงาน เป็นกลุ่มเนื้อหา ไม่ใช่ลำดับ task ของ firmware
2. เลือกส่วน แล้วเลือกฟังก์ชันด้วยเมาส์หรือ Enter เพื่อดู **ข้อมูลเข้า → ระบบทำอะไร → ผลที่ส่งต่อ** แบบย่อทีละฟังก์ชัน ฟังก์ชันเดิมทั้ง 9 ยังอยู่ ไม่เปิดทุกอย่างพร้อมกัน
3. ใช้ **SIM** ชุดเดียวเพื่อให้ตัวอย่างเดิน: รับ route → รับ START → readiness → เคลื่อนที่จริงใน browser model ใช้ PAUSE และ NEXT STEP (50ms/model tick) ระหว่างอธิบาย
4. เลือก Heading เพื่อเปิด PID A/B lab เดิม; lab นั้นเป็นตัวอย่างแยก ไม่ใช่เปลี่ยน gains ของภารกิจร่วม
5. เลือก Water เพื่อเปิด scenario restart ก้นหอย; เลือก Report แล้วเปิด “ดูข้อมูลที่เรือส่งทั้งหมด” เพื่อดู outgoing/last-received 9 ฟิลด์ของ transport เดิม เลือก Safety แล้วเปิดค่าละเอียดเพื่อดู final-stop/RTH และ inspector เฉพาะทาง
6. สูตร ค่าทั้งหมด และ source อยู่ใน “ดูค่าทั้งหมดและวิธีคำนวณ”; แผนที่อยู่ใน “ดูเรือจำลอง” เปิดเมื่อใช้ประกอบการอธิบาย ปุ่มภาพรวมกลับไปหน้าสามส่วนโดยไม่รีเซ็ตเวลา/ภารกิจ

## การรวมหน้า
`function-centered-overall.js` ใช้ `AutonomousMission.snapshot/subscribe/setMode` ที่มีอยู่ ไม่เพิ่ม mission/model/clock ใหม่ ย้าย **DOM controls เดิม** มาไว้ด้านบน ไม่สร้างปุ่ม start ซ้ำ; เปลี่ยน focus ไม่ dispatch action

ส่วน LEARN / mission-start / OPERATE / PID storyboard เดิมถูกถอดออกจาก live DOM หลังเก็บ bounded sample/RTH inspectors มาไว้ตามเจ้าของฟังก์ชัน และไม่โหลด `overall-completion.js` อีก Original markup ยังอยู่ใน source เพื่อ recovery ไม่ได้ซ่อนสำเนาทั้งหน้าใน disclosure หรือเปิดเป็นประสบการณ์คู่แข่ง ลิงก์เดิม #learn/#overview/#pid/#mission-start/#ms-uplink-panel/#operate/#system ถูกนำไปยังฟังก์ชันเจ้าของ

Canonical model/kernel/guidance/policy/incoming/transport/codec/renderer และหน้าอื่นถูกป้องกันด้วย baseline hashes. Final stylesheet `function-flow.css` โหลดเฉพาะ Overall และอยู่หลัง instrument/base ของ builder

## ขอบเขตข้อมูล
- พิกัดฉากใช้0.15m/หน่วย แทน geodesic GPS; hull/servo response เป็น illustrative plant ไม่ได้สอบเทียบ
- แยก acquired compass, plant heading, controller-requested และ final-applied PWM
- ค่ารอบล่าสุดอ่านจาก immutable operation row; ระยะเป้าเดิมที่ใช้ตรวจ WP ไม่สร้างจากระยะถึงเป้าใหม่
- Report ใช้ immutable outgoing bytes และ decoded last receipt; transport ใช้ MessageChannel ไม่ใช่วิทยุจริง ค่าที่ไม่พร้อมไม่ใช่ศูนย์
- Reference rows/line ranges มาจาก canonical source map เดิม; การคง hash ไม่ใช่การพิสูจน์ทุก branch หรือ hardware
- ก่อนมีการประมวลผล แสดง “ยังไม่มี/รอ” ไม่เติมตัวเลขที่ไม่มี field รองรับ

## Evidence / commands
Current owner-directed simplification: `D:/Presention/presention-structure-work/REQ_MINIMAL_OVERALL.md` (M1–M6), evidence `../../evidence/minimal-overall/`. Previous dense composition was rejected on clarity, regardless of its green tests. Current final-byte independent approval remains NOT VERIFIED; no extra paid review is launched automatically.

Previous contract/evidence history: `D:/Presention/presention-structure-work/REQ_FUNCTION_CENTERED_OVERALL.md` (AC1–AC12)
Evidence root: `D:/Presention/presention-structure-work/evidence/function-centered-overall/`
- `BASELINE.json` / `before/`: source identity ก่อนแก้
- `builder/`: checkpoint ของ Kai run83 ซึ่ง timeout; ไม่ใช่ final acceptance
- `coordinator/capped-candidate/`: เก็บ partial source และ test ก่อนแก้ต่อ
- `coordinator/content-red/`, `default-red/`, `post-cap/`: failures ที่พบจริงก่อนแก้
- `coordinator/integration-02/RESULT.json`: native63 checks ผ่านหลังแก้ source และ inspector ownership
- `coordinator/suites-01/`: full Node attempt แรก156 checks:150 pass/6 fail; เก็บ raw output โดยไม่ทับ
- `coordinator/`: final manifest, scope guard, ledger และ final command outputs
- `reviewer/`: independent UI/integration verdict แยกจาก coordinator; หากไม่มี verdict ให้ถือ NOT VERIFIED

Maintained native command (ใช้ output ใหม่เสมอ):
```sh
python tests/minimal-overall-browser.py --out <new-evidence-dir>
python tests/overall-function-regressions-browser.py --out <another-new-evidence-dir>
OVERALL_FIRMWARE_ROOT='C:/Users/Icezy/OneDrive/Desktop/source/1_Firmware' GRID_EVIDENCE_DIR='<new-evidence-dir>' node --test tests/*.test.js
python tools/check-links.py
```
`tests/overall-function-flow-browser.py` เก็บสัญญา UI ก่อนลดเป็นสามส่วน (63 checks เดิม) ไม่ใช่ current entry/disclosure test. `tests/function-centered-overall-browser.py` เป็น historical menu-layout checkpoint ของ capped builder และ hardcode evidence output เดิม อย่ารันซ้ำเพื่อทับหลักฐานนั้น ใช้ maintained minimal/regression harness ข้างบน

Fixture changes: script-order assertion เปลี่ยนจาก mount OPERATE เป็น mount function inspector และ stylesheet-order assertion เปลี่ยนให้ layer ใหม่อยู่ท้าย; assertions ด้าน model/transport/behavior อื่นคงเดิม Migration output hash อัปเดตเฉพาะหน้า Overall ปัจจุบัน ไม่เขียน source หรือ review hash ในประวัติให้ดูเหมือนผ่าน

`OVERALL_REQUIREMENTS_MATRIX.json` เก็บหลักฐาน G1–G4/C1–C12 เดิมไว้ แต่ current gate ถูกตั้ง NOT_VERIFIED หลัง UI drift; historical Astra model/run82 PASS ไม่ถูกสืบทอดมายัง UI ใหม่นี้ Independent UI review ใช้ verifier/Sol เท่านั้น ไม่เทียบเท่าหรือปิด high-risk firmware/navigation/concurrency/ABI gate

Owner projector readability/preference, actual target browser and bench/pond/device behavior remain user-owned **NOT VERIFIED**; local-only, no commit/push/deploy/flash
