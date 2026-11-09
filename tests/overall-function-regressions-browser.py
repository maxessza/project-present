"""Coordinator regression for independent findings F1-F3; output is caller-isolated."""
import argparse,json,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();O=Path(a.out);O.mkdir(parents=True,exist_ok=True);R=Path(__file__).resolve().parents[1]
report={'started':time.time(),'checks':[],'states':{},'errors':[],'source_sha256':hashlib.sha256((R/'src/js/overall/function-centered-overall.js').read_bytes()).hexdigest()}
def check(name,ok,detail=None):report['checks'].append({'name':name,'passed':bool(ok),'detail':detail})
def snap(q):return q.evaluate('AutonomousMission.snapshot()')
def select(q,name):
 owner={'setup':'start','sensors':'start','segment':'navigate','waypoints':'navigate','heading':'navigate','drive':'navigate','safety':'navigate','water':'measure','report':'measure'}[name]
 if not q.locator('[data-function="'+name+'"]').is_visible():q.locator('[data-system-group="'+owner+'"]').click()
 q.locator('[data-function="'+name+'"]').click()
 if not q.locator('#fc-technical').evaluate('(e)=>e.open'):q.locator('#fc-technical>summary').click()
 if name=='report' and not q.locator('#fc-report-inventory').evaluate('(e)=>e.open'):q.locator('#fc-report-inventory>summary').click()
def value(q,label):return q.get_by_text(label,exact=True).locator('..').locator('dd').inner_text()
def pwm(p):return f"{p['left']:.0f} / {p['right']:.0f} signed PWM"
def links(q,stage):
 for prev in ['drive','safety','setup']:
  select(q,prev);select(q,'heading');check('F2 '+stage+' '+prev+' to heading',q.locator('#fc-heading-lab').is_visible())
  select(q,'drive');check('F2 '+stage+' hide PID outside heading '+prev,not q.locator('#fc-heading-lab').is_visible())
def drive(q,mode):
 s=snap(q);select(q,'drive');r=next((r for r in s['rows'] if r['key'] in ['grid-drive','drive-interlocks']),None);v=value(q,'Applied ในบันทึกรอบล่าสุด');report['states'][mode]={'snapshot':s,'rendered_record':v}
 check('F3 actual '+mode+' final-drive record',s['mode']==mode and r is not None and v==pwm(r['output']['appliedPwm']),{'row':r,'rendered':v})
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);q=b.new_page(viewport={'width':1440,'height':900});q.set_default_timeout(10000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
  q.goto((R/'index.html').as_uri());q.wait_for_selector('#function-overview');links(q,'initial')
  select(q,'report');check('F1 fresh report no receipt',value(q,'รายงานล่าสุดที่ฝั่งรับ')=='ยังไม่ได้รับ')
  q.locator('.am-input-details>summary').click();q.locator('#am-wire-speed').select_option('700');q.locator('.am-input-details>summary').click();q.locator('#am-speed').select_option('4');q.locator('#am-start').click()
  q.wait_for_function("()=>{const s=AutonomousMission.snapshot();return s.mode==='GRID_PATROL'&&s.clockMs>1000&&s.transport.active;}",timeout=30000);q.locator('#am-toggle').click();s=snap(q);seq=s['transport']['active']['seq'];clock=s['clockMs'];pos=s['position']
  q.wait_for_function('seq=>{const s=AutonomousMission.snapshot();return s.transport.rx&&s.transport.rx.sequence>=seq;}',arg=seq,timeout=15000);s=snap(q);report['states']['receipt']=s
  check('F1 receipt during pause matches actual sequence',value(q,'รายงานล่าสุดที่ฝั่งรับ')==str(s['transport']['rx']['sequence']),{'rendered':value(q,'รายงานล่าสุดที่ฝั่งรับ'),'actual':s['transport']['rx']['sequence']})
  check('F1 receipt leaves mission clock and pose paused',s['clockMs']==clock and s['position']==pos)
  q.wait_for_function('()=>{const t=AutonomousMission.snapshot().transport;return !t.active&&!t.pending;}',timeout=15000);links(q,'paused');drive(q,'GRID_PATROL')
  select(q,'report');before=snap(q)['transport']['rx'];table=q.locator('[data-report-value="received"]').all_inner_texts();q.locator('.am-input-details>summary').click();q.locator('#am-loss-all').check();q.locator('.am-input-details>summary').click();start=snap(q)['clockMs'];q.locator('#am-toggle').click();q.wait_for_function('at=>AutonomousMission.snapshot().clockMs>at+1500',arg=start,timeout=10000);q.locator('#am-toggle').click();q.wait_for_function('()=>{const t=AutonomousMission.snapshot().transport;return !t.active&&!t.pending;}',timeout=15000)
  s=snap(q);check('F1 loss preserves actual last RX identity and summary',json.dumps(s['transport']['rx'],sort_keys=True,allow_nan=True)==json.dumps(before,sort_keys=True,allow_nan=True) and value(q,'รายงานล่าสุดที่ฝั่งรับ')==str(before['sequence']),{'before':before,'after':s['transport']['rx'],'summary':value(q,'รายงานล่าสุดที่ฝั่งรับ'),'transport':s['transport']})
  check('F1 loss preserves actual nine-field last-received table',table==q.locator('[data-report-value="received"]').all_inner_texts() and len(table)==9)
  select(q,'safety');q.locator('.am-input-details>summary').click();q.locator('#am-loss-all').uncheck();q.locator('[data-policy-command="FORCE_RTH"]').click();q.wait_for_function("AutonomousMission.snapshot().mode==='RETURN_HOME'");q.locator('.am-input-details>summary').click();q.locator('#am-next').click();drive(q,'RETURN_HOME')
  select(q,'water');q.locator('#am-spiral-demo').click();q.wait_for_function("AutonomousMission.snapshot().mode==='SPIRAL_SCAN'",timeout=60000)
  if snap(q)['playing']:q.locator('#am-toggle').click()
  drive(q,'SPIRAL_SCAN');q.locator('#am-reset').click();select(q,'report');check('F1 reset clears receipt summary',snap(q)['transport']['rx'] is None and value(q,'รายงานล่าสุดที่ฝั่งรับ')=='ยังไม่ได้รับ');check('F1 reset clears nine-field received table',all('ยังไม่ได้รับ' in x for x in q.locator('[data-report-value="received"]').all_inner_texts()))
  select(q,'heading');q.locator('.fc-detail').scroll_into_view_if_needed();q.screenshot(path=str(O/'heading-after-switch.png'));check('no runtime errors',not report['errors'],report['errors']);b.close()
except Exception as e:report['exception']=str(e)
report['ended']=time.time();report['failed']=[x for x in report['checks'] if not x['passed']];report['child_exit']=1 if report.get('exception') or report['failed'] else 0
(O/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':len(report['checks']),'failed':[x['name'] for x in report['failed']],'exception':report.get('exception'),'child_exit':report['child_exit']},ensure_ascii=False));raise SystemExit(report['child_exit'])
