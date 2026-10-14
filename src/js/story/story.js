'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StoryView = api;
  if (root && root.document) {
    const page = root.document.getElementById('story-root');
    if (page && root.StoryModel) {
      const view = api.mountStory(page, root.StoryModel);
      root.StoryLab = { getSnapshot: view.getSnapshot, destroy: view.destroy };
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  function mountStory(root, modelApi) {
    const story = modelApi.createStory();
    const panels = Array.from(root.querySelectorAll('[data-story-panel]'));
    const scenes = Array.from(root.querySelectorAll('[data-scene]'));
    const message = root.querySelector('#story-message');
    const boat = root.querySelector('#story-boat');
    const map = root.querySelector('#story-map');
    const homeLabel = root.querySelector('#story-home-label');
    const scene0Motor = root.querySelector('#story-scene0-motor');
    const readinessNote = root.querySelector('#story-readiness-note');
    const mapNote = root.querySelector('#story-map-note');
    const flags = { gpsReady: root.querySelector('#story-ready-gps'), homeSet: root.querySelector('#story-ready-home'), routeReady: root.querySelector('#story-ready-route') };
    const values = { permission: root.querySelector('[data-indicator="permission"]'), motors: root.querySelector('[data-indicator="motors"]'), movement: root.querySelector('[data-indicator="movement"]') };
    const conditionNodes = { gpsReady: root.querySelector('#story-ready-node-gps'), homeSet: root.querySelector('#story-ready-node-home'), routeReady: root.querySelector('#story-ready-node-route') };
    const conditionLinks = { gpsReady: root.querySelector('#story-ready-link-gps'), homeSet: root.querySelector('#story-ready-link-home'), routeReady: root.querySelector('#story-ready-link-route') };
    const conditionText = { gpsReady: root.querySelector('#story-ready-text-gps'), homeSet: root.querySelector('#story-ready-text-home'), routeReady: root.querySelector('#story-ready-text-route') };
    const packetMarks = [root.querySelector('#story-packet'), root.querySelector('#story-packet-2')];

    function render() {
      const s = story.getSnapshot();
      panels.forEach((panel) => { panel.hidden = Number(panel.dataset.storyPanel) !== s.scene; });
      scenes.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.scene) === s.scene)));
      Object.entries(flags).forEach(([key, input]) => { input.checked = s[key]; input.disabled = s.missionStep !== 4; });
      const missing = missingChecks(s);
      const blocked = s.packet === 'blocked' && missing.length > 0;
      Object.entries(conditionNodes).forEach(([key, node]) => {
        const state = s[key] ? 'ready' : 'missing';
        node.dataset.state = state;
        conditionLinks[key].dataset.state = state;
        conditionText[key].dataset.state = state;
        conditionText[key].textContent = s[key] ? 'พร้อม' : 'ยังไม่พร้อม';
      });
      let text = 'ตัวอย่างที่เตรียมไว้แล้ว: GPS และเส้นทางพร้อม แต่ยังไม่ได้ตั้ง HOME';
      let state = blocked ? 'blocked' : 'waiting';
      if (s.missionStep === 4 && blocked) text = `START หยุดที่ readiness gate · ขาด ${missing.join(' · ')} · ตั้งเงื่อนไขแล้วส่ง START อีกครั้ง`;
      else if (s.missionStep === 4 && missing.length === 0) text = s.packet === 'blocked' ? 'ทุกเงื่อนไขพร้อมแล้ว · permission ยังรอคำสั่ง START ใหม่' : 'ทุกเงื่อนไขพร้อม · ส่ง START เพื่อขอ permission';
      if (s.missionStep === 5) { text = 'รับ START และผ่าน readiness แล้ว · ได้รับอนุญาต แต่ยังไม่เปิดมอเตอร์'; state = 'accepted'; }
      if (s.missionStep === 6) { text = 'ผลขั้นถัดไป: มอเตอร์ทำงาน · ลูกศรยังอยู่ที่จุดเริ่มต้น'; state = 'motors'; }
      if (s.missionStep === 7) { text = 'ผลขั้นถัดไป: ลูกศรเคลื่อนไป WP1 · จบตัวอย่าง'; state = 'moved'; }
      message.textContent = text; message.dataset.state = state;
      readinessNote.textContent = s.missionStep >= 7 ? 'สถานะตัวอย่าง: ผ่าน gate และเปิดมอเตอร์แล้ว ลูกศรอยู่ที่ WP1' : s.missionStep === 6 ? 'ผ่าน gate แล้วและมอเตอร์ทำงาน ลูกศรยังอยู่ที่จุดเริ่มต้น' : s.missionStep === 5 ? 'รับ START แล้ว: ได้ permission แต่มอเตอร์ยังไม่ทำงาน' : missing.length ? `สถานะตอนนี้: ขาด ${missing.join(' · ')} · แก้เงื่อนไขอย่างเดียวไม่ส่ง START ให้อัตโนมัติ` : 'ทุกเงื่อนไขพร้อม · ยังต้องส่ง START ใหม่เพื่อให้ gate ตัดสิน';
      mapNote.textContent = s.boatMoved ? 'ลูกศรแสดงตำแหน่งจำลองที่ WP1 หลังรับ START ผ่าน gate และเปิดมอเตอร์แล้ว' : s.motorsActive ? 'มอเตอร์ทำงานแล้ว แต่ลูกศรยังอยู่ที่จุดเริ่มต้นจนถึงผลขั้นเคลื่อนที่' : s.acceptedStart ? 'START ผ่าน gate แล้ว แต่ยังไม่ได้เปิดมอเตอร์ · ลูกศรอยู่ที่จุดเริ่มต้น' : 'กริดเก้าจุดเป็นตัวอย่าง · ลูกศรยังอยู่ที่จุดเริ่มต้น';
      scene0Motor.textContent = s.motorsActive ? 'มอเตอร์ทำงาน' : 'ยังไม่ทำงาน';
      root.dataset.packet = s.packet;
      values.permission.dataset.state = s.acceptedStart ? 'on' : 'blocked';
      values.permission.textContent = s.acceptedStart ? 'ได้รับอนุญาต' : 'ยังไม่อนุญาต';
      values.motors.dataset.state = s.motorsActive ? 'on' : 'blocked';
      values.motors.textContent = s.motorsActive ? 'มอเตอร์ทำงาน' : 'ยังไม่ทำงาน';
      values.movement.dataset.state = s.boatMoved ? 'on' : 'blocked';
      values.movement.textContent = s.boatMoved ? 'อยู่ที่ WP1' : 'อยู่จุดเริ่มต้น';
      boat.setAttribute('transform', s.boatMoved ? 'translate(440 170) rotate(-69.8)' : 'translate(335 455)');
      homeLabel.textContent = s.homeSet ? 'HOME' : 'จุดเริ่มต้น';
      map.dataset.packet = s.packet;
      root.dataset.packet = s.packet;
      if (s.packet !== 'blocked') packetMarks.forEach((packet) => packet.classList.remove('is-sending'));
      root.querySelector('#story-start').disabled = s.missionStep !== 4;
      root.querySelector('#story-next-effect').disabled = s.missionStep === 4 || s.missionStep >= 7;
    }

    function missingChecks(s) {
      const missing = [];
      if (!s.gpsReady) missing.push('GPS');
      if (!s.homeSet) missing.push('HOME');
      if (!s.routeReady) missing.push('เส้นทาง 9 จุด');
      return missing;
    }

    function onClick(event) {
      const target = event.target.closest ? event.target.closest('button') : event.target;
      if (!target || !root.contains(target)) return;
      if (target.dataset.scene !== undefined) story.selectScene(Number(target.dataset.scene));
      else if (target.id === 'story-start') {
        story.sendStart();
        if (story.getSnapshot().packet === 'blocked') replayPackets();
      }
      else if (target.id === 'story-next-effect') story.nextEffect();
      else if (target.id === 'story-reset') story.reset();
      else return;
      render();
    }

    function replayPackets() {
      packetMarks.forEach((packet) => {
        packet.classList.remove('is-sending');
        void packet.getBoundingClientRect().width;
        packet.classList.add('is-sending');
      });
    }

    function onChange(event) {
      const target = event.target;
      const keys = { 'story-ready-gps': 'gpsReady', 'story-ready-home': 'homeSet', 'story-ready-route': 'routeReady' };
      if (keys[target.id]) { story.setReadiness(keys[target.id], target.checked); render(); }
    }

    function onKeydown(event) {
      if (event.target.matches('input,textarea,select,[contenteditable=true],.diagram-viewport')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const s = story.getSnapshot();
      const next = Math.max(0, Math.min(3, s.scene + (event.key === 'ArrowRight' ? 1 : -1)));
      if (next !== s.scene) { event.preventDefault(); story.selectScene(next); render(); scenes[next].focus(); }
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeydown);
    render();
    return { getSnapshot: story.getSnapshot, destroy() { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKeydown); } };
  }

  return Object.freeze({ mountStory });
});
