#!/usr/bin/env python3
"""Native START/RX regression for the reparented Overall report inventory."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any, cast

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True, help='new evidence directory outside the source tree')
args = parser.parse_args()
OUT = Path(args.out).resolve()
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = 'src/js/overall/autonomous-mission.js'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


result = {
    'url': (ROOT / 'index.html').as_uri(),
    'started_unix': time.time(),
    'checks': [],
    'failures': [],
    'browser_events': {'page_errors': [], 'console_errors': []},
    'screenshots': [],
    'source_sha256_before': sha256(ROOT / SOURCE),
    'runs': {},
}


def check(name: str, passed: bool, details=None) -> None:
    entry = {'name': name, 'passed': bool(passed), 'details': details}
    result['checks'].append(entry)
    if not passed:
        result['failures'].append(entry)
        print(json.dumps({'failed': name, 'details': details}, ensure_ascii=False))


def capture(page, label: str):
    data = page.evaluate("""() => {
      const s = window.AutonomousMission.snapshot();
      const canonical = window.MissionPresentation.buildDataView(s, s.transport, window.UplinkCodec);
      const rows = [...document.querySelectorAll('#am-data-table [data-report-field]')].map(row => ({
        id: row.dataset.reportField,
        outgoing: row.querySelector('[data-report-value="outgoing"]').textContent,
        received: row.querySelector('[data-report-value="received"]').textContent
      }));
      return {
        generation: s.transport.generation,
        rx: s.transport.rx,
        latestTx: s.transport.latestTx,
        focus: s.focus,
        outgoingIdentity: document.querySelector('#am-outgoing-identity').textContent,
        receivedIdentity: document.querySelector('#am-received-identity').textContent,
        receivedStatus: document.querySelector('#am-data-received-status').textContent,
        rootRowCount: document.querySelector('[data-autonomous-mission]').querySelectorAll('#am-data-table [data-report-field]').length,
        documentRowCount: rows.length,
        rows,
        canonical: {
          outgoingSequence: canonical.outgoingSequence,
          receivedSequence: canonical.receivedSequence,
          fields: canonical.fields.map(field => ({id: field.id, outgoingValue: field.outgoingValue, receivedValue: field.receivedValue}))
        }
      };
    }""")
    result['runs'][label] = data
    return data


def matches_canonical(data):
    expected = {field['id']: field for field in data['canonical']['fields']}
    actual = {row['id']: row for row in data['rows']}
    return len(actual) == 9 and set(actual) == set(expected) and all(
        actual[key]['outgoing'] == expected[key]['outgoingValue']
        and actual[key]['received'] == expected[key]['receivedValue']
        for key in expected
    )


def placeholders_cleared(data):
    return (
        data['rx'] is None
        and data['outgoingIdentity'] == 'ยังไม่มีชุดข้อมูล'
        and data['receivedIdentity'] == 'ยังไม่ได้รับ'
        and len(data['rows']) == 9
        and all(row['outgoing'] == 'ยังไม่มีชุดข้อมูล' and row['received'] == 'ยังไม่ได้รับ' for row in data['rows'])
    )


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1366, 'height': 768}, device_scale_factor=1)
        page.on('pageerror', lambda error: result['browser_events']['page_errors'].append(str(error)))
        page.on('console', lambda message: result['browser_events']['console_errors'].append(message.text) if message.type == 'error' else None)
        page.goto(result['url'], wait_until='load')
        page.wait_for_function('!!window.AutonomousMission && !!window.MissionPresentation')

        # Use the real START flow and its actual local MessageChannel receiver.
        page.locator('#am-start').click()
        page.wait_for_function('window.AutonomousMission.snapshot().transport.rx !== null', timeout=20000)
        page.locator('[data-movie-chapter="report"]').click()
        inventory = page.locator('#fc-report-inventory')
        if inventory.evaluate('(element) => !element.open'):
            inventory.locator(':scope > summary').click()
        page.wait_for_function('window.AutonomousMission.snapshot().focus === "DATA"')
        first = capture(page, 'native_start')
        first_rx = first['rx']
        check('native START reaches the actual receiver', first_rx is not None, first_rx)
        check('receiver header identity matches canonical received sequence', first_rx is not None and first['receivedIdentity'] == f"ชุดที่ {first_rx['decoded']['sequence_number']}", first)
        check('reparented table is found outside the original mission root', first['rootRowCount'] == 0 and first['documentRowCount'] == 9, first)
        check('all nine outgoing and received rows match canonical formatted report values', matches_canonical(first), first)
        page.locator('#am-data-table').scroll_into_view_if_needed()
        screenshot = OUT / 'native-start-report.png'
        page.screenshot(path=str(screenshot), full_page=True)
        result['screenshots'].append(str(screenshot))

        # RESET is an existing user control; no state is injected or fabricated.
        page.locator('#am-reset').click()
        page.wait_for_function('window.AutonomousMission.snapshot().transport.rx === null')
        after_reset = capture(page, 'after_reset')
        check('RESET clears received identity and all nine report rows', placeholders_cleared(after_reset), after_reset)
        reset_shot = OUT / 'after-reset-report.png'
        page.screenshot(path=str(reset_shot), full_page=True)
        result['screenshots'].append(str(reset_shot))

        # Replay through the same native START button and verify the new generation.
        page.locator('#am-start').click()
        page.wait_for_function('window.AutonomousMission.snapshot().transport.rx !== null', timeout=20000)
        page.locator('[data-movie-chapter="report"]').click()
        inventory = page.locator('#fc-report-inventory')
        if inventory.evaluate('(element) => !element.open'):
            inventory.locator(':scope > summary').click()
        page.wait_for_function('window.AutonomousMission.snapshot().focus === "DATA"')
        replay = capture(page, 'fresh_replay')
        replay_rx = replay['rx']
        check('fresh native replay produces a receiver identity in a new transport generation', replay_rx is not None and replay['generation'] > first['generation'] and replay['receivedIdentity'] == f"ชุดที่ {replay_rx['decoded']['sequence_number']}", replay)
        check('fresh replay repopulates all nine canonical outgoing and received values', matches_canonical(replay), replay)
        replay_shot = OUT / 'fresh-replay-report.png'
        page.screenshot(path=str(replay_shot), full_page=True)
        result['screenshots'].append(str(replay_shot))

        result['browser_events']['page_errors'] = list(result['browser_events']['page_errors'])
        result['browser_events']['console_errors'] = list(result['browser_events']['console_errors'])
        check('native browser run has no page or console errors', not result['browser_events']['page_errors'] and not result['browser_events']['console_errors'], result['browser_events'])
        page.close()
        browser.close()
except Exception as error:
    result['exception'] = {'type': type(error).__name__, 'message': str(error)}
    check('focused native report run completes', False, result['exception'])

def json_safe(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


result['source_sha256_after'] = sha256(ROOT / SOURCE)
check('renderer source remained stable throughout this browser run', result['source_sha256_after'] == result['source_sha256_before'], {'before': result['source_sha256_before'], 'after': result['source_sha256_after']})
result['child_exit'] = int(bool(result['failures']))
result['failed_checks'] = [entry['name'] for entry in result['failures']]
result['output_dir'] = str(OUT)
safe_result = cast(dict[str, Any], json_safe(result))
(OUT / 'RESULT.json').write_text(json.dumps(safe_result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
print(json.dumps({'checks': len(safe_result['checks']), 'failed': safe_result['failed_checks'], 'native_rx_sequence': safe_result['runs'].get('native_start', {}).get('rx', {}).get('sequence'), 'row_count': safe_result['runs'].get('native_start', {}).get('documentRowCount'), 'output': str(OUT), 'child_exit': safe_result['child_exit']}, ensure_ascii=False, allow_nan=False))
raise SystemExit(result['child_exit'])
