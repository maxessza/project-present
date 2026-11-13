"""Native browser evidence for the Overall presentation contract (local-only)."""
import argparse
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

P = argparse.ArgumentParser()
P.add_argument('--out', required=True)
args = P.parse_args()
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
report = {'started_unix': time.time(), 'checks': [], 'screenshots': [], 'journeys': {}, 'errors': []}

def check(name, passed, detail=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'detail': detail})

def record_screenshot(page, name):
    path = OUT / f'{name}.png'
    page.screenshot(path=str(path), full_page=False)
    report['screenshots'].append({'name': name, 'path': str(path), 'viewport': page.viewport_size,
                                  'scroll': page.evaluate('({x:scrollX,y:scrollY})')})

def enter(page):
    page.goto((ROOT / 'index.html').as_uri(), wait_until='load')
    page.wait_for_function('!!window.AutonomousMission && !!document.querySelector("#function-center")')
    page.wait_for_timeout(100)

def visible_geometry(page):
    return page.evaluate('''() => {
      const rect = s => {const e=document.querySelector(s),r=e?.getBoundingClientRect();return r?{top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),visible:!!(r.width&&r.height)}:null};
      return {scrollY,innerHeight,bodyWidth:document.body.scrollWidth,docWidth:document.documentElement.scrollWidth,
        controls:rect('#fc-controls .am-transport'), causal:rect('#fc-causal-flow'), stage:rect('#fc-movie-stage'),
        nav:rect('#fc-nav-visual'), intro:rect('#fc-intro-brief')};
    }''')

