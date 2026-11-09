"""Current station-to-boat contract through real Chromium/MessageChannel.
Fixtures use the public sender seam, never assign acceptedRoute or pose.
"""
from pathlib import Path
import argparse,json,time,traceback,hashlib,struct,math
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser();a.add_argument('--out',required=True);OUT=Path(a.parse_args().out);OUT.mkdir(parents=True,exist_ok=True)
r={'started':time.time(),'checks':[],'errors':[],'checkpoints':{},'screenshots':[],'exceptions':[]}
HOOK="""(() => {window.__wire={posts:[],receipts:[]};const post=MessagePort.prototype.postMessage;const copy=v=>v instanceof ArrayBuffer?{bytes:Array.from(new Uint8Array(v))}:structuredClone(v);MessagePort.prototype.postMessage=function(v){__wire.posts.push({at:performance.now(),value:copy(v)});return post.apply(this,arguments);};const Native=MessageChannel;window.MessageChannel=function(){const c=new Native();[c.port1,c.port2].forEach(p=>p.addEventListener('message',e=>__wire.receipts.push({at:performance.now(),value:copy(e.data)})));return c;};})();"""
def save(): (OUT/'REPORT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
def check(name,ok,data=None):
 r['checks'].append({'name':name,'passed':bool(ok),'data':data});save()
 if not ok: raise AssertionError(name)
def snap(p):return p.evaluate('AutonomousMission.snapshot()')
def checkpoint(p,name):
 s=snap(p);r['checkpoints'][name]={'snapshot':s,'wire':p.evaluate('__wire'),'reason':p.locator('#am-station-reason').inner_text()};save();return s
def core(s):return {k:s[k] for k in ['clockMs','position','heading','playing','missionState','acceptedRoute']}
def drive(p,condition,count=35,limit=35):
 for _ in range(limit):
  if p.evaluate('s=>'+condition,snap(p)):return snap(p)
  p.evaluate('n=>AutonomousMission.fastForward(n)',count);p.wait_for_timeout(15)
 raise AssertionError('bounded drive did not reach '+condition)
def setting(p,key,value):
 d=p.locator('.am-input-details').first
 if not d.evaluate('e=>e.open'):d.locator(':scope > summary').click()
 p.locator('[data-mission-input="'+key+'"]').set_checked(value)
 d.locator(':scope > summary').click()
def shot(p,name):
 p.evaluate("()=>{const e=document.querySelector('#system');scrollTo(0,e.getBoundingClientRect().top+scrollY-80)}")
 f=OUT/name;p.screenshot(path=str(f));r['screenshots'].append({'path':str(f),'url':p.url,'at':time.time(),'viewport':p.viewport_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()});save()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True)
 def fresh(width=1366,height=768):
  p=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce');p.add_init_script(HOOK)
  p.on('pageerror',lambda e:r['errors'].append({'page':str(e)}));p.on('console',lambda m:r['errors'].append({'console':m.text}) if m.type=='error' else None);p.on('requestfailed',lambda q:r['errors'].append({'request':q.url,'failure':q.failure}))
  p.goto((ROOT/'index.html').as_uri(),wait_until='load');p.wait_for_function('!!window.AutonomousMission');return p
 def scenario(name,fn):
  try:fn()
  except Exception:r['exceptions'].append({'scenario':name,'traceback':traceback.format_exc()});save()
 def single_sim():
  p=fresh();s=checkpoint(p,'fresh')
  check('fresh UI has no received route, no navigation target and stopped motors',not s['acceptedRoute'] and not s['hasNavigationTarget'] and s['applied']=={'left':0,'right':0} and s['clockMs']==0)
  p.locator('#am-start').click()
  for stage in ['preparing-route','route-posted','route-accepted','start-posted','start-received','checking-readiness','moving']:
   p.wait_for_function('stage=>AutonomousMission.snapshot().stationStage===stage',arg=stage,timeout=10000);s=checkpoint(p,'single-'+stage)
   if stage!='moving':check('stopped throughout '+stage,s['position']=={'x':335,'y':455} and s['applied']=={'left':0,'right':0},s['clockMs'])
   else:check('first GRID tick applies its controller output to canonical pose (pivot or forward)',(s['appliedPwm']['left']*s['appliedPwm']['right']<0 and s['heading']!=0 and s['position']=={'x':335,'y':455}) or (s['appliedPwm']['left']*s['appliedPwm']['right']>0 and s['position']!={'x':335,'y':455}), {'heading':s['heading'],'requestedPwm':s['requestedPwm'],'appliedPwm':s['appliedPwm'],'position':s['position']})
   if stage=='route-posted':shot(p,'desktop-route-arrived.png')
  p.evaluate('AutonomousMission.dispatch({type:"pause"})')
  moved=drive(p,"Math.hypot(s.position.x-335,s.position.y-455)>.01",count=1,limit=135);s=checkpoint(p,'single-moving-paused');w=p.evaluate('__wire')
  sent=[v['value'] for v in w['posts'] if isinstance(v['value'],dict) and v['value'].get('kind')=='route-upload'];starts=[v['value'] for v in w['posts'] if isinstance(v['value'],dict) and v['value'].get('kind')=='start']
  check('one native SIM posts distinct route and START exactly once, and uses received nine points',len(sent)==len(starts)==1 and s['acceptedRoute']==sent[0]['points'] and len(s['acceptedRoute'])==9 and s['appliedStartMessageId']==starts[0]['messageId'] and moved['position']!={'x':335,'y':455})
  check('all local acceptance IDs correspond to native-received envelopes',all(any(v['messageId']==v2['messageId'] for v2 in s['incoming']['received']) for v in s['incoming']['applied']))
  check('single owner and bounded active loop',s['activeLoop']==0 and p.evaluate('!window.SystemMission && !window.UplinkMotion'))
  p.locator('#am-tab-data').click();p.evaluate('AutonomousMission.configureTransport({delay:60});AutonomousMission.publishSnapshot()');p.wait_for_function('AutonomousMission.snapshot().transport.rx?.decoded.current_mode===1',timeout=5000)
  t=checkpoint(p,'moving-report-paused')['transport'];raw=bytes.fromhex(t['rx']['hex']);values=struct.unpack('<IddfffBBf',raw);r['moving_python_decode']={k:(v if not isinstance(v,float) or math.isfinite(v) else 'NaN') for k,v in zip(['sequence','lat','lon','ph','ntu','temp','mode','battery','heading'],values)};save()
  check('moving report uses real 38-byte native bytes with nine decoded fields',len(raw)==38 and values[6]==1 and len(t['rx']['decoded'])==9 and any(v['value'].get('bytes')==list(raw) for v in p.evaluate('__wire.posts')))
  check('paused DATA decision and result refresh on actual commit',p.locator('#am-explain-decision').inner_text()==p.locator('#am-packet-identity').inner_text() and p.locator('#am-explain-effect').inner_text()==p.locator('#am-shore-value').inner_text())
  p.locator('#am-tab-route').click();shot(p,'desktop-moving.png');p.close()
 def pause_and_route():
  p=fresh();points=[{'x':520,'y':240},{'x':510,'y':310},{'x':650,'y':350}]
  before=p.evaluate('points=>{window.originalPoints=structuredClone(points);AutonomousMission.testStartWithRoute(points);points[0].x=900;AutonomousMission.dispatch({type:"pause"});return AutonomousMission.snapshot();}',points)
  p.wait_for_function('AutonomousMission.snapshot().incoming.received.length===1');after=checkpoint(p,'route-native-arrival-paused')
  check('native route receipt while paused does not advance clock, install route or move boat',core(before)==core(after) and not after['acceptedRoute'] and after['incoming']['inboxCount']==1)
  p.locator('#am-next').click();one=snap(p);check('setup NEXT is exactly 50ms, remains paused, never fabricates receipt',one['clockMs']==before['clockMs']+50 and not one['playing'] and one['acceptedRoute']==[])
  accepted=drive(p,"s.stationStage==='route-accepted'",count=1,limit=40)
  check('received non-default route is immutable and canonical before START',accepted['acceptedRoute']==points and accepted['target']==points[0] and accepted['missionState']=='READY' and accepted['position']=={'x':335,'y':455})
  marker=accepted['routeMessageId'];p.evaluate('AutonomousMission.dispatch({type:"resume"});AutonomousMission.dispatch({type:"pause"})')
  check('resume preserves the same uploaded route identity without repost',snap(p)['routeMessageId']==marker and len(snap(p)['incoming']['posted'])==1)
  first_grid=drive(p,"s.stationStage==='moving'",count=1,limit=135);checkpoint(p,'changed-route-first-grid-tick')
  check('accepted high-bearing route pivots canonical heading before translation',first_grid['missionState']=='GRID SCAN' and first_grid['position']=={'x':335,'y':455} and first_grid['heading']!=0 and first_grid['appliedPwm']['left']*first_grid['appliedPwm']['right']<0 and first_grid['acceptedRoute']==points)
  moving=drive(p,"s.stationStage==='moving' && (s.position.x!==335 || s.position.y!==455)",count=1,limit=135);checkpoint(p,'changed-route-moving')
  expected=p.evaluate('()=>{const s=AutonomousMission.snapshot(),m=s.headingMetrics;return MissionKernel.localLos(m.position,s.acceptedRoute,s.waypointIndex,MissionKernel.HOME,{scale:MissionKernel.MAP_SCALE_M_PER_UNIT}).bearingDeg}')
  default=p.evaluate('()=>MissionKernel.localLos(MissionKernel.HOME,MissionKernel.WAYPOINTS,0,MissionKernel.HOME,{scale:MissionKernel.MAP_SCALE_M_PER_UNIT}).bearingDeg')
  check('changed received first target changes accepted-route LOS and actual trajectory',moving['target']==points[0] and abs(moving['targetHeading']-expected)<.01 and abs(expected-default)>10 and moving['position']!={'x':335,'y':455})
  p.close()
 def resets():
  p=fresh()
  for kind in ['upload','start','report']:
   if kind=='start':
    p.evaluate('AutonomousMission.testStartWithRoute([{x:500,y:200}]);AutonomousMission.dispatch({type:"pause"})');drive(p,"s.stationStage==='route-accepted'",count=1,limit=35)
   p.evaluate('kind=>{if(kind==="upload")AutonomousMission.testStartWithRoute([{x:500,y:200}]);if(kind==="start")AutonomousMission.testSendStart();if(kind==="report"){AutonomousMission.setMode("DATA");AutonomousMission.configureTransport({delay:250});AutonomousMission.publishSnapshot();}AutonomousMission.reset();}',kind)
   p.wait_for_timeout(650);s=checkpoint(p,'reset-'+kind)
   check('RESET retires pending '+kind+' without late install/start/report',s['clockMs']==0 and not s['playing'] and not s['acceptedRoute'] and not s['pendingStart'] and s['incoming']['received']==[] and s['transport']['rx'] is None and s['transport']['active'] is None)
  check('reset clears all nine actual report rows',p.locator('#am-data-table [data-report-value]').count()==18 and all(v in ['ยังไม่มีชุดข้อมูล','ยังไม่ได้รับ'] for v in p.locator('#am-data-table [data-report-value]').all_text_contents()))
  p.close()
 def negative():
  p=fresh();p.evaluate('AutonomousMission.configureIncoming({dropNext:true});AutonomousMission.testStartWithRoute([{x:500,y:200}]);AutonomousMission.dispatch({type:"pause"})');p.wait_for_function('AutonomousMission.snapshot().incoming.dropped.length===1');s=p.evaluate('AutonomousMission.fastForward(180)');checkpoint(p,'undelivered-route')
  check('lost route leaves boat waiting with no accepted target or movement',not s['acceptedRoute'] and not s['hasNavigationTarget'] and s['position']=={'x':335,'y':455} and len(s['incoming']['received'])==0 and s['stationStage']=='route-posted')
  p.evaluate('AutonomousMission.reset();AutonomousMission.testStartWithRoute([{x:500,y:200}],{count:2});AutonomousMission.dispatch({type:"pause"})');s=drive(p,"s.stationStage==='route-rejected'",count=35);checkpoint(p,'invalid-route')
  check('actually received malformed route is rejected rather than installed or started',len(s['incoming']['received'])==1 and not s['acceptedRoute'] and not s['playing'] and s['position']=={'x':335,'y':455} and 'ปฏิเสธ' in p.locator('#am-station-reason').inner_text())
  p.close()
 def readiness():
  p=fresh();setting(p,'gps',False);setting(p,'compass',False);setting(p,'home',False)
  p.evaluate('AutonomousMission.testStartBeforeRoute();AutonomousMission.dispatch({type:"pause"})');s=drive(p,"s.pendingStart && s.stationStage==='waiting-readiness'");startid=s['startMessageId']
  check('START may be pending before a route without moving',not s['acceptedRoute'] and s['position']=={'x':335,'y':455})
  p.evaluate('AutonomousMission.testSendRoute([{x:500,y:200}]);if(AutonomousMission.snapshot().playing)AutonomousMission.dispatch({type:"pause"})');s=drive(p,"s.acceptedRoute.length===1 && s.stationStage==='waiting-readiness'");checkpoint(p,'gps-compass-pending')
  check('SIM respects explicit GPS and compass faults',not s['inputs']['gps'] and not s['inputs']['compass'] and s['applied']=={'left':0,'right':0})
  setting(p,'gps',True);setting(p,'compass',True);s=drive(p,"s.stationStage==='moving'");checkpoint(p,'readiness-restored')
  check('same pending START becomes eligible when GPS/compass return, HOME not required',s['appliedStartMessageId']==startid and not s['inputs']['home'] and s['position']!={'x':335,'y':455})
  p.evaluate('AutonomousMission.reset()');d=p.locator('.am-input-details').first
  if not d.evaluate('e=>e.open'):d.locator(':scope > summary').click()
  battery=p.locator('[data-policy-input="batteryVoltage"]');battery.fill('10.2');battery.dispatch_event('change');d.locator(':scope > summary').click()
  p.locator('#am-start').click();s=drive(p,"s.stationStage==='start-refused'");checkpoint(p,'start-refused-low-battery')
  check('LOW BATTERY safety refuses and consumes START without movement',not s['pendingStart'] and not s['playing'] and s['missionState']=='READY' and s['safetyState']=='LOW_BATTERY_RTH' and s['position']=={'x':335,'y':455})
  d=p.locator('.am-input-details').first
  if not d.evaluate('e=>e.open'):d.locator(':scope > summary').click()
  battery=p.locator('[data-policy-input="batteryVoltage"]');battery.fill('12.15');battery.dispatch_event('change');d.locator(':scope > summary').click();p.wait_for_timeout(180);s=checkpoint(p,'start-refused-after-recovery')
  check('restoring voltage does not silently re-arm a refused START',not s['pendingStart'] and not s['playing'] and s['missionState']=='READY' and s['stationStage']=='start-refused' and s['position']=={'x':335,'y':455})
  p.close()
 def spiral_pid():
  p=fresh();p.locator('#am-spiral-demo').click();s=drive(p,"s.stationStage==='moving'")
  check('native spiral scenario uses normal received route/start, not forced SPIRAL',s['missionState']=='GRID SCAN' and s['anomaly']['armed'] and len(s['incoming']['applied'])==2)
  s=drive(p,"s.missionState==='SPIRAL SCAN'",count=40,limit=100);cause=s['spiralCause'];interrupted=s['anomaly']['interruptedIndex'];checkpoint(p,'spiral-active');shot(p,'spiral-active.png')
  check('actual eight-sample anomaly cause survives station setup; runtime creates only the active target',cause is not None and len(cause['window'])==8 and cause['mean']>50 and len(s['anomaly']['spiralTargets'])==1 and s['anomaly']['spiralIndex']==0 and p.locator('#am-spiral-points circle').count()==1)
  check('station story reason follows actual spiral rather than remaining stuck at first target','ก้นหอย' in p.locator('#am-station-reason').inner_text())
  s=drive(p,"s.missionState==='GRID SCAN' && s.anomaly.used",count=20,limit=1200);checkpoint(p,'spiral-resumed')
  check('source completion/automatic-abort returns the same boat to the exact pending received-route waypoint',s['missionState']=='GRID SCAN' and s['waypointIndex']==interrupted and s['target']==s['acceptedRoute'][interrupted] and s['spiralCause']==cause and len(s['anomaly']['spiralTargets'])==s['anomaly']['spiralIndex']+1 and len(s['anomaly']['spiralTargets'])<=25)
  p.locator('#am-tab-control').click();p.locator('.am-pid-link').click();check('original Overall PID remains reachable',p.url.endswith('#pid') and p.locator('#pid').is_visible())
  p.goto((ROOT/'pages/heading-pid.html').as_uri(),wait_until='load');check('unchanged A/B PID lab actually loads','PID' in p.locator('h1').inner_text() and p.locator('#dial-a').count()==1 and p.locator('#dial-b').count()==1);p.close()
 def phone():
  p=fresh(390,844);p.locator('#am-start').click();p.locator('#am-toggle').click();shot(p,'phone-setup.png')
  sizes=p.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('#system button')].filter(e=>e.checkVisibility()).map(e=>({id:e.id,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),map:document.querySelector('#am-map').getBoundingClientRect().width})''')
  check('phone has bounded map pan, readable stage strip and 44px controls without body overflow',sizes['scroll']<=390 and sizes['map']>=680 and all(v['w']>=44 and v['h']>=44 for v in sizes['buttons']),sizes)
  p.locator('#am-next').focus();before=snap(p);p.keyboard.press('Enter');after=snap(p);check('keyboard NEXT under reduced motion preserves bounded pause',after['clockMs']==before['clockMs']+50 and not after['playing']);p.locator('#am-station-stages').scroll_into_view_if_needed();p.screenshot(path=str(OUT/'phone-stage-strip.png'));p.close()
 def set_home():
  p=fresh();before=checkpoint(p,'set-home-before');check('SET_HOME begins in the fresh stopped STANDBY state without an active capture',before['missionState']=='READY' and before.get('homeCapture') is None)
  d=p.locator('.am-input-details').first
  if not d.evaluate('e=>e.open'):d.locator(':scope > summary').click()
  p.locator('[data-policy-command="SET_HOME"]').click();capturing=drive(p,'s.homeCapture && s.homeCapture.points.length>=20',count=1,limit=120);checkpoint(p,'set-home-20-samples')
  check('native SET_HOME command captures20 stopped GPS samples at the source250ms cadence',len(capturing['homeCapture']['points'])==20 and capturing['homeCapture']['startedMs']<capturing['clockMs'])
  finished=drive(p,"!s.homeCapture && s.homeCaptureResult.startsWith('CAPTURED')",count=1,limit=20);wire=p.evaluate('__wire');posts=[x['value'] for x in wire['posts'] if isinstance(x['value'],dict) and x['value'].get('kind')=='command' and x['value'].get('command')=='SET_HOME'];receipts=[x['value'] for x in wire['receipts'] if isinstance(x['value'],dict) and x['value'].get('kind')=='command' and x['value'].get('command')=='SET_HOME'];checkpoint(p,'set-home-captured')
  check('SET_HOME applies after native command receipt, completes the5s dwell, and labels memory-only HOME',len(posts)==len(receipts)==1 and finished['inputs']['home'] and finished['homeCaptureResult'].startswith('CAPTURED') and 'no NVS write' in finished['homeCaptureResult'],{'posts':posts,'receipts':receipts,'result':finished['homeCaptureResult'],'homePoint':finished['homePoint'],'clockMs':finished['clockMs']})
  shot(p,'set-home-captured.png');p.close()
 for name,fn in [('single-SIM',single_sim),('pause/changed route',pause_and_route),('reset generations',resets),('negative routes',negative),('START readiness',readiness),('spiral/PID',spiral_pid),('SET_HOME',set_home),('phone',phone)]:scenario(name,fn)
 b.close()
check('no startup/journey page, console or resource errors',not r['errors'],r['errors'])
r['sources']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for pattern in ['src/js/overall/*.js','src/js/mission/uplink-motion.js','pages/overall.html','src/css/overall-instrument.css','tests/overall-station*'] for p in ROOT.glob(pattern)}
r['passed']=sum(v['passed'] for v in r['checks']);r['failed']=sum(not v['passed'] for v in r['checks']);r['ended']=time.time();save();print(json.dumps({'passed':r['passed'],'failed':r['failed'],'exceptions':r['exceptions'],'report':str(OUT/'REPORT.json')},ensure_ascii=False));raise SystemExit(1 if r['failed'] or r['exceptions'] else 0)
