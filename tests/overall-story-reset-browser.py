"""Native regression for RESET leaving an orphan story timer."""
import argparse,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();R=Path(__file__).resolve().parents[1];O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
r={'started':time.time(),'checks':[],'errors':[]}
def check(name,ok,detail=None):r['checks'].append({'name':name,'passed':bool(ok),'detail':detail})
with sync_playwright() as p:
 b=p.chromium.launch();q=b.new_page(viewport={'width':1264,'height':720});q.on('pageerror',lambda e:r['errors'].append(str(e)))
 try:
  q.goto((R/'index.html').as_uri());q.locator('#fc-tour-toggle').click();q.wait_for_timeout(1000)
  q.locator('#fc-technical>summary').click();q.locator('#fc-simulation-tools>summary').click();q.locator('#am-reset').click()
  check('native RESET returns story UI to intro',q.locator('#function-center').get_attribute('data-view')=='intro')
  check('native RESET clears playing label',q.locator('#fc-tour-toggle').get_attribute('aria-pressed')=='false')
  q.wait_for_timeout(7600);s=q.evaluate('AutonomousMission.snapshot()');r['after_reset']=s
  check('old story timeout never advances after RESET',q.locator('#function-center').get_attribute('data-selected')=='setup' and q.locator('#function-center').get_attribute('data-view')=='intro')
  check('RESET retires mission and incoming results',not s['playing'] and s['clockMs']==0 and not s['acceptedRoute'])
  q.screenshot(path=str(O/'after-reset.png'))
  q.locator('#fc-tour-toggle').click();q.wait_for_timeout(1000);s=q.evaluate('AutonomousMission.snapshot()')
  check('fresh START still works after resetting story',s['playing'] and s['clockMs']>0 and q.locator('#function-center').get_attribute('data-selected')=='setup')
  check('no runtime exceptions',not r['errors'],r['errors'])
 except Exception as e:check('native journey completes',False,str(e))
 finally:b.close()
r['ended']=time.time();r['failed']=[c['name'] for c in r['checks'] if not c['passed']];r['child_exit']=int(bool(r['failed']));(O/'RESULT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':len(r['checks']),'failed':r['failed'],'child_exit':r['child_exit']},ensure_ascii=False));raise SystemExit(r['child_exit'])
