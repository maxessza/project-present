#!/usr/bin/env python3
"""Fresh root-browser low-battery RTH journey through the real native station channel."""
from __future__ import annotations
import argparse, hashlib, json, math, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
OUT = Path(parser.parse_args().out)
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'url': (ROOT / 'index.html').as_uri(), 'started_unix': time.time(), 'checks': [], 'checkpoints': {}, 'screenshots': [], 'errors': [], 'native_wire': {}}
HOOK = r'''(() => {
  window.__wire={posts:[],receipts:[]};
  const clone=v=>v instanceof ArrayBuffer?{bytes:Array.from(new Uint8Array(v))}:structuredClone(v);
  const post=MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage=function(v){window.__wire.posts.push({at:performance.now(),value:clone(v)});return post.apply(this,arguments);};
  const Native=window.MessageChannel;
  window.MessageChannel=function(){const c=new Native();[c.port1,c.port2].forEach(p=>p.addEventListener('message',e=>window.__wire.receipts.push({at:performance.now(),value:clone(e.data)})));return c;};
})();'''


def save():
    (OUT / 'REPORT.json').write_text(json.dumps(json_safe(REPORT), ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')


def json_safe(value):
    if isinstance(value, float) and not math.isfinite(value):
        return 'NaN' if math.isnan(value) else ('Infinity' if value > 0 else '-Infinity')
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def check(name, passed, details=None):
    row = {'name': name, 'passed': bool(passed), 'details': details}
    REPORT['checks'].append(row)
    save()
    if not passed:
        raise AssertionError(name + ': ' + json.dumps(details, ensure_ascii=False, default=str))


def snapshot(page):
    return page.evaluate('AutonomousMission.snapshot()')


def checkpoint(page, name):
    state = snapshot(page)
    REPORT['checkpoints'][name] = {'snapshot': state, 'wire': page.evaluate('window.__wire')}
    save()
    return state


def drive(page, predicate, count=50, limit=500):
    for _ in range(limit):
        state = snapshot(page)
        if predicate(state):
            return state
        page.evaluate('(n)=>AutonomousMission.fastForward(n)', count)
        page.wait_for_timeout(8)
    state = checkpoint(page, 'bounded-timeout')
    raise AssertionError('bounded drive timed out: ' + json.dumps({'predicate': predicate.__name__, 'clockMs': state['clockMs'], 'missionState': state['missionState'], 'position': state['position'], 'homeDistanceM': state['homeDistanceM'], 'rth': state['rth']}, ensure_ascii=False))


def shot(page, name, full_page=False):
    target = OUT / name
    page.screenshot(path=str(target), full_page=full_page)
    REPORT['screenshots'].append({'path': str(target), 'url': page.url, 'state': snapshot(page)['missionState'], 'clockMs': snapshot(page)['clockMs'], 'viewport': page.viewport_size, 'reduced_motion': 'reduce', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    save()


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1366, 'height': 768}, device_scale_factor=1, reduced_motion='reduce')
        page.add_init_script(HOOK)
        page.on('pageerror', lambda error: REPORT['errors'].append({'pageerror': str(error)}))
        page.on('console', lambda msg: REPORT['errors'].append({'console': msg.text}) if msg.type == 'error' else None)
        page.on('requestfailed', lambda req: REPORT['errors'].append({'request': req.url, 'failure': req.failure}))
        page.goto(REPORT['url'], wait_until='load')
        page.wait_for_function('!!window.AutonomousMission && !!window.MissionKernel')
        fresh = checkpoint(page, 'fresh')
        check('fresh root starts READY with no route, no departure and stopped output', fresh['missionState'] == 'READY' and not fresh['acceptedRoute'] and not fresh['rth']['departed'] and fresh['appliedPwm'] == {'left': 0, 'right': 0})

        route = [{'x': 335, 'y': 150}]
        page.evaluate('points=>{AutonomousMission.testStartWithRoute(points);AutonomousMission.dispatch({type:"pause"});}', route)
        moving = drive(page, lambda s: s['missionState'] == 'GRID SCAN' and s['stationStage'] == 'moving' and s['acceptedRoute'] == route, count=40)
        checkpoint(page, 'route-received-start-accepted-moving')
        wire = page.evaluate('window.__wire')
        posts = [item['value'] for item in wire['posts'] if isinstance(item['value'], dict) and item['value'].get('kind') in ('route-upload', 'start')]
        received = [item['value'] for item in wire['receipts'] if isinstance(item['value'], dict) and item['value'].get('kind') in ('route-upload', 'start')]
        check('actual native route and distinct START packets are received and applied before navigation', len(posts) == 2 and {p['kind'] for p in posts} == {'route-upload', 'start'} and len(received) == 2 and moving['appliedRouteMessageId'] == next(p['messageId'] for p in posts if p['kind'] == 'route-upload') and moving['appliedStartMessageId'] == next(p['messageId'] for p in posts if p['kind'] == 'start') and moving['position'] != {'x': 335, 'y': 455}, {'posts': posts, 'receipts': received, 'state': moving})

        departed = drive(page, lambda s: bool(s['rth']['departed']), count=80, limit=300)
        checkpoint(page, 'departure-latched-before-low-battery')
        check('source departure latch is naturally reached before fault injection', departed['missionState'] == 'GRID SCAN' and departed['homeDistanceM'] >= 12 and departed['rth']['departureMs'] >= 2000 and not departed['commands']['forceRth'], {'homeDistanceM': departed['homeDistanceM'], 'departureMs': departed['rth']['departureMs'], 'commands': departed['commands'], 'position': departed['position']})
        shot(page, 'lowbattery-grid-departed.png')

        details = page.locator('.am-input-details')
        if not details.evaluate('(element)=>element.open'):
            details.locator(':scope > summary').click()
        battery = page.locator('[data-policy-input="batteryVoltage"]')
        battery.fill('10.2')
        battery.dispatch_event('change')
        details.locator(':scope > summary').click()
        low_rth = drive(page, lambda s: s['missionState'] == 'RTH' and s['safetyState'] == 'LOW_BATTERY_RTH', count=1, limit=20)
        checkpoint(page, 'low-battery-RTH-entered')
        check('injected low battery, not FORCE_RTH, causes the active mission to enter RTH with HOME set', low_rth['missionState'] == 'RTH' and low_rth['safetyState'] == 'LOW_BATTERY_RTH' and low_rth['inputs']['batteryVoltage'] == 10.2 and low_rth['homeDistanceM'] > 4 and low_rth['rth']['entryOutside'] and not low_rth['commands']['forceRth'], {'safety': low_rth['safetyState'], 'voltage': low_rth['batteryVoltage'], 'homeDistanceM': low_rth['homeDistanceM'], 'rth': low_rth['rth'], 'commands': low_rth['commands']})
        shot(page, 'lowbattery-rth-active.png')

        parked = drive(page, lambda s: s['missionState'] == 'RTH' and s['homeDistanceM'] <= 4 and s['appliedPwm'] == {'left': 0, 'right': 0}, count=50, limit=500)
        checkpoint(page, 'RTH-parked-arrival-dwell')
        check('RTH actually returns to the 4m park gate before its continuous arrival dwell', parked['rth']['departed'] and parked['rth']['entryOutside'] and parked['homeDistanceM'] <= 4 and parked['rth']['arrivalMs'] < 3000 and parked['appliedPwm'] == {'left': 0, 'right': 0}, {'homeDistanceM': parked['homeDistanceM'], 'rth': parked['rth'], 'appliedPwm': parked['appliedPwm']})
        complete = drive(page, lambda s: s['missionState'] == 'COMPLETE', count=50, limit=100)
        checkpoint(page, 'RTH-complete')
        check('valid 3000ms return dwell completes through the RTH FSM path with stopped motors', complete['missionState'] == 'COMPLETE' and complete['rth']['arrivalMs'] >= 3000 and complete['appliedPwm'] == {'left': 0, 'right': 0} and complete['safetyState'] == 'LOW_BATTERY_RTH', {'clockMs': complete['clockMs'], 'homeDistanceM': complete['homeDistanceM'], 'rth': complete['rth'], 'mode': complete['mode'], 'appliedPwm': complete['appliedPwm']})
        shot(page, 'lowbattery-rth-complete.png', full_page=True)
        REPORT['native_wire'] = page.evaluate('window.__wire')
        check('no native browser page/console/resource errors', not REPORT['errors'], REPORT['errors'])
        browser.close()
except Exception as error:
    REPORT['errors'].append({'failure': type(error).__name__, 'message': str(error), 'traceback': traceback.format_exc()})
    save()
    raise

REPORT['ended_unix'] = time.time()
REPORT['passed'] = sum(row['passed'] for row in REPORT['checks'])
REPORT['failed'] = sum(not row['passed'] for row in REPORT['checks'])
REPORT['source_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['index.html', 'pages/overall.html', 'src/js/overall/autonomous-mission.js', 'src/js/overall/mission-kernel.js', 'src/js/overall/mission-incoming.js', 'tests/overall-lowbattery-browser.py']}
save()
print(json.dumps({'passed': REPORT['passed'], 'failed': REPORT['failed'], 'errors': REPORT['errors'], 'report': str(OUT / 'REPORT.json'), 'checkpoints': list(REPORT['checkpoints']), 'screenshots': REPORT['screenshots']}, ensure_ascii=False))
raise SystemExit(1 if REPORT['failed'] or REPORT['errors'] else 0)
