"""Owner-directed minimal Overall acceptance. Outputs always caller-isolated."""
import argparse,json,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();O=Path(a.out);O.mkdir(parents=True,exist_ok=True);R=Path(__file__).resolve().parents[1]
r={'started':time.time(),'checks':[],'errors':[],'console':[]}
def check(name,ok,detail=None):r['checks'].append({'name':name,'passed':bool(ok),'detail':detail})
def snap(q):return q.evaluate('AutonomousMission.snapshot()')
def signature(q):return q.evaluate("()=>{const s=AutonomousMission.snapshot();return JSON.stringify({clock:s.clockMs,playing:s.playing,position:s.position,heading:s.heading,index:s.waypointIndex,route:s.acceptedRoute,incoming:s.incoming,transport:s.transport});}")
def choose(q,name):
 owner={'setup':'start','sensors':'start','segment':'navigate','waypoints':'navigate','heading':'navigate','drive':'navigate','safety':'navigate','water':'measure','report':'measure'}[name]
 if not q.locator('[data-function="'+name+'"]').is_visible():q.locator('[data-system-group="'+owner+'"]').click()
 q.locator('[data-function="'+name+'"]').click()
def shot(q,name):
 f=O/(name+'.png');q.screenshot(path=str(f));r.setdefault('captures',[]).append({'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'url':q.url,'viewport':q.viewport_size,'timestamp':time.time()})
with sync_playwright() as p:
 b=p.chromium.launch();q=b.new_page(viewport={'width':1440,'height':900});q.on('pageerror',lambda e:r['errors'].append(str(e)));q.on('console',lambda m:r['console'].append(m.text) if m.type=='error' else None)
 q.goto((R/'index.html').as_uri());q.wait_for_selector('#function-overview');q.screenshot(path=str(O/'initial.png'))
 check('overview has three system areas',q.locator('[data-system-group]:visible').count()==3)
 check('overview does not expose nine function tiles',q.locator('[data-function]:visible').count()==0,q.locator('[data-function]:visible').count())
 check('overview has no selected detail wall',not q.locator('.fc-detail').is_visible())
 check('overview defers formulas and numeric grid',not q.locator('#fc-formula').is_visible() and not q.locator('#fc-input-values').is_visible())
 check('overview defers boat scene',not q.locator('#am-map').is_visible())
 check('no runtime errors',not r['errors'] and not r['console'])
 for group,names in [('start',['setup','sensors']),('navigate',['segment','waypoints','heading','drive','safety']),('measure',['water','report'])]:
  q.locator('[data-system-group="'+group+'"]').focus();q.keyboard.press('Enter')
  check(group+' exposes only its own function links',q.locator('[data-function]:visible').count()==len(names))
  for name in names:
   q.locator('[data-function="'+name+'"]').focus();q.keyboard.press('Enter')
   check(name+' has one concise input-logic-output triplet',q.locator('#fc-simple>section:visible').count()==3)
   check(name+' defers detailed formulas until requested',not q.locator('#fc-formula').is_visible() and not q.locator('#am-map').is_visible())
 shot(q,'desktop-report');q.locator('#fc-technical>summary').click();check('full formulas and input values open explicitly',q.locator('#fc-formula').is_visible() and q.locator('#fc-input-values').is_visible());q.locator('#fc-technical>summary').click()
 q.locator('#fc-report-inventory>summary').click();check('actual nine-field report inventory remains in canonical root',q.locator('#am-data-table').is_visible() and q.locator('#system #am-data-table [data-report-field]').count()==9)
 q.locator('.am-input-details>summary').click();q.locator('#am-wire-speed').select_option('700');q.locator('.am-input-details>summary').click();q.locator('#am-speed').select_option('4');q.locator('#am-start').click()
 q.wait_for_function("()=>{const s=AutonomousMission.snapshot();return s.mode==='GRID_PATROL'&&s.clockMs>1000&&s.transport.active;}",timeout=30000);q.locator('#am-toggle').click();paused=snap(q);seq=paused['transport']['active']['seq']
 q.wait_for_function('n=>{const t=AutonomousMission.snapshot().transport;return t.rx&&t.rx.sequence>=n;}',arg=seq,timeout=15000);s=snap(q);r['receipt_snapshot']=s
 check('fresh SIM receives route and starts canonical navigation',len(s['acceptedRoute'])==9 and s['clockMs']>0 and s['position']!={'x':335,'y':455})
 check('compact report updates on actual receipt while paused',q.locator('#fc-simple-output').inner_text()=='ชุดที่ '+str(s['transport']['rx']['sequence']))
 check('paused receipt never advances pose or clock',s['clockMs']==paused['clockMs'] and s['position']==paused['position'])
 q.wait_for_function('()=>{const t=AutonomousMission.snapshot().transport;return !t.active&&!t.pending;}',timeout=15000);stable=signature(q)
 for name in ['setup','sensors','segment','waypoints','heading','drive','water','report','safety']:
  choose(q,name);check(name+' and group navigation preserve paused canonical identity',signature(q)==stable)
  check(name+' still shows only concise triplet by default',q.locator('#fc-simple>section:visible').count()==3 and not q.locator('#fc-formula').is_visible())
 for prev in ['drive','safety']:
  choose(q,prev);choose(q,'heading');check('PID link survives paused '+prev+' to heading',q.locator('#fc-heading-lab').is_visible());choose(q,'drive');check('PID link hides outside heading from '+prev,not q.locator('#fc-heading-lab').is_visible())
 s=snap(q);check('compact motor values match actual applied command',q.locator('#fc-simple-output').inner_text()==f"{s['appliedPwm']['left']} / {s['appliedPwm']['right']} signed PWM")
 choose(q,'heading');q.evaluate('scrollTo(0,0)');shot(q,'desktop-heading');q.locator('#fc-map>summary').click();check('supporting map opens only on request',q.locator('#am-map').is_visible());check('opening map preserves paused identity',signature(q)==stable);q.locator('#fc-map>summary').click()
 q.locator('.fc-back').click();check('return to overview retains paused state',signature(q)==stable and not q.locator('.fc-detail').is_visible() and q.locator('[data-function]:visible').count()==0)
 for old,owner in [('learn','setup'),('overview','segment'),('pid','heading'),('mission-start','setup'),('ms-uplink-panel','report'),('operate','setup'),('system','setup')]:
  q.evaluate('(h)=>location.hash=h',old);q.wait_for_function('(id)=>document.querySelector(`[data-function="${id}"]`).getAttribute("aria-pressed")==="true"',arg=owner);check('legacy '+old+' reveals owner in minimal layout',q.locator('[data-function="'+owner+'"]').is_visible() and q.locator('.fc-detail').is_visible())
 choose(q,'report');q.locator('#am-reset').click();check('reset clears actual RX and compact summary',snap(q)['transport']['rx'] is None and q.locator('#fc-simple-output').inner_text()=='ยังไม่ได้รับ')
 q.locator('.fc-back').click();q.set_viewport_size({'width':390,'height':844});q.evaluate('scrollTo(0,0)');shot(q,'phone-overview');check('phone overview remains only three areas',q.locator('[data-system-group]:visible').count()==3 and q.locator('[data-function]:visible').count()==0)
 dims=q.evaluate("()=>({body:document.body.scrollWidth,width:innerWidth,areas:[...document.querySelectorAll('[data-system-group]')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))})");check('phone overview has no horizontal overflow and 44px targets',dims['body']<=dims['width'] and all(x['w']>=44 and x['h']>=44 for x in dims['areas']),dims)
 choose(q,'heading');q.locator('.fc-detail').scroll_into_view_if_needed();shot(q,'phone-heading');check('phone detail triplet and PID link readable',q.locator('#fc-simple>section:visible').count()==3 and q.locator('#fc-heading-lab').is_visible() and q.evaluate('document.body.scrollWidth<=innerWidth'))
 q.emulate_media(reduced_motion='reduce');check('reduced motion preserves concise explanation',q.locator('#fc-simple').is_visible() and q.evaluate("getComputedStyle(document.querySelector('.fc-function')).transitionDuration==='0s'"));check('final no page or console errors',not r['errors'] and not r['console'],{'page':r['errors'],'console':r['console']});b.close()
 r['source_sha256']={n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in ['src/js/overall/function-centered-overall.js','src/css/function-flow.css']}

r['ended']=time.time();r['failed']=[x for x in r['checks'] if not x['passed']];r['child_exit']=1 if r['failed'] else 0
(O/'RESULT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':len(r['checks']),'failed':[x['name'] for x in r['failed']],'child_exit':r['child_exit']},ensure_ascii=False));raise SystemExit(r['child_exit'])
