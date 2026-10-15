# แนวทางแก้ไขและตรวจเว็บ

## เลือกตำแหน่งแก้ให้ตรงงาน

เว็บนี้เป็นสื่อนำเสนอ: ไม่เพิ่มคำถาม แบบทดสอบ เฉลย prompt ชวนทาย หรือบทความอ่านต่อ ใช้หัวข้อบอกเล่า ภาพจำลองและปุ่มทดลอง; คง inspector/log ที่ใช้ดูสถานะจริงของแบบจำลอง

- โครงหน้าและข้อความประจำหน้า: `pages/<ชื่อหน้า>.html`; `index.html` ส่งต่อไปยัง Overall จริงและคง query/hash ส่วน navigation 9 หัวข้ออยู่ใน shell ของแต่ละหน้า
- การคำนวณและสถานะจำลอง: ไฟล์ `*-model.js` ของหน้านั้น เช่น `src/js/heading/heading-model.js`, `src/js/story/story-model.js` และ `src/js/overall/overall-model.js`
- การวาดหน้า รับเหตุการณ์ และควบคุมการเล่น: controller ของหน้า เช่น `heading.js`, `story.js`, `mission/mission-start.js` และ `overall/overall.js`
- การเคลื่อนไหว: `src/js/overall/overall-visual-motion.js` สำหรับภาพเคลื่อนไหวของ Overall, `src/js/mission/mission-start.js` สำหรับ storyboard และ `src/js/mission/uplink-motion.js` สำหรับการเดินทางของ packet จำลอง
- สไตล์: `site.css` เป็น shared shell/tokens/navigation ของทุกหน้า, `learning-theme.css` ปรับ Classroom/Story/Heading/Slides ให้ใช้สีเดียวกัน และ stylesheet เฉพาะหน้าดูแล diagrams/controls; `navigation.css` ใช้กับ context links กลับ Overall
- เนื้อหาและลำดับสไลด์: `src/js/slides/slides-data.js`; การแสดงผลสไลด์: `src/js/slides/app.js`
- ภาพประกอบที่ใช้ร่วมกัน: `assets/images/`

ข้อมูลและแบบจำลองในไฟล์เหล่านี้ใช้สอนในเบราว์เซอร์ การแก้ packet หรือชื่อโมดูลไม่ทำให้เกิดการเชื่อมต่อวิทยุ/backend หรืออ่านข้อมูลจากเรือจริง

## ลำดับสคริปต์ของหน้า

เรียง `<script>` ใน HTML ให้โมเดลที่ controller ต้องใช้มาก่อน:

- Classroom: `mission-start-model.js` → `mission-start.js`
- Story: `mission-start-model.js` → `story-model.js` → `story.js`; โมเดล Story ใช้โมเดลภารกิจร่วม
- Heading / PID: `heading-model.js` → `heading.js`
- Overall: `overall-model.js` → `overall-labs-model.js` → `overall.js` → `overall-labs.js` → `overall-visual-motion.js` → `mission-start-model.js` → `mission-start-telemetry-model.js` → `mission-start.js` → `uplink-motion.js`
- Slides: `slides-data.js` → `app.js`
- Waypoints, Sensors และ Heatmap เป็นหน้าอธิบายที่ไม่มี script เฉพาะหน้า

## เปิดและตรวจ

เปิด `index.html` ได้โดยตรง ระบบจะเข้าสู่ `pages/overall.html` โดยส่งต่อ query/hash เดิม ไม่ต้องติดตั้งแพ็กเกจ หากต้องการ local server ให้เปิด terminal ที่โฟลเดอร์รากของโครงการแล้วรัน:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

คำสั่งทดสอบ Node.js คือ `node --test` และเครื่องมือตรวจลิงก์ภายในคือ `python tools/check-links.py` ทั้งสองคำสั่งรันจากโฟลเดอร์รากของโครงการ

## เมื่อเพิ่มหน้าหรือเปลี่ยนพาธ

1. เพิ่ม markup ใต้ `pages/` และระบุ stylesheet/script ที่หน้านั้นใช้ โดยใช้พาธสัมพันธ์จากตำแหน่ง HTML
2. เพิ่มปลายทางใน primary navigation ของ shared shell และเพิ่ม context link กลับ Overall section ที่เกี่ยวข้อง; root `index.html` ใช้เป็น redirect เท่านั้น
3. วางโค้ดคำนวณไว้ใน model, การผูก DOM ไว้ใน controller, และกฎการแสดงผลไว้ใน CSS ของหน้าที่รับผิดชอบ
4. วางรูปที่ใช้ร่วมกันไว้ใต้ `assets/images/`; หากแก้ข้อมูลสไลด์ ให้จำไว้ว่าพาธรูปใน `slides-data.js` ถูกตีความเทียบกับ `pages/slides.html`
5. ปรับการทดสอบที่ตรวจสัญญาของหน้านั้น และอัปเดต [FILE_MAP.md](FILE_MAP.md) ให้ครอบคลุมไฟล์ใหม่

`docs/legacy/mission-start-fragment.html` เป็น fragment เก่าที่ไม่ใช่หน้าแอปปัจจุบัน อย่านำไปลิงก์เป็นหน้าเริ่มภารกิจที่ใช้งานได้ หากต้องแก้ประสบการณ์ปัจจุบัน ให้แก้หน้า Classroom, Story หรือแผง Uplink ใน Overall ตามเจ้าของเนื้อหา
