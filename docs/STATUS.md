# สถานะและขอบเขต

## รูปแบบนำเสนอปัจจุบัน

- เปิด `index.html` เข้าสู่ Overall เดิมพร้อม query/hash; shared navy/cyan header และเมนูเก้าปลายทางยังอยู่
- ตัด quiz/คำตอบ/เฉลย/checkpoint/coach ชวนทายจาก Classroom รวม markup, scripts และ styles; ไม่มีการซ่อนด้วย CSS อย่างเดียว
- ทุกหน้าที่ใช้งานและข้อความสไลด์ใช้หัวข้อบอกเล่าแทนคำถาม; ตัดบทความอ่านต่อใน PID และบทความ firmware/project legacy ใน Overall
- คงภาพจำลอง ปุ่ม P/I/D, readiness/START, Story, What-if/RTH และ inspector ของ packet/attempt/log ไว้ เพราะเป็นส่วนดูผลและปรับการจำลอง ไม่ใช่การถามผู้ชม

## หลักฐานรอบลบคำถาม

- Node: 47 tests ผ่าน ไม่มี failure. จำนวนลดจาก53เพราะนำ7quiz testsและ1coach-style testที่เป็นของ feature ที่เจ้าของสั่งลบออก แล้วเพิ่ม2presentation-only regressions; ไม่ลด assertion ของการจำลองที่ยังใช้งาน
- Local path/anchor/resource checker: 200 references ผ่าน
- Chromium: 40 integration cases (file/HTTP, navigation, PID, mission readiness/START/motors/movement/reset, Story, Uplink loss/hold/stale, Slides, keyboard/mobile) +6context links +6contrast/mobile regressions +36rendered presentation checks =88checks ผ่าน
- Rendered presentation checks ตรวจ8หน้าที่ใช้จริงบน1440px/390px และ20สไลด์; ไม่พบคำถาม/quiz/prediction/read-more UI ตามรูปแบบที่ทดสอบ
- JavaScript ที่คงอยู่13ไฟล์เหมือน baseline แบบbyte-for-byte รวม calculation models, mission/story controllers, packet codec/transport. อีก2ไฟล์แก้เฉพาะ display strings (PID rendererและslide2); quiz model/adapterถูกลบตามคำขอ
- Migration map บันทึก37active mappingsและ2historical removal tombstones; FILE_MAPตรงกับ63public files

## สถานะการยอมรับ

Software checks ข้างต้น PASS. Independent acceptance ยัง **NOT VERIFIED**; ใช้หลักฐานของ coordinator ไม่ใช่ final independent report. ไม่เริ่ม paid review รอบใหม่อัตโนมัติ และไม่ได้ปิด historical review/process/firmware holds

## ขอบเขตและงานค้างเดิม

- การจำลองเป็น browser-only ไม่เชื่อมเรือ วิทยุ หรือ telemetry จริง ไม่รับรอง gains/ขั้นตอน operator หรือการใช้งานภาคสนาม
- ไม่มีการแก้ firmware, main merge หรือ public hosting ในรอบนี้
- การตรวจข้อความของslide18ไม่ได้ปิดประเด็น source/undefined ที่มีรายงานเดิม; ไม่รับรองความถูกต้องของทุกเนื้อหาจากการตรวจคำถาม
- Heatmap ยังไม่มี field-data pipeline; Monitor extension ยังไม่ได้ขยาย
- ผู้ใช้ยังต้องดูการจัดวางกับจอ/โปรเจกเตอร์ที่ใช้เสนอจริง
