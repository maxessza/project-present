"""Native regression: historical Operate must not become a mislabeled LIVE view."""
from pathlib import Path
import argparse,json,time,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser();a.add_argument('--out',required=True);args=a.parse_args();OUT=Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
r={'started':time.time(),'checks':[],'errors':[]}
def check(name,ok,data=None):r['checks'].append({'name':name,'passed':bool(ok),'data':data})
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True);p=b.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce');p.on('pageerror',lambda e:r['errors'].append(str(e)))
 p.goto((ROOT/'index.html').as_uri(),wait_until='load');p.wait_for_function('!!window.AutonomousMission && !!document.querySelector("#sim-history-status")')
 p.locator('#sim-step').click();p.locator('#sim-step').click();p.locator('#sim-back').click();historical=p.locator('#sim-clock').inner_text();canonical=p.evaluate('AutonomousMission.snapshot().clockMs')
 p.locator('#am-speed').select_option('4');updated=p.locator('#sim-clock').inner_text()
 check('Historical pose/readouts remain the selected past snapshot when live mission publishes again',updated==historical and 'HISTORICAL' in p.locator('#sim-history-status').inner_text(),{'selected_clock':historical,'displayed_after_publication':updated,'canonical_clock':canonical,'status':p.locator('#sim-history-status').inner_text()})
 check('Historical viewing leaves live speed controls synchronized to actual canonical speed',p.locator('#am-speed').input_value()==p.locator('#sim-speed').input_value()=='4' and p.evaluate('AutonomousMission.snapshot().speed')==4)
 check('Historical inspection and live settings do not advance or rewind canonical mission clock',p.evaluate('AutonomousMission.snapshot().clockMs')==canonical)
 live_button=p.locator('#sim-live')
 check('A native LIVE control is available while inspecting recorded history',live_button.count()==1)
 if live_button.count()==1:
  live_button.click()
  check('LIVE returns to current view without advancing or rewinding the mission',p.locator('#sim-clock').inner_text()==f'{canonical/1000:.2f} s' and p.locator('#sim-history-status').inner_text().startswith('LIVE') and p.evaluate('AutonomousMission.snapshot().clockMs')==canonical)
 p.evaluate("()=>{for(let i=0;i<1205;i++)AutonomousMission.dispatch({type:'speed',value:i%2?1:2})}")
 p.locator('#sim-checkpoint').select_option('prepare')
 check('An observed checkpoint remains inspectable after recent-history ring eviction',p.locator('#sim-history-status').inner_text().startswith('HISTORICAL') and p.locator('#sim-clock').inner_text()=='0.00 s' and p.evaluate('AutonomousMission.snapshot().clockMs')==canonical,{'status':p.locator('#sim-history-status').inner_text(),'display_clock':p.locator('#sim-clock').inner_text()})
 check('Ordinary presentation keeps raw decision history hidden',not p.locator('.sim-log-wrap').is_visible())
 p.screenshot(path=str(OUT/'historical-view.png'));b.close()
r['sources']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'pages/overall.html',ROOT/'src/js/overall/overall-completion.js',ROOT/'src/js/overall/autonomous-mission.js']}
r['passed']=sum(c['passed'] for c in r['checks']);r['failed']=sum(not c['passed'] for c in r['checks']);r['ended']=time.time();(OUT/'REPORT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(r,ensure_ascii=False));raise SystemExit(1 if r['failed'] or r['errors'] else 0)
