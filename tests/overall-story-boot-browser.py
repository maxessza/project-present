"""Regression: fresh Overall boot and native START must reach canonical mission."""
import argparse, json, time, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
P=argparse.ArgumentParser();P.add_argument('--out',required=True);a=P.parse_args()
R=Path(__file__).resolve().parents[1];O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
r={'started':time.time(),'checks':[],'errors':[],'console':[]}
def check(name,ok,detail=None):r['checks'].append({'name':name,'passed':bool(ok),'detail':detail})
with sync_playwright() as p:
 b=p.chromium.launch();q=b.new_page(viewport={'width':1264,'height':720})
 q.on('pageerror',lambda e:r['errors'].append(str(e)));q.on('console',lambda m:r['console'].append(m.text) if m.type=='error' else None)
 try:
  q.goto((R/'index.html').as_uri());q.wait_for_selector('#fc-tour-toggle');q.wait_for_timeout(150)
  check('fresh page completes presentation boot without exceptions',not r['errors'],list(r['errors']))
  check('map disclosure installed once',q.locator('#fc-map').count()==1)
  check('detail begins hidden before START',not q.locator('.fc-detail').is_visible())
  check('bounded water and safety labs survive in technical details',q.locator('#fc-technical #whatif-details').count()==1 and q.locator('#fc-technical #rth-lab-details').count()==1)
  q.locator('#fc-tour-toggle').click();q.wait_for_timeout(1400)
  s=q.evaluate('AutonomousMission.snapshot()');r['start_snapshot']=s
  check('native START starts the canonical mission clock',s['playing'] and s['clockMs']>0,{'playing':s['playing'],'clock':s['clockMs']})
  check('native START reveals setup story and map',q.locator('#function-center').get_attribute('data-selected')=='setup' and q.locator('#am-map').is_visible())
  check('no click-time JavaScript exceptions',not r['errors'] and not r['console'],{'page':r['errors'],'console':r['console']})
  q.screenshot(path=str(O/'start.png'))
 except Exception as e:r['exception']=str(e);check('browser journey completes',False,str(e))
 finally:b.close()
r['source']={rel:hashlib.sha256((R/rel).read_bytes()).hexdigest() for rel in ['src/js/overall/function-centered-overall.js','src/css/function-flow.css','pages/overall.html']}
r['ended']=time.time();r['failed']=[c['name'] for c in r['checks'] if not c['passed']];r['child_exit']=int(bool(r['failed']))
(O/'RESULT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':len(r['checks']),'failed':r['failed'],'errors':r['errors'],'child_exit':r['child_exit']},ensure_ascii=False));raise SystemExit(r['child_exit'])