try:
  with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    # Keep both native desktop viewport sizes at scrollY=0 and save every chapter.
    for width, height, key in [(1264, 800, '1264x800'), (1366, 768, '1366x768')]:
      page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce')
      page.on('pageerror', lambda e: report['errors'].append(str(e)))
      page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
      enter(page)
      intro = page.locator('#function-center').inner_text()
      record_screenshot(page, f'intro-{key}')
      check(f'{key} fresh entry has purpose, roles, workflow, and three sensor meanings',
            all(x in intro for x in ['จุดสำรวจ', 'สถานี', 'GPS', 'เข็มทิศ', 'ความขุ่น', 'อุณหภูมิ']),
            {'intro_text': intro[:1800], 'geometry': visible_geometry(page)})
      check(f'{key} fresh entry communicates intent before START',
            page.locator('#fc-intro-brief').is_visible(), visible_geometry(page))
      page.evaluate("document.querySelector('#am-start').click()")
      page.wait_for_function('AutonomousMission.snapshot().playing && AutonomousMission.snapshot().clockMs > 0', timeout=10000)
      page.evaluate("document.querySelector('#am-toggle').click()")
      page.wait_for_function('!AutonomousMission.snapshot().playing')
      for chapter in ['setup', 'sensors', 'segment', 'heading', 'water', 'anomaly', 'report', 'safety']:
        page.evaluate('(id)=>document.querySelector(`[data-movie-chapter="${id}"]`).click()', chapter)
        page.wait_for_timeout(40)
        geom = visible_geometry(page)
        record_screenshot(page, f'{chapter}-{key}')
        check(f'{key} {chapter} causal mechanism and primary controls fit unscrolled viewport',
              geom['scrollY'] == 0 and geom['controls']['visible'] and geom['causal']['visible'] and
              geom['controls']['bottom'] <= height and geom['causal']['bottom'] <= height, geom)
        check(f'{key} {chapter} keeps main labels readable',
              page.evaluate("parseFloat(getComputedStyle(document.querySelector('#fc-causal-flow article strong')).fontSize) >= 14"),
              page.evaluate("getComputedStyle(document.querySelector('#fc-causal-flow article strong')).fontSize"))
      if width == 1264:
        # A chapter lens must not mutate or advance the same paused canonical mission.
        before = page.evaluate('''()=>{const s=AutonomousMission.snapshot();return JSON.stringify({clockMs:s.clockMs,position:s.position,waypointIndex:s.waypointIndex,missionState:s.missionState,transport:s.transport})}''')
        page.evaluate("document.querySelector('[data-movie-chapter=\"report\"]').click()")
        after = page.evaluate('''()=>{const s=AutonomousMission.snapshot();return JSON.stringify({clockMs:s.clockMs,position:s.position,waypointIndex:s.waypointIndex,missionState:s.missionState,transport:s.transport})}''')
        check('chapter inspection leaves paused mission and transport unchanged', before == after)
      page.close()

    # Phone flow is checked separately; map pan is allowed but the document must not overflow.
    phone = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    enter(phone)
    phone.evaluate("document.querySelector('#am-start').click()")
    phone.wait_for_function('AutonomousMission.snapshot().clockMs > 0', timeout=10000)
    phone.evaluate("document.querySelector('#am-toggle').click()")
    phone.wait_for_function('!AutonomousMission.snapshot().playing')
    phone.evaluate("document.querySelector('[data-movie-chapter=\"heading\"]').click()")
    record_screenshot(phone, 'heading-390x844')
    phone_metrics = phone.evaluate('''()=>({innerWidth,bodyWidth:document.body.scrollWidth,docWidth:document.documentElement.scrollWidth,
      buttons:[...document.querySelectorAll('#fc-controls button,[data-movie-chapter]')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height}).map(e=>Math.round(e.getBoundingClientRect().height)),
      causalFont:getComputedStyle(document.querySelector('#fc-causal-flow article strong')).fontSize})''')
    check('390x844 is readable, stacked/pannable, overflow-free, with >=44px active buttons',
          phone_metrics['bodyWidth'] <= 390 and phone_metrics['docWidth'] <= 390 and
          all(h >= 44 for h in phone_metrics['buttons']) and float(phone_metrics['causalFont'].replace('px','')) >= 14, phone_metrics)
    phone.close()

    # Fresh full-movie journey; do not fast-forward or issue policy commands.
    movie = browser.new_page(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce')
    movie.on('pageerror', lambda e: report['errors'].append(str(e)))
    movie.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    enter(movie)
    movie.evaluate('''()=>{
      window.__chapterEntries=[];
      let last=null;
      const capture=()=>{
        const shell=document.querySelector('#function-center'),chapter=shell?.dataset.chapter;
        if(!chapter||chapter===last)return;
        last=chapter;
        const rect=s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return r?{top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height),visible:!!(r.width&&r.height)}:null};
        const s=AutonomousMission.snapshot();
        window.__chapterEntries.push({chapter,scrollY,state:s.missionState,playing:s.playing,clockMs:s.clockMs,
          waypointIndex:s.waypointIndex,accepted:s.acceptedRoute.length,hold:s.hold.phase,anomalyUsed:s.anomaly.used,
          spiralIndex:s.anomaly.spiralIndex,plannerDone:s.anomaly.planner?.done,returnCause:s.returnCause,
          received:!!s.transport.rx,tx:!!s.transport.latestTx,geometry:{controls:rect('#fc-controls .am-transport'),stage:rect('#fc-movie-stage'),
            causal:rect('#fc-causal-flow'),nav:rect('#fc-nav-visual'),report:rect('#fc-report-inventory')}});
      };
      window.__captureChapter=capture;
      new MutationObserver(capture).observe(document.querySelector('#function-center'),{attributes:true,attributeFilter:['data-chapter']});
    }''')
    movie.evaluate("document.querySelector('#am-start').click()")
    movie.evaluate('window.__captureChapter()')
    for chapter in ['setup','sensors','segment','heading','water','anomaly','report','safety']:
      movie.wait_for_function('(chapter)=>window.__chapterEntries.some(x=>x.chapter===chapter)', arg=chapter, timeout=25000)
      entry=movie.evaluate('(chapter)=>window.__chapterEntries.find(x=>x.chapter===chapter)', chapter)
      report['journeys'].setdefault('automatic_chapter_entries',[]).append(entry)
      record_screenshot(movie, f'automatic-{chapter}-1366x768')
      check(f'automatic entry {chapter} is native, unscrolled, and has visible controls/mechanism',
            entry['scrollY']==0 and entry['geometry']['controls']['visible'] and
            entry['geometry']['stage']['visible'] and entry['geometry']['causal']['visible'],entry)
    observed=[x['chapter'] for x in report['journeys']['automatic_chapter_entries']]
    check('automatic chapter entries follow the approved eight-stage journey in order',
          observed==['setup','sensors','segment','heading','water','anomaly','report','safety'],observed)
    check('automatic anomaly entry follows real spatial SPIRAL entry with owned override only in SPIRAL',
          next(x for x in report['journeys']['automatic_chapter_entries'] if x['chapter']=='anomaly')['state']=='SPIRAL SCAN' and
          next(x for x in report['journeys']['automatic_chapter_entries'] if x['chapter']=='anomaly')['anomalyUsed'] is True,
          report['journeys']['automatic_chapter_entries'])
    movie.wait_for_function('AutonomousMission.snapshot().missionState === "SPIRAL SCAN"', timeout=90000)
    spiral_entry = movie.evaluate('''()=>{const s=AutonomousMission.snapshot();return {clockMs:s.clockMs,index:s.anomaly.spiralIndex,
      generated:s.anomaly.spiralTargets?.length,planner:s.anomaly.planner,inputs:s.inputs,waypointIndex:s.waypointIndex,
      event:s.latestEvent?.rows?.filter(r=>['anomaly-eligibility','spiral-generation-progress'].includes(r.key))}}''')
    report['journeys']['spiral_entry'] = spiral_entry
    record_screenshot(movie, 'native-spiral-entry')
    movie.wait_for_function('''()=>{const s=AutonomousMission.snapshot();return s.anomaly.planner?.done === true || (s.anomaly.used && s.missionState !== 'SPIRAL SCAN')}''', timeout=90000)
    spiral_done = movie.evaluate('''()=>{const s=AutonomousMission.snapshot();return {clockMs:s.clockMs,index:s.anomaly.spiralIndex,
      generated:s.anomaly.spiralTargets?.length,done:s.anomaly.planner?.done,interruptedIndex:s.anomaly.interruptedIndex,
      state:s.missionState,cleanAbort:s.latestEvent?.rows?.find(r=>r.key==='spiral-abort-timing')?.output?.clean,
      event:s.latestEvent?.rows?.filter(r=>['spiral-generation-progress','spiral-return'].includes(r.key))}}''')
    report['journeys']['spiral_done'] = spiral_done
    check('native movie follows all 25 planner targets without an early clean abort',
          spiral_done['done'] is True and spiral_done['index'] == 25 and spiral_done['generated'] == 25, spiral_done)
    movie.wait_for_function('AutonomousMission.snapshot().missionState === "GRID SCAN" && AutonomousMission.snapshot().anomaly.used', timeout=20000)
    resumed = movie.evaluate('''()=>{const s=AutonomousMission.snapshot();return {clockMs:s.clockMs,index:s.waypointIndex,
      pending:s.anomaly.interruptedIndex,state:s.missionState,done:s.anomaly.planner?.done,lastEvent:s.lastEvent}}''')
    report['journeys']['spiral_resume'] = resumed
    check('full spiral returns to the retained pending GRID target', resumed['index'] == resumed['pending'] and resumed['done'] is True, resumed)
    movie.wait_for_function('AutonomousMission.snapshot().missionState === "RTH"', timeout=150000)
    at_rth = movie.evaluate('''()=>{const s=AutonomousMission.snapshot();return {clockMs:s.clockMs,state:s.missionState,cause:s.returnCause,
      waypoints:s.waypointIndex,accepted:s.acceptedRoute.length,departed:s.rth.departed,arrivalMs:s.rth.arrivalMs,
      applied:s.appliedPwm,stop:s.driveDecision?.stopReason,plannerDone:s.anomaly.planner?.done}}''')
    report['journeys']['rth'] = at_rth
    check('all nine accepted points complete into route-complete RTH (not FORCE_RTH)',
          at_rth['cause'] == 'route-complete' and at_rth['waypoints'] == 9 and at_rth['accepted'] == 9 and at_rth['plannerDone'], at_rth)
    movie.wait_for_function('AutonomousMission.snapshot().missionState === "COMPLETE"', timeout=90000)
    final = movie.evaluate('''()=>{const s=AutonomousMission.snapshot();return {clockMs:s.clockMs,state:s.missionState,cause:s.returnCause,
      waypoints:s.waypointIndex,accepted:s.acceptedRoute.length,departed:s.rth.departed,arrivalMs:s.rth.arrivalMs,
      applied:s.appliedPwm,stop:s.driveDecision?.stopReason,plannerDone:s.anomaly.planner?.done,
      received:s.transport.rx,tx:s.transport.latestTx,commands:s.incoming.applied.filter(x=>x.kind==='command')}}''')
    report['journeys']['complete'] = final
    record_screenshot(movie, 'native-route-complete')
    check('same movie reaches HOME dwell, COMPLETE, and applied 0/0',
          final['cause'] == 'route-complete' and final['accepted'] == 9 and final['waypoints'] == 9 and
          final['arrivalMs'] >= 3000 and final['applied'] == {'left': 0, 'right': 0} and final['plannerDone'], final)
    check('receiver receipt is actual canonical transport state', bool(final['received'] and final['tx']),
          {'received': final['received'], 'tx': final['tx']})
    check('no forced RTH command was issued by the movie',
          not any(x.get('envelope', {}).get('command') == 'FORCE_RTH' for x in final['commands']), final['commands'])
    visible_text = movie.locator('#fc-movie-stage').inner_text()
    check('default main stage hides internal event/packet/debug identifiers',
          not re.search(r'\bEV[- ]?\d|SEQ\d|RX\.sequence|JSON|hex|FSM|snapshot\s+\d+', visible_text, re.I), visible_text)
    check('no browser JavaScript or console errors', not report['errors'], report['errors'])
    movie.close()
    browser.close()
except Exception as exc:
  report['exception'] = f'{type(exc).__name__}: {exc}'
finally:
  report['ended_unix'] = time.time()
  report['failed'] = [c for c in report['checks'] if not c['passed']]
  report['child_exit_code'] = int(bool(report.get('exception') or report['failed']))
  (OUT / 'RESULT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
  print(json.dumps({'checks': len(report['checks']), 'failed': [x['name'] for x in report['failed']],
                    'exception': report.get('exception'), 'journeys': report['journeys'],
                    'screenshots': len(report['screenshots']), 'child_exit_code': report['child_exit_code']}, ensure_ascii=False, indent=2))
raise SystemExit(report['child_exit_code'])
