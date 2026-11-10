#!/usr/bin/env python3
"""Focused native regression: WP1 passage and eligibility precede SPIRAL activation."""
from pathlib import Path
import argparse, hashlib, json, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
report = {'started_unix': time.time(), 'checks': [], 'errors': [], 'screenshots': []}
def check(name, passed, data=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'data': data})
def mission_state(page):
    return page.evaluate('''()=>{const s=AutonomousMission.snapshot();return {
        clockMs:s.clockMs,position:s.position,heading:s.heading,missionState:s.missionState,
        eventSequence:s.eventSequence,routeCount:s.acceptedRoute.length}}''')
def boot(browser, width, height, motion='reduce'):
    page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion=motion)
    page.on('pageerror', lambda exc: report['errors'].append(str(exc)))
    page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
    page.goto((ROOT / 'index.html').as_uri(), wait_until='load')
    page.wait_for_function('!!window.AutonomousMission && !!window.OverallVisualMotion')
    return page
def panel_for(page):
    return page.locator('.ov-panel').filter(has=page.locator('#ov-spiral-plot'))
def svg_state(panel):
    return panel.locator('svg').evaluate('''e=>{const c=e.cloneNode(true);c.querySelectorAll('[display="none"]').forEach(n=>n.remove());c.querySelectorAll('[class=""]').forEach(n=>n.removeAttribute('class'));return c.innerHTML}''')
def stage(page):
    return page.evaluate('OverallVisualMotion.snapshot().find(s=>s.id==="spiral")')
def image(page, name):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    panel_for(page).screenshot(path=str(path))
    report['screenshots'].append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'url': page.url, 'viewport': page.viewport_size})
