"""Native root-browser regression for Overall RESET control/model synchronization."""
from pathlib import Path
import argparse, hashlib, json, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
report = {'started_unix': time.time(), 'checks': [], 'errors': [], 'screenshots': []}

def check(name, passed, details=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'details': details})

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce')
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
    page.goto((ROOT / 'index.html').as_uri(), wait_until='load')
    page.wait_for_function('!!window.AutonomousMission')
    page.locator('.am-input-details > summary').click()
    page.set_default_timeout(5000)

    def defaults():
        return page.evaluate('''() => ({
          numeric:[...document.querySelectorAll('[data-policy-input]')].map(e=>({key:e.dataset.policyInput,value:e.value})),
          checkboxes:[...document.querySelectorAll('[data-mission-input]')].map(e=>({key:e.dataset.missionInput,checked:e.checked})),
          transport:[...document.querySelectorAll('#am-drop-first,#am-loss-all')].map(e=>({id:e.id,checked:e.checked}))
        })''')
    initial = defaults()

    def dirty_controls():
        for key, value in [('batteryVoltage', '11.4'), ('turbidityV', '1.2'), ('phV', '3.1'), ('tempC', '31')]:
            control = page.locator(f'[data-policy-input="{key}"]')
            control.fill(value)
            control.dispatch_event('change')
        for selector in ['[data-mission-input="gps"]', '[data-mission-input="compass"]', '[data-mission-input="route"]', '#am-drop-first', '#am-loss-all']:
            control = page.locator(selector)
            control.uncheck()
            control.dispatch_event('change')

    def assert_reset(label):
        actual = defaults()
        snapshot = page.evaluate('AutonomousMission.snapshot()')
        values = {entry['key']: entry['value'] for entry in actual['numeric']}
        expected_numeric = {entry['key']: entry['value'] for entry in initial['numeric']}
        model = snapshot['inputs']
        numeric_model_ok = all((key not in model if value == '' else model.get(key) == float(value)) for key, value in expected_numeric.items())
        checkbox_model_ok = all(model.get(entry['key']) == entry['checked'] for entry in actual['checkboxes'])
        route_clear = snapshot['clockMs'] == 0 and snapshot['acceptedRoute'] == [] and snapshot['incoming']['posted'] == [] and snapshot['incoming']['generation'] >= 1
        check(label + ': numeric and checkbox DOM restored to native defaults', actual == initial, {'expected': initial, 'actual': actual})
        check(label + ': model inputs synchronized with restored numeric and checkbox controls', numeric_model_ok and checkbox_model_ok, {'modelInputs': model, 'expectedNumeric': expected_numeric, 'checkboxes': actual['checkboxes']})
        check(label + ': canonical clock, route and RX queue cleared', route_clear, {'clockMs': snapshot['clockMs'], 'routeCount': len(snapshot['acceptedRoute']), 'incoming': snapshot['incoming']})
        page.locator('[data-policy-input="batteryVoltage"]').fill('11.8')
        page.locator('[data-policy-input="batteryVoltage"]').dispatch_event('change')
        check(label + ': policy controls remain editable after reset', page.evaluate('AutonomousMission.snapshot().inputs.batteryVoltage') == 11.8)
        page.locator('#am-reset').click()

    dirty_controls()
    page.locator('#am-reset').click()
    assert_reset('RESET')
    dirty_controls()
    page.locator('#am-spiral-demo').click()
    demo = page.evaluate('AutonomousMission.snapshot()')
    # Demo immediately starts the same mission, so inputs must still be restored even though its clock advances.
    actual = defaults()
    model = demo['inputs']
    expected_numeric = {entry['key']: entry['value'] for entry in initial['numeric']}
    numeric_model_ok = all((key not in model if value == '' else model.get(key) == float(value)) for key, value in expected_numeric.items())
    check('source-demo reset restores control defaults and input model', actual == initial and numeric_model_ok, {'dom': actual, 'modelInputs': model, 'clockMs': demo['clockMs'], 'missionState': demo['missionState']})
    page.screenshot(path=str(OUT / 'reset-desktop.png'), full_page=True)
    report['screenshots'].append(str(OUT / 'reset-desktop.png'))
    mobile = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True, reduced_motion='reduce')
    mobile.on('pageerror', lambda error: report['errors'].append(str(error)))
    mobile.goto((ROOT / 'index.html').as_uri(), wait_until='load')
    mobile.wait_for_function('!!window.AutonomousMission')
    mobile.screenshot(path=str(OUT / 'reset-mobile.png'), full_page=True)
    report['screenshots'].append(str(OUT / 'reset-mobile.png'))
    browser.close()

report['sources'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['index.html','pages/overall.html','src/js/overall/autonomous-mission.js',Path(__file__).relative_to(ROOT).as_posix()]}
report['passed'] = sum(item['passed'] for item in report['checks'])
report['failed'] = sum(not item['passed'] for item in report['checks'])
report['ended_unix'] = time.time()
(OUT / 'REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': report['passed'], 'failed': report['failed'], 'errors': report['errors'], 'report': str(OUT / 'REPORT.json')}, ensure_ascii=False))
raise SystemExit(1 if report['failed'] or report['errors'] else 0)
