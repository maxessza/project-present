# สถานะและขอบเขต

## พฤติกรรมปัจจุบัน

- เปิด `index.html` แล้ว redirect ไปยัง `pages/overall.html` ซึ่งเป็นหน้า Overall เดิม พร้อมคง query string และ hash ที่ส่งเข้ามา; fallback มีลิงก์ไป Overall และใช้ palette navy/cyan
- ทุก active page ใช้ SW header และ navigation ชุดเดียวกัน รวม Overall, Waypoints, Heatmap, Sensors, Slides, Classroom, Story, Heading / PID และ Uplink
- Overall เชื่อมไปยัง Classroom, Story Lab และการทดลอง Heading / PID; หน้าเหล่านั้นมี context link กลับไปยังส่วน mission readiness หรือ PID ใน Overall
- `site.css` เป็น shell/tokens หลัก และ `learning-theme.css` กำหนดสีเดียวกันให้ Classroom, Story, Heading / PID และ Slides; `portal.css` ที่ใช้กับ launcher เดิมถูกนำออกหลังเลิกใช้หน้า launcher

## หลักฐานที่บันทึกในรอบแก้ไข

- Contract ของ root ผ่านกับ `file://`: พบ `.site-header` หนึ่งชุด, Overall diagram หนึ่งชุด, navy `rgb(6, 18, 29)` และ `OverallModel` เป็น object
- Shared-shell regression ที่เพิ่มใหม่ผ่านหลังจากบันทึกผล RED ก่อนแก้ theme
- `node --test` และ `python tools/check-links.py` ผ่านกับ final bytes; raw outputs และ child exits อยู่ใน handoff evidence
- Browser integration ผ่าน 40 cases กับ `file://` และ HTTP: เมนูหลักทุกหัวข้อ, ธีม/ตัวอักษร, ลิงก์เข้า PID/Uplink, PID controls/plots, Story, Classroom, Uplink failure/reset, Slides, keyboard และจอ390px; หลักฐานนี้เป็น software integration ไม่ใช่การทดสอบทุกสถานการณ์หรือทุกขนาดจอ
- Independent review รอบนี้หยุดเมื่อครบ cap300วินาที (exit124) จึงยังไม่ใช่ final acceptance. ผู้ตรวจพบ contrast ของ Classroom และตัวอักษร navbar ไม่ตรงกัน; coordinator ยืนยันด้วย native Chromium RED แล้วแก้เฉพาะ CSS จน GREEN รวมข้อความ readiness/note, navbar และ mobile Slides. ไม่ rerun paid review อัตโนมัติ และสถานะ independent acceptance ของ candidate ปัจจุบันยัง **NOT VERIFIED**
- หลักฐานเพิ่ม: root query/hash และ context links6cases; native finding regressions6cases; `node --test`53tests และ link checker209references. ผลเหล่านี้ไม่แทนคำรับรอง independent reviewer หรือเรือจริง

## ขอบเขต

- Classroom, Story, Heading / PID และ Uplink เป็นแบบจำลองใน browser ไม่เชื่อมกับเรือ วิทยุ สถานีฐาน หรือ telemetry จริง
- Heatmap เป็นคำอธิบาย ไม่มีชุดข้อมูลภาคสนามหรือ pipeline ประมวลผลข้อมูล
- งานนี้ไม่ปรับ Heading model/controller/renderer, mission logic หรือ Uplink codec/transport behavior/bytes; ไม่ใช่การรับรอง gain กับเรือจริง
- การตรวจครบทุกขนาดจอ การใช้งานจริงบนเรือ/เซนเซอร์ และ independent acceptance ยังคง **NOT VERIFIED** ในเอกสารนี้; scoped review ของการแก้ shell/theme/navigation ต้องอ่านผลจากรายงานผู้ตรวจ ไม่ใช้ผล browser แทน

## ค้างจากงานก่อนหน้า

- Historical UI/simulation/firmware/process holds ยังคงเป็นประเด็นแยก งาน shell correction นี้ไม่ได้ปิดหรือยกเว้น hold เหล่านั้น
- รายงานเดิมระบุประเด็นอ้างอิง/undefined ของ slide 18; งานนี้ไม่ได้แก้หรือประกาศปิดประเด็นนั้น
- ขอบเขต Monitor data pipeline ยังไม่ชัดและไม่ได้ขยายในงานนี้
- การยืนยันกับผู้เรียน จอ projector และการนำเสนอจริงยังรอการใช้งานจริง