def capture_root_view(page, label):
    page.locator('#learn').scroll_into_view_if_needed()
    geometry = page.evaluate('''()=>{const h=document.querySelector('.site-header').getBoundingClientRect().height;const p=document.querySelector('#ov-spiral-plot').closest('.ov-panel');window.scrollTo(0,window.scrollY+p.getBoundingClientRect().top-h-12);return {headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,panelTop:p.getBoundingClientRect().top}}''')
    check(label + ' viewport positions Learn card below sticky header', geometry['panelTop'] >= geometry['headerBottom'] + 4, geometry)
    path = OUT / (label + '-viewport.png')
    page.screenshot(path=str(path))
    report['screenshots'].append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'url': page.url, 'viewport': page.viewport_size, 'header_geometry': geometry})
    image(page, label + '-panel.png')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    try:
        page = boot(browser, 1366, 900, 'reduce')
        panel = panel_for(page)
        controls = panel.locator('.ov-motion-controls')
        targets = page.locator('#ov-spiral-plot .ov-spiral-target')
        canonical_before = mission_state(page)
        baseline_svg = svg_state(panel)
        check('root entry resolves to current Overall page and one canonical model alias', page.url.endswith('/pages/overall.html') and page.evaluate('AutonomousMissionModel===MissionKernel'))
        page.locator('#learn').scroll_into_view_if_needed()
        check('scan targets are visually inactive before the storyboard starts', targets.first.get_attribute('opacity') == '.18')
        controls.locator('button').nth(1).click()
        first = controls.locator('.ov-motion-status').inner_text()
        check('first native NEXT displays GRID start before scan', 'GRID' in first and 'จุดเริ่ม' in first and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cx') == '118', first)
        controls.locator('button').nth(1).click()
        second = controls.locator('.ov-motion-status').inner_text()
        check('second native NEXT visibly shows WP1 travel/passage before SPIRAL activation', 'WP1' in second and 'SPIRAL · เป้าหมาย' not in second, second)
        # This behavior assertion was RED before the production fix.
        assert 'WP1' in second and 'SPIRAL · เป้าหมาย' not in second, f'WP1 passage missing before scan target activation; native NEXT showed: {second}'
        check('GRID leg marker follows SVG route toward WP1', page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cy') == '66' and page.locator('#ov-wp1-passed').get_attribute('opacity') == '0')
        for expected_stage in range(3, 8):
            controls.locator('button').nth(1).click()
            current = stage(page)
            check(f'native NEXT reaches pre-SPIRAL storyboard stage {expected_stage}', current['stage'] == expected_stage and not current['playing'], current)
            check(f'no SPIRAL target activates before eligibility at stage {expected_stage}', all(item.get_attribute('opacity') != '1' for item in targets.all()), {'stage': expected_stage, 'status': controls.locator('.ov-motion-status').inner_text()})
            if expected_stage == 3:
                status = controls.locator('.ov-motion-status').inner_text()
                check('WP1-passed evidence matches marker coordinates and route highlight', 'ผ่าน WP1' in status and 'index ≥ 1' in status and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cx') == '118' and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cy') == '92' and page.locator('#ov-wp1-passed').get_attribute('opacity') == '1', status)
            if expected_stage == 7:
                decision = controls.locator('.ov-motion-status').inner_text()
                semantics_note = panel.locator('.ov-panel-note').nth(0).inner_text()
                eligibility_note = panel.locator('.ov-panel-note').nth(1).inner_text()
                check('eligibility decision names GRID, WP1, anomaly and safety', all(token in decision for token in ['GRID', 'WP1', 'anomaly', 'safety NORMAL']) and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cx') == '220' and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cy') == '180', decision)
                check('Thai explanation defines index semantics and current-fix scan center', 'waypointIndex' in (page.locator('#ov-spiral-desc').text_content() or '') and 'waypointIndex ≥ 1' in semantics_note and 'GPS fix ปัจจุบันตอนเริ่ม' in eligibility_note and 'ไม่จำเป็นต้องตรง WP1' in eligibility_note, {'semantics': semantics_note, 'eligibility': eligibility_note})
        capture_root_view(page, 'desktop-eligibility')
        controls.locator('button').nth(1).click()
        check('first scan target activates only after eligibility', 'SPIRAL · เป้าหมาย 1/25' in controls.locator('.ov-motion-status').inner_text() and targets.first.get_attribute('opacity') == '1' and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cx') == '260' and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cy') == '180')
        capture_root_view(page, 'desktop-first-target')
        controls.locator('button').nth(2).click()
        check('native RESET restores pre-WP1 illustration and dims all targets', stage(page)['stage'] == 0 and svg_state(panel) == baseline_svg and page.locator('#ov-wp1-passed').get_attribute('opacity') == '0' and all(item.get_attribute('opacity') == '.18' for item in targets.all()))
        check('manual NEXT stays usable while reduced motion disables only automatic PLAY', controls.locator('button').nth(0).is_disabled() and controls.locator('button').nth(1).is_enabled())
        controls.locator('button').nth(1).click()
        check('reduced-motion NEXT still moves the Learn marker', stage(page)['stage'] == 1 and page.locator('#ov-spiral-plot > .ov-motion-marker').get_attribute('cx') == '118')
        controls.locator('button').nth(2).click()
        page.emulate_media(reduced_motion='no-preference')
        controls.locator('button').nth(0).click()
        page.wait_for_function('OverallVisualMotion.snapshot().find(s=>s.id==="spiral").stage>=2', timeout=4000)
        controls.locator('button').nth(0).click()
        paused_stage = stage(page)['stage']
        page.wait_for_timeout(700)
        check('native PLAY advances and PAUSE freezes the storyboard', paused_stage >= 2 and stage(page)['stage'] == paused_stage and not stage(page)['playing'], {'paused_stage': paused_stage, 'after_wait': stage(page)})
        check('all Learn actions leave canonical mission clock, pose and mode unchanged', mission_state(page) == canonical_before, {'before': canonical_before, 'after': mission_state(page)})
        page.close()

        page = boot(browser, 390, 844, 'reduce')
        panel = panel_for(page)
        controls = panel.locator('.ov-motion-controls')
        targets = page.locator('#ov-spiral-plot .ov-spiral-target')
        page.locator('#learn').scroll_into_view_if_needed()
        for _ in range(7):
            controls.locator('button').nth(1).click()
        check('mobile native NEXT reaches eligibility without activating a scan target', stage(page)['stage'] == 7 and targets.first.get_attribute('opacity') != '1')
        capture_root_view(page, 'mobile-eligibility')
        controls.locator('button').nth(1).click()
        check('mobile shows first scan target only after eligibility', stage(page)['stage'] == 8 and targets.first.get_attribute('opacity') == '1')
        capture_root_view(page, 'mobile-first-target')
        check('mobile Learn actions leave canonical mission untouched', mission_state(page)['clockMs'] == 0 and mission_state(page)['missionState'] == 'READY')
        check('no browser page or console errors', not report['errors'], report['errors'])
        page.close()
    except Exception as exc:
        report['errors'].append(f'{type(exc).__name__}: {exc}')
    finally:
        browser.close()
report['passed'] = sum(item['passed'] for item in report['checks'])
report['failed'] = sum(not item['passed'] for item in report['checks'])
report['ended_unix'] = time.time()
(OUT / 'REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'passed': report['passed'], 'failed': report['failed'], 'errors': report['errors'], 'report': str(OUT / 'REPORT.json')}, ensure_ascii=False))
raise SystemExit(1 if report['failed'] or report['errors'] else 0)
