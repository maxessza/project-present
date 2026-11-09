"""Native phone regression: primary story control stays readable off-hover."""
import argparse,json,re,time
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();R=Path(__file__).resolve().parents[1];O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
r={'started':time.time(),'checks':[],'errors':[]}
def luminance(css):
 v=[float(x)/255 for x in re.findall(r'[\d.]+',css)[:3]]
 return sum(w*(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4) for w,x in zip([.2126,.7152,.0722],v))
def check(q,label):
 colors=q.locator('#fc-tour-toggle').evaluate('(e)=>{const c=getComputedStyle(e);return {foreground:c.color,background:c.backgroundColor}}')
 fg,bg=luminance(colors['foreground']),luminance(colors['background']);ratio=(max(fg,bg)+.05)/(min(fg,bg)+.05)
 r['checks'].append({'name':label,'passed':ratio>=4.5,'ratio':ratio,'colors':colors})
with sync_playwright() as p:
 b=p.chromium.launch();q=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);q.on('pageerror',lambda e:r['errors'].append(str(e)))
 q.goto((R/'index.html').as_uri());q.wait_for_selector('#fc-tour-toggle');q.mouse.move(0,0);q.wait_for_timeout(300);check(q,'phone START readable before touch')
 q.locator('#fc-tour-toggle').tap();q.wait_for_timeout(300);check(q,'phone PAUSE readable during story')
 q.locator('#fc-tour-toggle').tap();q.wait_for_timeout(300);check(q,'phone RESUME readable while paused');q.screenshot(path=str(O/'phone-paused.png'));b.close()
r['checks'].append({'name':'no runtime errors','passed':not r['errors']});r['ended']=time.time();r['failed']=[c['name'] for c in r['checks'] if not c['passed']];r['child_exit']=int(bool(r['failed']));(O/'RESULT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(r,ensure_ascii=False));raise SystemExit(r['child_exit'])
