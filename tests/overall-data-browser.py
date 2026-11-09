#!/usr/bin/env python3
"""Native Chromium checks for the Overall boat glyph and plain-Thai report view."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
import struct
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE_URL = (ROOT / 'pages/overall.html').as_uri()
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
report = {
    'url': PAGE_URL, 'started_unix': time.time(), 'checks': [], 'failures': [],
    'viewports': {}, 'screenshots': [], 'source_sha256': {}, 'lineage': {}, 'native_posts': [],
    'independent_decodes': [], 'browser_events': {}
}
SOURCES = ['pages/overall.html', 'src/css/overall-instrument.css',
          'src/js/overall/autonomous-mission.js', 'src/js/overall/mission-presentation.js',
          'src/js/overall/mission-kernel.js', 'src/js/overall/mission-transport.js',
          'src/js/overall/autonomous-mission-model.js', 'src/js/mission/uplink-motion.js',
          'tests/overall-data.test.js', 'tests/overall-data-browser.py']
for relative in SOURCES:
    source = ROOT / relative
    report['source_sha256'][relative] = hashlib.sha256(source.read_bytes()).hexdigest()


def check(name, passed, details=None):
    row = {'name': name, 'passed': bool(passed), 'details': details}
    report['checks'].append(row)
    if not passed:
        report['failures'].append(row)
        print(json.dumps({'failed': name, 'details': details}, ensure_ascii=False))


def watch(page, key):
    events = {'page_errors': [], 'console_errors': [], 'request_failures': []}
    page.on('pageerror', lambda error: events['page_errors'].append(str(error)))
    page.on('console', lambda msg: events['console_errors'].append(msg.text) if msg.type == 'error' else None)
    page.on('requestfailed', lambda req: events['request_failures'].append({'url': req.url, 'failure': req.failure}))
    report['browser_events'][key] = events


def save_screenshot(page, name, full_page=False):
    path = OUT / name
    page.screenshot(path=str(path), full_page=full_page)
    report['screenshots'].append(str(path))
    return path


def arrow_metrics(page):
    return page.evaluate("""() => {
      const svg=document.querySelector('#am-map'), boat=document.querySelector('#am-boat'), arrow=boat.querySelector('path');
      const s=window.AutonomousMission.snapshot(), box=arrow.getBBox(), m=arrow.getScreenCTM();
      const point=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(svg.getScreenCTM());};
      const local=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(m);};
      const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(p=>local(p[0],p[1]));
      const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
      const tip=local(0,-13), pose=point(s.position.x,s.position.y);
      const attachments=document.querySelectorAll('#am-heading-arrow,#am-heading-vector,#am-heading-error-arc');
      return {heading:s.heading,position:s.position,tip:{x:tip.x,y:tip.y},pose:{x:pose.x,y:pose.y},tip_error:Math.hypot(tip.x-pose.x,tip.y-pose.y),
        projected:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},
        local:{width:box.width,height:box.height},attachments_absent:attachments.length===0};
    }""")


def shown_values(page):
    return page.locator('#am-data-table [data-report-field]').evaluate_all("rows=>rows.map(row=>({field:row.dataset.reportField,label:row.querySelector('th[scope=row]').innerText,outgoing:row.querySelector('[data-report-value=outgoing]').innerText,received:row.querySelector('[data-report-value=received]').innerText}))")


POST_CAPTURE_SCRIPT = """(() => {
  window.__nativePosts=[];
  const original=MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage=function(value,transfer) {
    if(value instanceof ArrayBuffer) window.__nativePosts.push({bytes:Array.from(new Uint8Array(value)),byteLength:value.byteLength,transferCount:Array.isArray(transfer)?transfer.length:0,at:performance.now()});
    return original.apply(this,arguments);
  };
})();"""

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for width, height, name in ((1366, 768, '1366x768'), (390, 844, '390x844')):
            mobile = width == 390
            page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1,
                                    is_mobile=mobile, has_touch=mobile, reduced_motion='no-preference')
            watch(page, name)
            page.goto(PAGE_URL, wait_until='load')
            page.wait_for_function('!!window.AutonomousMission && !!window.MissionPresentation')
            home_before = page.evaluate('window.AutonomousMission.snapshot()')
            home_metrics = arrow_metrics(page)
            check(f'{name} HOME glyph tip remains anchored to authoritative pose', home_metrics['tip_error'] < 1, home_metrics)
            check(f'{name} HOME uses one small visible arrow without a ring', page.locator('#am-boat circle').count()==0 and page.locator('#am-home circle, #am-home path').count()==0 and home_metrics['projected']['width'] < 18 and home_metrics['projected']['height'] < 18 and (mobile or (home_metrics['projected']['width'] >= 10 and home_metrics['projected']['height'] >= 10)), home_metrics)
            check(f'{name} no heading line, arrowhead, or error arc protrudes from the boat', home_metrics['attachments_absent'], home_metrics)
            data_hidden = not page.locator('#am-data-details').is_visible()
            check(f'{name} detailed DATA is hidden outside its selected tab', data_hidden)
            page.locator('#am-tab-data').click()
            page.evaluate("""() => { window.AutonomousMission.configureTransport({delay:50}); window.AutonomousMission.publishSnapshot(); }""")
            page.wait_for_function("window.AutonomousMission.snapshot().transport.rx !== null", timeout=5000)
            page.wait_for_function("window.AutonomousMission.snapshot().transport.phase === 'shore'", timeout=5000)
            before_after_tab = page.evaluate('''() => {const s=window.AutonomousMission.snapshot();return {clockMs:s.clockMs,position:s.position,missionState:s.missionState,playing:s.playing}}''')
            rows = shown_values(page)
            details_text = page.locator('#am-data-details').inner_text()
            transfer_text = page.locator('#am-data-panel').inner_text()
            forbidden = re.search(r'\b(?:SEQ|TX|RX|queued|posted|decoded|stale|NaN|null|undefined|little-endian)\b', details_text+' '+transfer_text, re.I)
            body_widths = page.evaluate('''() => ({innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})''')
            body_overflow = body_widths['document'] > width or body_widths['body'] > width
            buttons = page.locator('#system button:visible').evaluate_all('els=>els.map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
            value_font = page.locator('#am-data-table [data-report-value]').first.evaluate('(e)=>getComputedStyle(e).fontSize')
            report['viewports'][name] = {'home_arrow':home_metrics,'mission_after_tab_and_report':before_after_tab,'body_widths':body_widths,'visible_buttons':buttons,'value_font_size':value_font,'visible_rows':rows}
            check(f'{name} DATA mode exposes all nine rows with matching outgoing and committed received values', page.locator('#am-data-details').is_visible() and len(rows)==9 and all(row['outgoing']==row['received'] for row in rows) and 'ชุดที่ 1' in page.locator('#am-outgoing-identity').inner_text() and 'ชุดที่ 1' in page.locator('#am-received-identity').inner_text(), rows)
            check(f'{name} mode change and report do not change mission state or pose', before_after_tab=={'clockMs':home_before['clockMs'],'position':home_before['position'],'missionState':home_before['missionState'],'playing':home_before['playing']}, before_after_tab)
            check(f'{name} detailed DATA copy uses plain Thai and no raw transfer terminology', forbidden is None, {'forbidden':forbidden.group(0) if forbidden else None,'text':details_text+' '+transfer_text})
            check(f'{name} detailed DATA view has no body horizontal overflow', not body_overflow, body_widths)
            check(f'{name} visible primary controls retain 44px targets', bool(buttons) and all(b['width']>=44 and b['height']>=44 for b in buttons), buttons)
            check(f'{name} displayed DATA values remain legible', float(value_font.replace('px',''))>=14, value_font)
            scene_shot = save_screenshot(page, f'{name}-data-scene-after.png')
            page.locator('#am-data-details').scroll_into_view_if_needed()
            table_shot = save_screenshot(page, f'{name}-data-table-after.png')
            full_shot = save_screenshot(page, f'{name}-data-full-after.png', full_page=True)
            report['viewports'][name]['screenshots'] = [str(scene_shot),str(table_shot),str(full_shot)]
            page.close()

        # Verify pose again while the canonical mission moves to a non-cardinal heading.
        pose_page = browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1,reduced_motion='no-preference')
        watch(pose_page, 'moving-pose')
        pose_page.add_init_script(POST_CAPTURE_SCRIPT)
        pose_page.goto(PAGE_URL,wait_until='load')
        pose_page.wait_for_function('!!window.AutonomousMission')
        pose_page.locator('#am-start').click()
        pose_page.wait_for_function("s=>{const v=window.AutonomousMission.snapshot();return v.clockMs>=200 && Math.abs(v.heading%90)>.05 && Math.hypot(v.position.x-s.x,v.position.y-s.y)>.01}",arg={'x':335,'y':455},timeout=5000)
        moving_metrics=arrow_metrics(pose_page)
        pose_page.locator('#am-toggle').click()
        # Setup is now a genuine station upload/START. Its first packets are
        # correctly STANDBY; capture a moving report too rather than assuming
        # the old preloaded navigation fixture at model time 1000ms.
        pose_page.evaluate('AutonomousMission.configureTransport({delay:30});AutonomousMission.publishSnapshot()')
        pose_page.wait_for_function('AutonomousMission.snapshot().transport.rx?.decoded.current_mode===1 && AutonomousMission.snapshot().transport.active===null',timeout=5000)
        moving_native_posts=pose_page.evaluate('window.__nativePosts.slice()')
        report['lineage']['moving_report']=pose_page.evaluate('AutonomousMission.snapshot().transport')
        check('1366x768 moving non-cardinal glyph stays under 18px and its tip follows pose', abs(moving_metrics['heading']%90)>.05 and moving_metrics['tip_error']<1 and moving_metrics['projected']['width']<18 and moving_metrics['projected']['height']<18,moving_metrics)
        report['viewports']['moving-pose']=moving_metrics
        pose_page.emulate_media(reduced_motion='reduce')
        reduced=pose_page.evaluate("""() => ({target:getComputedStyle(document.querySelector('#am-target')).animationName,path:getComputedStyle(document.querySelector('#am-route-progress')).animationName,boatTransition:getComputedStyle(document.querySelector('#am-boat')).transitionDuration})""")
        check('reduced motion keeps the anchored glyph but removes decorative animation',reduced['target']=='none' and reduced['path']=='none' and reduced['boatTransition'] in ('0s','0s, 0s'),reduced)
        pose_page.close()

        # Native MessagePort capture, actual callback lineage, retry, loss and reset retirement.
        page=browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1,reduced_motion='reduce')
        watch(page,'native-lineage')
        page.add_init_script(POST_CAPTURE_SCRIPT)
        page.goto(PAGE_URL,wait_until='load')
        page.wait_for_function('!!window.AutonomousMission')
        page.evaluate("""() => {
          window.AutonomousMission.setMode('DATA');
          window.AutonomousMission.configureTransport({delay:300});
          window.AutonomousMission.publishSnapshot();
          const gps=document.querySelector('[data-mission-input="gps"]');
          gps.checked=false;
          gps.dispatchEvent(new Event('change',{bubbles:true}));
        }""")
        page.wait_for_function("window.AutonomousMission.snapshot().transport.rx !== null",timeout=5000)
        first=page.evaluate("""() => {const s=window.AutonomousMission.snapshot();return {mission:{inputs:s.inputs,position:s.position,heading:s.heading,clockMs:s.clockMs},transport:s.transport,nativePosts:window.__nativePosts.slice(),table:document.querySelector('#am-data-details').innerText,values:Array.from(document.querySelectorAll('#am-data-table [data-report-field]'),r=>({field:r.dataset.reportField,outgoing:r.querySelector('[data-report-value=outgoing]').innerText,received:r.querySelector('[data-report-value=received]').innerText}))}}""")
        first_callbacks=[event for event in first['transport']['events'] if event.get('type')=='callback']
        first['callbacks']=first_callbacks
        report['lineage']['immutable_in_flight']=first
        check('in-flight source validity change does not replace bytes already prepared for the outgoing report',first['mission']['inputs']['gps'] is False and bool(first_callbacks) and first['transport']['latestTx']['seq']==1 and first['values'][1]['outgoing']!='ยังไม่มีตำแหน่งที่ใช้ได้' and first['values'][1]['received']!='ยังไม่ได้รับ',first)
        check('native receiver callback carries the same immutable bytes that were posted',len(first['nativePosts'])==1 and len(first_callbacks)==1 and first_callbacks[0]['receivedHex']==bytes(first['nativePosts'][0]['bytes']).hex(' '),{'posts':first['nativePosts'],'callbacks':first_callbacks})

        page.evaluate("""() => {
          window.AutonomousMission.reset();
          window.AutonomousMission.setMode('DATA');
          window.AutonomousMission.configureTransport({delay:220,dropFirst:true});
          window.AutonomousMission.fastForward(20);
        }""")
        queued=page.evaluate("""() => {const s=window.AutonomousMission.snapshot();return {transport:s.transport,packetText:document.querySelector('#am-packet-identity').innerText,shoreText:document.querySelector('#am-shore-value').innerText,rows:Array.from(document.querySelectorAll('#am-data-table [data-report-field]'),r=>({field:r.dataset.reportField,outgoing:r.querySelector('[data-report-value=outgoing]').innerText,received:r.querySelector('[data-report-value=received]').innerText}))}}""")
        report['lineage']['queued_before_attempt']=queued
        check('promoted queued report is described as preparing, not received or delivered',queued['transport']['phase']=='queued' and queued['transport']['active']['attempt']==0 and 'กำลังเตรียมชุดที่ 1' in queued['packetText'] and queued['transport']['rx'] is None,queued)
        page.wait_for_function("s=>{const t=window.AutonomousMission.snapshot().transport;return t.rx!==null && t.phase==='shore' && t.active===null}",timeout=8000)
        retried=page.evaluate("""() => {const s=window.AutonomousMission.snapshot();return {transport:s.transport,nativePosts:window.__nativePosts.slice(),values:Array.from(document.querySelectorAll('#am-data-table [data-report-field]'),r=>({field:r.dataset.reportField,outgoing:r.querySelector('[data-report-value=outgoing]').innerText,received:r.querySelector('[data-report-value=received]').innerText}))}}""")
        events=retried['transport']['events']
        dropped=next((event for event in events if event.get('type')=='drop'),None)
        retried_post=next((event for event in events if event.get('type')=='post'),None)
        retry_callback=next((event for event in events if event.get('type')=='callback'),None)
        retry_commit=next((event for event in events if event.get('type')=='commit'),None)
        retried['drop_event']=dropped;retried['post_event']=retried_post;retried['callback_event']=retry_callback;retried['commit_event']=retry_commit
        report['lineage']['drop_retry_received']=retried
        event_values=[dropped or {},retried_post or {},retry_callback or {},retry_commit or {}]
        event_sequences=[event.get('seq') for event in event_values]
        event_hex=[event.get('hex') or event.get('receivedHex') for event in event_values]
        check('drop/retry reuses the same report identity and byte sequence before shore commit',all((dropped,retried_post,retry_callback,retry_commit)) and event_sequences==[1,1,1,1] and len(set(event_hex))==1 and len(retried['nativePosts'])==2 and '1' in [row['received'] for row in retried['values'] if row['field']=='sequence_number'],retried)

        page.evaluate("""() => {
          window.AutonomousMission.configureTransport({delay:15,dropFirst:false,lossAll:true});
          window.AutonomousMission.fastForward(20);
        }""")
        page.wait_for_function("s=>{const t=window.AutonomousMission.snapshot().transport;return t.phase==='failed' && t.active===null && t.latestTx!==null}",timeout=5000)
        lost=page.evaluate("""() => {const s=window.AutonomousMission.snapshot();return {transport:s.transport,packetText:document.querySelector('#am-packet-identity').innerText,shoreText:document.querySelector('#am-shore-value').innerText,values:Array.from(document.querySelectorAll('#am-data-table [data-report-field]'),r=>({field:r.dataset.reportField,outgoing:r.querySelector('[data-report-value=outgoing]').innerText,received:r.querySelector('[data-report-value=received]').innerText})),nativePosts:window.__nativePosts.slice()}}""")
        report['lineage']['loss_keeps_last_received']=lost
        check('total modeled loss retains the previous received report and sends no native buffer for the failed report',lost['transport']['rx']['sequence']==1 and lost['transport']['latestTx']['seq']==2 and 'ยังไม่มีข้อมูลใหม่' in lost['shoreText'] and lost['values'][0]['outgoing']=='2' and lost['values'][0]['received']=='1' and len(lost['nativePosts'])==2,lost)

        page.evaluate("""() => {window.AutonomousMission.configureTransport({delay:320,lossAll:false,dropFirst:false});window.AutonomousMission.publishSnapshot();}""")
        page.wait_for_function("window.AutonomousMission.snapshot().transport.phase==='decoded' && window.AutonomousMission.snapshot().transport.receipts>0",timeout=5000)
        before_reset=page.evaluate("""() => {const t=window.AutonomousMission.snapshot().transport;return {phase:t.phase,receipts:t.receipts,active:t.active&&t.active.seq,posts:window.__nativePosts.length}}""")
        page.evaluate("window.AutonomousMission.reset()")
        page.wait_for_timeout(450)
        after_reset=page.evaluate("""() => {const s=window.AutonomousMission.snapshot();return {transport:s.transport,table:document.querySelector('#am-data-details').innerText,rows:Array.from(document.querySelectorAll('#am-data-table [data-report-field]'),r=>({outgoing:r.querySelector('[data-report-value=outgoing]').innerText,received:r.querySelector('[data-report-value=received]').innerText}))}}""")
        report['lineage']['reset_after_callback_before_commit']={'before':before_reset,'after':after_reset}
        check('RESET clears DATA and retires a real decoded callback before its delayed DOM commit',before_reset['phase']=='decoded' and before_reset['receipts']>0 and after_reset['transport']['rx'] is None and after_reset['transport']['active'] is None and all(row['outgoing']=='ยังไม่มีชุดข้อมูล' and row['received']=='ยังไม่ได้รับ' for row in after_reset['rows']),{'before':before_reset,'after':after_reset})

        report['native_posts']=page.evaluate('window.__nativePosts.slice()')
        report['native_posts'].extend(moving_native_posts)
        report['lineage']['final_generation_snapshot']=page.evaluate('window.AutonomousMission.snapshot().transport')
        page.close()
        browser.close()
except Exception as error:
    report['failures'].append({'type':type(error).__name__,'message':str(error)})
    print(f'{type(error).__name__}: {error}')

# Independent Python decoding of every saved native buffer, without using the page codec.
FIELDS=('sequence_number','gps_lat','gps_lon','water_ph','water_turbidity','water_temp','current_mode','battery_percent','heading_angle')
MODES={0:'เตรียมพร้อมหรือพักหลังจบภารกิจ',1:'สำรวจตามจุดที่กำหนด',2:'สแกนก้นหอย',3:'กลับจุดเริ่มต้น'}
def trim_float(value, digits):
    rounded=round(value,digits)
    if rounded == 0:
        rounded=0
    return str(int(rounded)) if float(rounded).is_integer() else str(rounded)
def display(field,value):
    if field in ('gps_lat','gps_lon'):
        return f'{trim_float(value,6)}°' if math.isfinite(value) else 'ยังไม่มีตำแหน่งที่ใช้ได้'
    if field=='heading_angle':
        return f'{trim_float(value,1)}°' if math.isfinite(value) else 'ยังไม่มีทิศทางที่ใช้ได้'
    if field=='water_ph':
        return f'{trim_float(value,2)} pH' if math.isfinite(value) else 'ยังไม่มีค่าที่พร้อมเผยแพร่'
    if field=='water_turbidity':
        return f'{trim_float(value,2)} NTU' if math.isfinite(value) else 'ยังไม่มีค่าที่พร้อมเผยแพร่'
    if field=='water_temp':
        return f'{trim_float(value,1)} °C' if math.isfinite(value) else 'ยังไม่มีค่าที่พร้อมเผยแพร่'
    if field=='current_mode':
        return MODES.get(int(value),'ยังไม่มีค่าที่พร้อมเผยแพร่')
    if field=='battery_percent':
        return f'{int(value)}%'
    return str(int(value))

for index, native in enumerate(report['native_posts']):
    raw=bytes(native['bytes'])
    if len(raw)!=38:
        report['failures'].append({'type':'native_buffer_length','index':index,'length':len(raw)})
        continue
    values=struct.unpack('<IddfffBBf',raw)
    decoded=dict(zip(FIELDS,values))
    report['independent_decodes'].append({'post_index':index,'length':len(raw),'sequence_number':decoded['sequence_number'],'current_mode':decoded['current_mode'],'values':decoded,'display_values':{field:display(field,decoded[field]) for field in FIELDS},'hex':raw.hex(' ')})

if report['independent_decodes']:
    check('Python independently decodes each native 38-byte post into all nine fields',len(report['independent_decodes'])==len(report['native_posts']) and all(len(item['values'])==9 for item in report['independent_decodes']),report['independent_decodes'])
    check('native records include the captured READY and GRID mode values',set(item['current_mode'] for item in report['independent_decodes']) >= {0,1},[item['current_mode'] for item in report['independent_decodes']])
    for entry in report['independent_decodes']:
        if entry['post_index']==0:
            callback=report.get('lineage',{}).get('immutable_in_flight',{}).get('callbacks',[])
            check('independent first buffer bytes match the saved actual callback',bool(callback) and entry['hex']==callback[0].get('receivedHex'),{'decoded_hex':entry['hex'],'callback':callback})
        if entry['post_index']==1:
            retry=report.get('lineage',{}).get('drop_retry_received',{})
            check('independent retry buffer values match the DATA table for all nine received fields',bool(retry) and all(entry['display_values'][row['field']]==row['received'] for row in retry.get('values',[])),{'decoded':entry['display_values'],'table':retry.get('values')})

report['ended_unix']=time.time()
report['exit_code']=1 if report['failures'] else 0
def json_safe(value):
    if isinstance(value,float) and not math.isfinite(value):
        return 'NaN' if math.isnan(value) else ('Infinity' if value>0 else '-Infinity')
    if isinstance(value,dict):
        return {key:json_safe(item) for key,item in value.items()}
    if isinstance(value,list):
        return [json_safe(item) for item in value]
    return value

report_path=OUT/'overall-data-browser.json'
report_path.write_text(json.dumps(json_safe(report),ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
print(json.dumps({'exit_code':report['exit_code'],'checks_passed':sum(row['passed'] for row in report['checks']),'checks_total':len(report['checks']),'failures':report['failures'],'native_posts':len(report['native_posts']),'independent_decodes':len(report['independent_decodes']),'report':str(report_path),'screenshots':report['screenshots']},ensure_ascii=False))
raise SystemExit(report['exit_code'])
