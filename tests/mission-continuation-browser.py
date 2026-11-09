from __future__ import annotations
import hashlib,json,math,struct,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=Path('D:/Presention/presention-unified-sim-20261020/evidence/continuation')
report={'started':time.time(),'url':(root/'index.html').as_uri(),'checks':[],'errors':[],'screenshots':[]}
def check(name,ok,data=None):
    report['checks'].append({'name':name,'passed':bool(ok),'data':data})
    if not ok: raise AssertionError(name+': '+str(data))
def decode(raw):
    keys=['seq','lat','lon','ph','ntu','temp','mode','battery','heading']
    return dict(zip(keys,struct.unpack('<IddfffBBf',bytes(raw))))
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1)
    page.add_init_script('''window.nativeWire={posts:[],callbacks:[]};const post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(v,...rest){if(v instanceof ArrayBuffer)window.nativeWire.posts.push({bytes:[...new Uint8Array(v)],at:performance.now()});return post.call(this,v,...rest);};const NativeChannel=MessageChannel;window.MessageChannel=function(){const c=new NativeChannel();c.port2.addEventListener('message',e=>{if(e.data instanceof ArrayBuffer)window.nativeWire.callbacks.push({bytes:[...new Uint8Array(e.data)],at:performance.now()});});c.port2.start();return c;};''')
    page.on('pageerror',lambda e:report['errors'].append({'page':str(e)}))
    page.on('console',lambda e:report['errors'].append({'console':e.text}) if e.type=='error' else None)
    page.on('requestfailed',lambda e:report['errors'].append({'resource':e.url,'failure':e.failure}))
    page.goto(report['url'],wait_until='load')
    page.wait_for_function('!!window.AutonomousMission')
    snap=lambda:page.evaluate('AutonomousMission.snapshot()')
    check('one mission owner and source inspector closed',page.evaluate('!window.UplinkMotion && !window.SystemMission && !document.querySelector("#am-trace-details").open'))
    fresh=snap();page.locator('#am-start').click()
    page.wait_for_function('AutonomousMission.snapshot().transport.receipts>=1',timeout=8000)
    page.locator('#am-toggle').click();a=snap();page.wait_for_timeout(350);b=snap()
    wire=page.evaluate('window.nativeWire');report['native_fresh_wire']=wire
    packet=decode(wire['posts'][0]['bytes']);received=decode(wire['callbacks'][0]['bytes']);report['independent_python_decode']={'tx':packet,'rx':received}
    check('fresh single SIM moves and posts real38B received callback',a['position']!=fresh['position'] and len(wire['posts'][0]['bytes'])==38 and wire['posts'][0]['bytes']==wire['callbacks'][0]['bytes'] and packet['seq']==1 and math.isnan(packet['ph']),{'modelMs':a['clockMs'],'posts':len(wire['posts']),'callbacks':len(wire['callbacks']),'packet':packet})
    check('PAUSE freezes model while posted receipt may finish',a['clockMs']==b['clockMs'] and a['position']==b['position'])
    page.locator('#am-next').click();c=snap()
    check('NEXT50ms, causal immutable provenance rows',c['clockMs']==b['clockMs']+50 and c['latestEvent']['inputs']['position']==b['position'] and any(r['key']=='grid-control' for r in c['latestEvent']['rows']) and all(len(r['source']['sha256'])==64 for r in c['latestEvent']['rows']),c['latestEvent'])
    before=snap();page.locator('[data-mode="CONTROL"]').click();after=snap()
    check('focus has no model side effects',before['position']==after['position'] and before['clockMs']==after['clockMs'] and json.dumps(before['latestEvent'],sort_keys=True)==json.dumps(after['latestEvent'],sort_keys=True))
    page.locator('#am-trace-details summary').click();check('operation-specific source visible on demand','GridCaptureController.cpp' in page.locator('#am-trace-rows').inner_text());page.locator('#am-trace-details summary').click()
    page.evaluate('AutonomousMission.setMode("DATA");scrollTo(0,0)')
    box=page.locator('.am-transport').bounding_box()
    assert box is not None
    report['desktop_controls_box']=box
    page.screenshot(path=str(out/'desktop1366.png'));report['screenshots'].append({'file':'desktop1366.png','viewport':[1366,768],'dpr':1,'media':'no-preference','at':time.time(),'url':page.url})
    check('desktop1366 map+bottom controls in same viewport',box['y']+box['height']<=768,box)
    page.locator('#am-reset').click();page.evaluate('AutonomousMission.configureTransport({dropFirst:true,delay:40});AutonomousMission.fastForward(20)')
    page.wait_for_function('AutonomousMission.snapshot().transport.rx?.sequence===1',timeout=5000)
    t=snap()['transport'];ev=[e for e in t['events'] if e.get('seq')==1]
    check('first drop before post; retry same immutable SEQ/bytes',len([e for e in ev if e['type']=='drop'])==1 and len([e for e in ev if e['type']=='post'])==1 and len(set(e['hex'] for e in ev))==1 and t['posts']==1 and t['receipts']==1,ev)
    old=t['rx'];page.evaluate('AutonomousMission.configureTransport({lossAll:true});AutonomousMission.fastForward(100)');page.wait_for_timeout(450);t=snap()['transport']
    check('total loss holds last-good shore and marks stale, bounded coalescing',json.dumps(t['rx'],sort_keys=True)==json.dumps(old,sort_keys=True) and t['stale'] and t['posts']==1 and t['coalesced']>0,t)
    page.evaluate('AutonomousMission.reset();AutonomousMission.configureTransport({lossAll:false,dropFirst:false,delay:120});AutonomousMission.fastForward(20);AutonomousMission.reset()');page.wait_for_timeout(450);t=snap()['transport']
    check('RESET retires timers/ports no late RX',t['rx'] is None and t['posts']==0 and t['receipts']==0 and t['active'] is None and t['pending'] is None,t)
    page.evaluate('AutonomousMission.configureTransport({delay:30});AutonomousMission.publishSnapshot()');page.wait_for_function('AutonomousMission.snapshot().transport.rx!==null')
    t=snap()['transport'];raw=[int(x,16) for x in t['rx']['hex'].split()];standby=decode(raw)
    check('STANDBY actual bytes decode NaN water',all(math.isnan(standby[k]) for k in ['ph','ntu','temp']),standby)
    page.evaluate('AutonomousMission.reset()');page.locator('.am-input-details summary').click();page.locator('[data-mission-input="gps"]').uncheck();page.locator('#am-start').click();f=snap()
    check('explicit fault not overwritten by SIM',f['missionState']=='READY' and not f['inputs']['gps'] and f['applied']=={'left':0,'right':0})
    page.locator('[data-mission-input="gps"]').check();page.locator('[data-mission-input="home"]').uncheck();page.locator('#am-start').click();page.locator('#am-toggle').click();check('HOME not required for START',snap()['missionState']=='GRID SCAN');page.locator('.am-input-details summary').click()
    page.evaluate('AutonomousMission.reset();AutonomousMission.dispatch({type:"anomaly"})')
    branches=page.evaluate('''() => {const M=AutonomousMissionModel;let s=M.activateAnomaly(M.start(M.createFixtureMission())),seen={},ph=false;for(let i=0;i<30000&&s.missionState!=='COMPLETE';i++){s=M.tick(s);if(!seen[s.missionState])seen[s.missionState]={at:s.clockMs,index:s.waypointIndex,pose:{...s.position}};if(s.hold.phase==='measure'&&Number.isFinite(s.water.ph))ph=true;}return {seen,ph,final:M.snapshot(s)};}''')
    report['native_model_branches']=branches
    check('native kernel sample/spiral/resume/RTH all complete',branches['ph'] and 'SPIRAL SCAN' in branches['seen'] and 'RTH' in branches['seen'] and branches['final']['missionState']=='COMPLETE' and branches['final']['anomaly']['spiralIndex']==25,{'seen':branches['seen'],'ph':branches['ph']})
    # Exercise actual canonical scene fast-forward, not an unrelated example.
    page.evaluate('AutonomousMission.fastForward(800)');scene=snap();check('canonical fast-forward updates same mission/readouts',scene['clockMs']==40000 and page.locator('#am-clock').inner_text()=='40.00 s')
    check('canonical scene really follows generated spiral and current marker',scene['missionState']=='SPIRAL SCAN' and page.locator('#am-spiral-points .is-current').count()==1 and page.locator('#am-spiral-points circle').count()==25-scene['anomaly']['spiralIndex'])
    page.evaluate('AutonomousMission.setMode("ANOMALY");scrollTo(0,0)');page.screenshot(path=str(out/'spiral-scene.png'));report['screenshots'].append({'file':'spiral-scene.png','viewport':[1366,768],'dpr':1,'media':'no-preference','at':time.time(),'url':page.url})
    progression=page.evaluate('''()=>{let seen=[],previous=AutonomousMission.snapshot().missionState;for(let i=0;i<100;i++){const s=AutonomousMission.fastForward(100);if(s.missionState!==previous){seen.push({mode:s.missionState,wp:s.waypointIndex,spiral:s.anomaly.spiralIndex,clock:s.clockMs,applied:s.applied});previous=s.missionState;}if(s.missionState==='COMPLETE')break;}return seen;}''')
    check('actual canonical scene resumes pending GRID then RTH and STANDBY',any(s['mode']=='GRID SCAN' and s['wp']==scene['anomaly']['interruptedIndex'] for s in progression) and any(s['mode']=='RTH' for s in progression) and progression[-1]['mode']=='COMPLETE',progression)
    report['canonical_scene_progression']=progression
    page.evaluate('location.hash="ms-uplink-panel"');page.wait_for_timeout(50);check('legacy uplink anchor focuses integrated DATA',snap()['focus']=='DATA' and page.evaluate('document.activeElement.id')=='am-data-panel')
    page.evaluate('AutonomousMission.reset();history.replaceState(null,"",location.pathname);scrollTo(0,0)')
    page.set_viewport_size({'width':1440,'height':900});page.screenshot(path=str(out/'desktop1440.png'));report['screenshots'].append({'file':'desktop1440.png','viewport':[1440,900],'dpr':1,'media':'no-preference','at':time.time(),'url':page.url})
    box=page.locator('.am-transport').bounding_box();assert box is not None;check('desktop1440 scene controls fit',box['y']+box['height']<=900,box)
    page.set_viewport_size({'width':390,'height':844});page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/'phone390.png'));report['screenshots'].append({'file':'phone390.png','viewport':[390,844],'dpr':1,'media':'no-preference','at':time.time(),'url':page.url})
    sizes=page.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('#system button')].filter(e=>e.offsetParent).map(e=>({text:e.textContent,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),map:document.querySelector('#am-map').getBoundingClientRect().width})''')
    check('phone no body overflow native pan labels and44px controls',sizes['scroll']<=390 and sizes['map']>=680 and all(x['w']>=44 and x['h']>=44 for x in sizes['buttons']),sizes)
    page.locator('#am-next').scroll_into_view_if_needed();page.screenshot(path=str(out/'phone-controls.png'));report['screenshots'].append({'file':'phone-controls.png','viewport':[390,844],'dpr':1,'media':'no-preference','at':time.time(),'url':page.url})
    page.emulate_media(reduced_motion='reduce');page.locator('#am-next').focus();page.keyboard.press('Enter');check('keyboard NEXT works under reduced motion',snap()['clockMs']==50)
    check('zero startup/journey console/page/resource errors',not report['errors'],report['errors'])
    report['wire_final']=page.evaluate('window.nativeWire')
    browser.close()
except Exception:
 report['failure']=traceback.format_exc();print(report['failure'])
finally:
 report['ended']=time.time()
 report['source_sha256']={x:hashlib.sha256((root/x).read_bytes()).hexdigest() for x in ['pages/overall.html','src/js/overall/autonomous-mission.js','src/js/overall/autonomous-mission-model.js','src/js/overall/mission-kernel.js','src/js/overall/mission-transport.js','src/js/mission/uplink-motion.js','src/css/autonomous-mission.css']}
 for shot in report['screenshots']:shot['sha256']=hashlib.sha256((out/shot['file']).read_bytes()).hexdigest()
 (out/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'passed':sum(x['passed'] for x in report['checks']),'total':len(report['checks']),'report':str(out/'browser-report.json')},ensure_ascii=False))
 if report.get('failure'):raise SystemExit(1)
