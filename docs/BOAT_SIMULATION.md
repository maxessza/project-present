# Boat Mission Simulation — ขอบเขตและวิธีใช้

## เปิดและนำเสนอ

เปิด `pages/system-explorer.html` จากโฟลเดอร์เว็บทั้งชุด ไม่ต้องมีเซิร์ฟเวอร์หรือต่อเรือจริง หน้าแรกหยุดเวลาไว้ แต่ใส่อินพุตจำลองที่พร้อมเริ่มไว้ให้แล้วอย่างชัดเจน

1. กด **START ปุ่มเดียว** เพื่อรับคำสั่งและเริ่มเวลา เรือจะเริ่มเคลื่อนใน tick ถัดไป ไม่ต้องกด preset หรือ Play เพิ่ม ค่าเริ่มต้นแสดงเวลาเร็ว 4×
2. ใช้ **พัก / เล่นต่อ / ทีละก้าว / เริ่มใหม่** ที่แถบล่าง ปรับความเร็วระหว่างเล่นได้ การเดินทีละก้าวเพิ่มเวลาแบบจำลอง 250 ms
3. กด **ดูตรรกะ / เซนเซอร์** เมื่อต้องการเปิดรายละเอียด แล้วเลือก **ทั้งระบบ / ตรวจความพร้อม / นำทาง / GPS / Compass / การเลี้ยว** การเปิด ปิด และเปลี่ยนแท็บไม่เริ่มภารกิจใหม่ ปิดด้วยปุ่มปิดรายละเอียดหรือ Escape
4. ในหน้าตรวจความพร้อม ลองปิด compass สด หรือเปลี่ยน GPS แล้วดูเหตุผลรอบนฉากและผลที่การขับเป็น neutral หากปรับเซนเซอร์ให้ไม่ผ่านเอง ปุ่ม START จะไม่แอบคืนค่าหรือข้าม gate; คืนค่าได้ด้วยปุ่ม **คืนค่าเซนเซอร์จำลองให้พร้อม**
5. แท็บ **ทั้งระบบ** ในรายละเอียดมีอินพุตความขุ่นสังเคราะห์และค่าเฉลี่ยที่คำนวณจริงในแบบจำลอง ส่วนการตรวจน้ำยังเป็น subset ตามข้อจำกัดด้านล่าง
6. **เริ่มใหม่** หยุด loop และคืนภารกิจพร้อมอินพุตจำลองที่พร้อมเริ่ม โดยยังไม่เล่นเอง จอเล็กเลื่อนฉากดูได้และจัดเรือให้อยู่ในกรอบเมื่อเริ่ม/รีเซ็ต

เรือคือเครื่องหมายลูกศรขนาดเล็ก วงสีทองคือเป้าหมายปัจจุบัน เส้นทึบคือรอยทางที่แบบจำลองเดินมา เส้นประและ WP1–WP9 คือแผนเส้นทางตัวอย่าง เก็บพิกัดและลำดับเดิมจากเว็บไซต์ไว้ ภาพนี้ไม่ใช่แผนที่ GPS หรือสเกลแผนที่จริง

## ข้อมูล → เงื่อนไข → ผล

`src/js/explorer/boat-mission-model.js` คือสถานะและการคำนวณหลัก ตัว renderer `boat-mission-ui.js` อ่าน snapshot เดียวกันเพื่อวาดเรือ เป้าหมาย รอยทาง ค่าตัวเลข และสถานะการตัดสินใจ ไม่มีซิมแยกสำหรับแท็บ GPS หรือ Compass

ส่วนที่ถอดเป็นแบบจำลองจาก source snapshot: การตรวจคุณภาพ/อายุ GPS และ fault latch, compass readiness และ calibration diagnostic, pending START โดย HOME ไม่ใช่ gate, sensor-unavailable neutral drive, explicit ESTOP/clear, GRID/sample holds, SPIRAL subset และ RTH dwell/gates มี source pointers ใน `SOURCE_MAP` ของโมเดล

Firmware อ้างอิงคือ working tree ภายในเครื่องที่มีการแก้ค้างอยู่ ไม่ใช่คำรับรองว่าเป็น GitHub ล่าสุดหรือเฟิร์มแวร์ที่แฟลชลงเรือแล้ว หลักฐาน source และ fingerprint อยู่ที่ `../../evidence/boat-simulation/FIRMWARE_REFERENCE.json` และ `SOURCE_EVIDENCE.md` นอกแพ็กเกจเว็บ

## สิ่งที่ย่อหรือยังไม่มี

- **ฟิสิกส์และการเลี้ยวเป็น teaching model:** target bearing → wrapped angular error → bounded turn rate + surge ใช้ heading ที่เปลี่ยนแล้วขยับตำแหน่ง ไม่ใช่ฟิสิกส์เรือที่สอบเทียบ ไม่ใช่ PWM/แรงขับจริง และไม่ใช่ full firmware LOS/GRID TURN–CAPTURE–TRACK/drive-slew
- **Water detector เป็น subset:** rolling SMA 8 ตัวอย่างและ absolute mean >50 NTU เท่านั้น ยังไม่ครอบคลุม baseline dwell, hysteresis, stale evidence และ ROC diagnostic ทั้งชุด จึงไม่ใช่ full WaterAnomalyMonitor port ค่าอินพุตและจังหวะ 250 ms เป็นของซิม
- **Live SET_HOME capture ยังไม่ได้ทำ:** มีเพียง HOME ที่ใส่โดย preset/ตัวเลือกและการเอา HOME ออกเพื่อทดลอง gate ไม่ได้จำลองขั้นเก็บ fix และตรวจ spread/speed ของ SET_HOME จริง
- ปุ่มทดลอง SPIRAL เป็นการสั่ง branch โดยผู้พรีเซ็นต์หลัง WP1 ไม่ใช่หลักฐานว่า detector จริงตรวจพบมลพิษ
- ไม่มีการเชื่อม GPS, compass, ESP-NOW, SD หรือเรือจริง สถานีฝั่งเป็นบริบท ไม่ใช่หลักฐานรับส่งข้อมูลจริง และไม่มีการ publish เว็บในงานนี้

## การตรวจและสถานะการยอมรับ

รัน `node --test` และ `python tools/check-links.py` จากโฟลเดอร์เว็บ Browser recipes คือ `tests/boat-mission-browser.py` (deterministic mission/renderer) และ `tests/boat-presentation-browser.py --layout --regression --out <evidence-directory>` (native START ปุ่มเดียวและการใช้งานจริง) ตรวจปลายทาง evidence ของสคริปต์ก่อนเรียกเพื่อไม่ทับประวัติงานเดิม

ผลปัจจุบันของการแก้หน้าซิมคลีนและ one-click START อยู่ที่ `../../evidence/clean-simulation/` รวม native click/clock/motion/fault gating, Chromium responsive/reduced-motion และ source fingerprints ส่วน `../../evidence/boat-simulation/coordinator/` เป็นหลักฐานรุ่นก่อนหน้า ไม่ใช่ผลยืนยัน UX ใหม่ อ่าน `REQ_CLEAN_SIM.md` และ handoff ของรอบแก้ล่าสุดเพื่อดูขอบเขต

**Independent acceptance: NOT VERIFIED. Physical/bench/pond acceptance: NOT VERIFIED.** การทดสอบซอฟต์แวร์ไม่พิสูจน์ว่าอาจารย์เข้าใจง่ายหรือว่าเรือจริงปลอดภัย ผู้ใช้ยังต้องลองลำดับเล่าบนจอพรีเซ็นต์จริงและยืนยันความชัดเจนของภาพ
