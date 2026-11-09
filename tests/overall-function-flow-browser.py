"""Native acceptance for the approved Overall flow; all evidence is caller-isolated."""
import argparse,json,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();O=Path(a.out);O.mkdir(parents=True,exist_ok=True);R=Path(__file__).resolve().parents[1]
report={'started':time.time(),'checks':[],'page_errors':[],'console_errors':[],'captures':[]}
def check(name,ok,detail=None):
 report['checks'].append({'name':name,'passed':bool(ok),'detail':detail})
 if not ok:raise AssertionError(name)
def snap(q):return q.evaluate('AutonomousMission.snapshot()')
def sig(q):return q.evaluate("""()=>{const s=AutonomousMission.snapshot();return JSON.stringify({clock:s.clockMs,playing:s.playing,mode:s.mode,pose:s.position,heading:s.heading,index:s.waypointIndex,accepted:s.acceptedRoute,incoming:s.incoming,transport:s.transport});}""")
def shot(q,name):
 f=O/(name+'.png');q.screenshot(path=str(f),full_page=True);report['captures'].append({'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'url':q.url,'viewport':q.viewport_size,'timestamp':time.time()})
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);q=b.new_page(viewport={'width':1440,'height':900});q.set_default_timeout(8000)
  q.on('pageerror',lambda e:report['page_errors'].append(str(e)));q.on('console',lambda m:report['console_errors'].append(m.text) if m.type=='error' else None)
  q.goto((R/'index.html').as_uri());q.wait_for_function("document.querySelectorAll('#function-overview [data-function]').length===9")
  names=['setup','sensors','segment','waypoints','heading','drive','water','report','safety']
  check('root entry reaches current function-centered Overall',q.url.endswith('/pages/overall.html') and q.locator('#function-overview').is_visible())
  check('one native SIM is immediately available; old duplicate controls removed',q.locator('#am-start').is_visible() and q.locator('#ms-start-btn,#sim-start,#learn,#operate,#mission-start').count()==0)
  check('one connected backbone and feedback/support branches',q.locator('#fc-backbone [data-function]').count()==4 and q.locator('#fc-support [data-function]').count()==3 and q.locator('.fc-feedback').is_visible())
  seen=[];initial=sig(q)
  for name in names:
   q.locator(f'button[data-function="{name}"]').click();t=q.locator('.fc-detail').inner_text();seen.append(t)
   check(name+' has distinct inputs, predicate/formula and consumer',q.locator(f'[data-function="{name}"]').get_attribute('aria-pressed')=='true' and len(q.locator('#fc-input-values').inner_text())>20 and len(q.locator('#fc-formula').inner_text())>20 and len(q.locator('#fc-consumer').inner_text())>20)
   check(name+' inspection never mutates initial canonical state',sig(q)==initial)
   check(name+' does not fabricate NaN/undefined numeric values','undefined' not in t and 'NaN' not in '\n'.join(q.locator('#fc-input-values,#fc-output-values').all_inner_texts()))
  check('all nine explanations are distinct',len(set(seen))==9)
  q.locator('[data-function="setup"]').click();q.evaluate('scrollTo(0,0)');shot(q,'desktop-overview')
  q.locator('[data-function="heading"]').focus();q.keyboard.press('Enter');check('keyboard activates heading and exposes unchanged PID A/B lab',q.locator('#fc-detail-title').inner_text()=='ควบคุมทิศทาง' and q.locator('#fc-heading-lab').is_visible() and q.locator('#fc-heading-lab').get_attribute('href')=='heading-pid.html')
  q.locator('#am-start').click();q.wait_for_function("()=>{const s=AutonomousMission.snapshot();return s.mode==='GRID_PATROL'&&s.clockMs>0&&s.position.x!==335&&s.transport.rx;}",timeout=25000)
  moving=snap(q);check('fresh native SIM receives/applies route and START then moves',len(moving['acceptedRoute'])==9 and len(moving['incoming']['received'])>=2 and len(moving['incoming']['applied'])>=2 and moving['position']!={'x':335,'y':455},{'clock':moving['clockMs'],'position':moving['position'],'incoming':moving['incoming']})
  q.locator('#am-toggle').click();q.wait_for_function("()=>{const s=AutonomousMission.snapshot();return !s.playing&&!s.transport.active&&!s.transport.pending;}",timeout=10000);paused=sig(q)
  for name in names:
   q.locator(f'[data-function="{name}"]').click();check(name+' inspection leaves paused time/pose/route/transport untouched',sig(q)==paused)
  q.locator('[data-function="drive"]').click();s=snap(q);out=q.locator('#fc-output-values').inner_text();check('drive shows real final applied rather than nonexistent fallback fields',f"{s['appliedPwm']['left']} / {s['appliedPwm']['right']} signed PWM" in out,out)
  q.locator('[data-function="waypoints"]').click();s=snap(q);n=next((r for r in s['rows'] if r['key']=='grid-los-reach'),None);check('waypoint explanation retains old-index evaluation separately from current target',n is not None and f"index {n['inputs']['index']}" in q.locator('#fc-output-values').inner_text());shot(q,'desktop-los')
  q.locator('[data-function="report"]').click();check('report inventory is accessible without raw packet disclosure',q.locator('#am-data-details').is_visible() and q.locator('#am-data-table [data-report-field]').count()==9)
  s=snap(q);report['report_snapshot']=s['transport'];check('report uses actual immutable TX and decoded RX',bool(s['transport']['latestTx']['hex'] and s['transport']['rx']['hex']) and all(q.locator(x).count()==9 for x in ['#am-data-table [data-report-value="outgoing"]','#am-data-table [data-report-value="received"]']))
  q.locator('[data-function="water"]').click();check('water data and specialized sample inspector are contextual',q.locator('#whatif-details').is_visible() and q.locator('#am-spiral-demo').is_visible() and not q.locator('#rth-lab-details').is_visible())
  q.locator('[data-function="safety"]').click();check('RTH inspector is contextual and has its existing inputs',q.locator('#rth-lab-details').is_visible());q.locator('#rth-lab-details>summary').click();q.locator('#rth-home-set').check();q.locator('#rth-fix-valid').check();q.locator('#rth-tick').click();check('retained RTH inspector responds to a native tick','1000' in q.locator('#rth-outside-ms').inner_text())
  for old,owner in [('learn','setup'),('overview','segment'),('pid','heading'),('mission-start','setup'),('ms-uplink-panel','report'),('operate','setup'),('system','setup')]:
   q.evaluate('(h)=>location.hash=h',old);q.wait_for_function('(id)=>document.querySelector(`[data-function="${id}"]`).getAttribute("aria-pressed")==="true"',arg=owner);check('legacy #'+old+' reaches owning function',q.locator(f'[data-function="{owner}"]').get_attribute('aria-pressed')=='true')
  q.locator('[data-function="sensors"]').click();q.locator('#system .am-input-details>summary').click();q.locator('[data-mission-input="gps"]').uncheck();q.locator('#am-next').click();s=snap(q);check('next tick preserves existing GPS interlock and displays actual zero drive',s['appliedPwm']=={'left':0,'right':0},s['driveDecision']);q.locator('[data-function="drive"]').click();check('drive explains the authoritative navigation stop','NAVIGATION_UNAVAILABLE' in q.locator('.fc-detail').inner_text())
  q.locator('#am-reset').click();check('RESET retires old state and actual report rows',snap(q)['clockMs']==0 and snap(q)['transport']['rx'] is None);q.locator('[data-function="report"]').click();check('reset table does not show stale received values',all('ยังไม่ได้รับ' in v for v in q.locator('#am-data-table [data-report-value="received"]').all_inner_texts()))
  q.set_viewport_size({'width':390,'height':844});q.locator('[data-function="heading"]').click();q.evaluate('scrollTo(0,0)');shot(q,'phone-heading');dims=q.evaluate("()=>({body:document.body.scrollWidth,doc:document.documentElement.scrollWidth,width:innerWidth,targets:[...document.querySelectorAll('.fc-function,#am-start,#am-next,#am-toggle,#am-reset')].map(x=>x.getBoundingClientRect().height)})");check('390px has no body overflow and native primary targets are 44px',dims['body']<=dims['width'] and dims['doc']<=dims['width'] and all(x>=44 for x in dims['targets']),dims)
  q.emulate_media(reduced_motion='reduce');check('reduced motion preserves content without animated node transitions',q.locator('#fc-input-values').is_visible() and q.evaluate("getComputedStyle(document.querySelector('.fc-function')).transitionDuration==='0s'"))
  check('fresh initialization and all native actions have zero page/console errors',not report['page_errors'] and not report['console_errors'],{'page':report['page_errors'],'console':report['console_errors']});b.close()
except Exception as e:report['exception']=str(e)
report['ended']=time.time();report['failed']=[x for x in report['checks'] if not x['passed']];report['child_exit_code']=1 if report.get('exception') or report['failed'] else 0
(O/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=True),encoding='utf-8');print(json.dumps({'checks':len(report['checks']),'failed':report['failed'],'exception':report.get('exception'),'exit':report['child_exit_code']},ensure_ascii=False));raise SystemExit(report['child_exit_code'])
