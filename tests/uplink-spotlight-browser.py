from datetime import datetime
from pathlib import Path
import hashlib
import json
import math
import struct
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'pages' / 'overall.html'
EVIDENCE = Path('D:/Presention/presention-uplink-spotlight-20261020/evidence/builder')
EVIDENCE.mkdir(parents=True, exist_ok=True)
REPORT_PATH = EVIDENCE / 'uplink-browser-report.json'
REPORT = {
    'started_at': datetime.now().astimezone().isoformat(),
    'source_url': SITE.as_uri() + '#ms-uplink-panel',
    'command': 'python tests/uplink-spotlight-browser.py',
    'viewports': [], 'checks': [], 'transport': {}, 'screenshots': {}, 'errors': [],
}
PAGES = []

INIT_TRANSPORT_HOOK = r"""
(() => {
  const events = [];
  window.__uplinkTransport = { events };
  const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(' ');
  const sequence = buffer => new DataView(buffer).getUint32(0, true);
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (data, transfer) {
    if (data instanceof ArrayBuffer) events.push({ kind: 'post', at: performance.now(), sequence: sequence(data), hex: hex(data), bytes: data.byteLength });
    return post.call(this, data, transfer);
  };
  const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  if (descriptor && descriptor.set && descriptor.get) {
    Object.defineProperty(MessagePort.prototype, 'onmessage', {
      configurable: descriptor.configurable, enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(handler) {
        if (typeof handler !== 'function') return descriptor.set.call(this, handler);
        const receiver = this;
        descriptor.set.call(this, event => {
          if (event.data instanceof ArrayBuffer) events.push({ kind: 'callback', at: performance.now(), sequence: sequence(event.data), hex: hex(event.data), bytes: event.data.byteLength });
          return handler.call(receiver, event);
        });
      }
    });
  }
})();
"""


def save_report():
    REPORT['updated_at'] = datetime.now().astimezone().isoformat()
    REPORT_PATH.write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')


def check(name, details=None):
    REPORT['checks'].append({'name': name, 'passed': True, 'details': details or {}})
    save_report()


def new_page(browser, width=1440, height=900, motion='no-preference', mobile=False):
    page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1,
                            reduced_motion=motion, is_mobile=mobile, has_touch=mobile)
    errors = {'console': [], 'page': [], 'resources': []}
    page.on('console', lambda message: errors['console'].append(message.text) if message.type == 'error' else None)
    page.on('pageerror', lambda error: errors['page'].append(str(error)))
    page.on('requestfailed', lambda request: errors['resources'].append({'url': request.url, 'error': request.failure}))
    page.on('response', lambda response: errors['resources'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
    page.add_init_script(INIT_TRANSPORT_HOOK)
    page.goto(REPORT['source_url'], wait_until='load')
    page.locator('#uplink-motion').wait_for(state='visible')
    PAGES.append({'page': page, 'errors': errors})
    return page, errors


def set_sample(page, value):
    page.locator('[data-testid="turbidity-input"]').evaluate(
        '(el, value) => { el.value = String(value); el.dispatchEvent(new Event("input", { bubbles: true })); }', value
    )


def wait_received(page, timeout=15000):
    page.wait_for_function('() => window.UplinkMotion.snapshot().outcome === "received"', timeout=timeout)


def snapshot(page):
    return page.evaluate('() => window.UplinkMotion.snapshot()')


def raw_transport(page):
    return page.evaluate('() => window.__uplinkTransport.events')


def hex_float(value):
    return ' '.join(f'{byte:02x}' for byte in struct.pack('<f', value))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            # Structural RED/GREEN assertions against the real Overall panel.
            page, _ = new_page(browser)
            stage_count = page.locator('.um-steps [data-stage]').count()
            assert stage_count == 7, f'progress stages sample/build/io/transmit/retry/decode/shore: {stage_count}'
            marker = page.locator('#um-packet')
            assert marker.locator('rect').count() == 0 and marker.locator('circle').count() == 1, 'marker is one dot, not a box'
            assert page.locator('[data-testid="packet-inspector"]').evaluate('(el) => !el.open'), 'inspector must remain folded'
            assert page.locator('[data-testid="field-spotlight"]').is_visible(), 'field spotlight button is visible'
            assert page.locator('#um-field-readout').evaluate('(el) => el.hidden'), 'field readout starts folded and waiting'
            assert page.locator('#um-speed').input_value() == 'normal', 'normal explanation speed is the default'
            check('inline panel has dot, seven lifecycle marks, waiting spotlight and idle-only speed affordance')

            # Desktop viewport geometry and real panel crops, at native DPR 1.
            for width, height in ((1440, 900), (1366, 768)):
                desktop, _ = new_page(browser, width, height)
                desktop.locator('#ms-uplink-panel').scroll_into_view_if_needed()
                metrics = desktop.evaluate('''() => {
                  const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
                  return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,
                    header:box('.site-header'),panel:box('#ms-uplink-panel'),title:box('#ms-uplink-title'),diagram:box('.um-pan'),svg:box('.um-journey'),
                    controls:box('.um-controls'),actions:box('.um-actions'),sender:box('.um-boat'),receiver:box('.um-shore-node'),
                    send:box('#um-send'),inspectorOpen:document.querySelector('[data-testid="packet-inspector"]').open};
                }''')
                assert metrics['documentWidth'] <= width, metrics
                assert metrics['title']['y'] >= metrics['header']['bottom'] - 1, metrics
                assert metrics['svg']['y'] >= 0 and metrics['svg']['bottom'] <= height, metrics
                assert metrics['sender']['x'] >= 0 and metrics['receiver']['right'] <= width, metrics
                assert metrics['actions']['bottom'] <= height, metrics
                assert metrics['send']['height'] >= 44, metrics
                REPORT['viewports'].append({'name': f'{width}x{height}', **metrics})
                crop = EVIDENCE / f'uplink-desktop-{width}x{height}.png'
                desktop.screenshot(path=str(crop), clip={
                    'x': metrics['panel']['x'], 'y': metrics['panel']['y'], 'width': metrics['panel']['width'],
                    'height': metrics['actions']['bottom'] - metrics['panel']['y'] + 4,
                })
                REPORT['screenshots'][crop.name] = {'sha256': digest(crop), 'bytes': crop.stat().st_size,
                                                      'viewport': [width, height], 'dpr': 1,
                                                      'media': desktop.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')}
                check(f'desktop {width}x{height}: sender, receiver, title and bottom controls fit', metrics)

            # Touch viewport: no page overflow and sender/receiver are reachable by bounded pan.
            phone, _ = new_page(browser, 390, 844, mobile=True)
            phone.locator('#ms-uplink-panel').scroll_into_view_if_needed()
            mobile_metrics = phone.evaluate('''() => {
              const pan=document.querySelector('.um-pan'), sender=document.querySelector('.um-boat'), receiver=document.querySelector('.um-shore-node');
              const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};};
              const panRect=pan.getBoundingClientRect();
              const sizes=['#um-turbidity','#um-mode','.um-check','#um-send','#um-reset','#um-speed','#um-field-spotlight']
                .map(selector=>({selector,height:document.querySelector(selector).getBoundingClientRect().height}));
              pan.scrollLeft=0; const senderAtStart=rect(sender);
              pan.scrollLeft=pan.scrollWidth; const receiverAtEnd=rect(receiver);
              return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panViewport:pan.clientWidth,panBounds:{x:panRect.x,right:panRect.right},panContent:pan.scrollWidth,
                panMax:pan.scrollWidth-pan.clientWidth,senderAtStart,receiverAtEnd,sizes,
                controlsVisible:document.querySelector('#um-send').getBoundingClientRect().width>0};
            }''')
            assert mobile_metrics['documentWidth'] <= 390, mobile_metrics
            assert mobile_metrics['panContent'] > mobile_metrics['panViewport'], mobile_metrics
            assert mobile_metrics['senderAtStart']['x'] >= mobile_metrics['panBounds']['x'], mobile_metrics
            assert mobile_metrics['receiverAtEnd']['right'] <= mobile_metrics['panBounds']['right'] + 2, mobile_metrics
            assert all(item['height'] >= 44 for item in mobile_metrics['sizes']), mobile_metrics
            assert mobile_metrics['controlsVisible'], mobile_metrics
            REPORT['viewports'].append({'name': '390x844', **mobile_metrics})
            phone_crop = EVIDENCE / 'uplink-phone-390x844.png'
            phone.evaluate('document.querySelector(".um-pan").scrollLeft = 0')
            phone.locator('.um-motion').screenshot(path=str(phone_crop))
            REPORT['screenshots'][phone_crop.name] = {'sha256': digest(phone_crop), 'bytes': phone_crop.stat().st_size,
                                                       'viewport': [390, 844], 'dpr': 1, 'media': 'no-preference'}
            phone.evaluate('''() => { const pan=document.querySelector('.um-pan'); pan.scrollLeft=pan.scrollWidth; }''')
            receiver_crop = EVIDENCE / 'uplink-phone-receiver-390x844.png'
            phone.locator('.um-pan').screenshot(path=str(receiver_crop))
            REPORT['screenshots'][receiver_crop.name] = {'sha256': digest(receiver_crop), 'bytes': receiver_crop.stat().st_size,
                                                          'viewport': [390, 844], 'dpr': 1, 'media': 'no-preference',
                                                          'pan': 'maximum right; receiver reachable'}
            check('phone 390x844: bounded diagram pan reaches sender and receiver; controls remain 44px; no body overflow', mobile_metrics)

            # Native UI and actual MessageChannel: keyboard spotlight, snapshot, intermediate dot, exact bytes.
            core, core_errors = new_page(browser)
            field = core.locator('[data-testid="field-spotlight"]')
            field.focus()
            core.keyboard.press('Enter')
            assert field.get_attribute('aria-pressed') == 'true'
            assert 'รอ snapshot' in core.locator('#um-field-source').inner_text()
            assert 'รอ receiver callback จริง' in core.locator('#um-field-rx').inner_text()
            set_sample(core, 24)
            core.locator('[data-testid="send-button"]').scroll_into_view_if_needed()
            normal_started = core.evaluate('() => performance.now()')
            normal_wall_started = time.monotonic()
            core.locator('[data-testid="send-button"]').click()
            assert snapshot(core)['phase'] == 'sample'
            assert core.locator('#um-speed').is_disabled()
            assert core.locator('[data-testid="shore-value"]').inner_text() == '—'
            assert core.locator('#um-packet-label').text_content() == 'SEQ 1 · 24 NTU'
            assert 'รอสร้าง packet bytes' in core.locator('#um-field-tx').inner_text()
            core.wait_for_function('() => window.UplinkMotion.snapshot().phase === "transmit"', timeout=8000)
            core.wait_for_function('''() => {
              const m=document.querySelector('#um-packet').transform.baseVal.consolidate().matrix;
              return m.e > 200 && m.e < 790 && document.querySelector('#um-packet').classList.contains('is-visible');
            }''', timeout=5000)
            intermediate_x = core.locator('#um-packet').evaluate('el => el.transform.baseVal.consolidate().matrix.e')
            inflight_crop = EVIDENCE / 'uplink-orange-dot-inflight.png'
            core.locator('.um-pan').screenshot(path=str(inflight_crop))
            REPORT['screenshots'][inflight_crop.name] = {'sha256': digest(inflight_crop), 'bytes': inflight_crop.stat().st_size,
                                                          'viewport': [1440, 900], 'dpr': 1, 'media': 'no-preference',
                                                          'phase': 'transmit; actual intermediate dot position'}
            set_sample(core, 89)
            in_flight = snapshot(core)
            assert in_flight['sample']['turbidity'] == 24 and in_flight['sequence'] == 1, in_flight
            assert core.locator('#um-packet-label').text_content() == 'SEQ 1 · 24 NTU'
            assert core.locator('[data-testid="shore-value"]').inner_text() == '—'
            assert 'SEQ 1 · 24 NTU' in core.locator('#um-field-source').inner_text()
            assert 'รอ receiver callback จริง' in core.locator('#um-field-rx').inner_text()
            core.wait_for_function('() => window.UplinkMotion.snapshot().phase === "decode"', timeout=10000)
            assert core.locator('[data-testid="shore-value"]').inner_text() == '—', 'callback decode cannot prematurely commit shore'
            received_at_callback = snapshot(core)
            assert received_at_callback['decoded']['water_turbidity'] == 24
            assert received_at_callback['receivedHex'] == received_at_callback['wireHex']
            core.wait_for_function('() => window.UplinkMotion.snapshot().outcome === "received"', timeout=5000)
            first = snapshot(core)
            raw = raw_transport(core)
            posts = [event for event in raw if event['kind'] == 'post']
            callbacks = [event for event in raw if event['kind'] == 'callback']
            assert len(posts) == 1 and len(callbacks) == 1, raw
            assert posts[0]['sequence'] == callbacks[0]['sequence'] == 1
            assert posts[0]['hex'] == callbacks[0]['hex'] == first['wireHex'] == first['receivedHex']
            expected = hex_float(24.0)
            assert ' '.join(first['wireHex'].split()[24:28]) == expected, (first['wireHex'], expected)
            assert ' '.join(first['receivedHex'].split()[24:28]) == expected, (first['receivedHex'], expected)
            assert first['decoded']['water_turbidity'] == 24 and first['shoreValue'] == 24
            assert core.locator('#um-rx-sequence').inner_text() == 'RX SEQ 1'
            assert 'TX SEQ 1' in core.locator('#um-field-tx').inner_text()
            assert 'RX SEQ 1' in core.locator('#um-field-rx').inner_text()
            assert '24 NTU' in core.locator('#um-field-rx').inner_text()
            byte_marks = core.locator('#um-byte-cells rect.is-highlighted').count()
            rx_marks = core.locator('#um-received-cells rect.is-highlighted').count()
            assert byte_marks == rx_marks == 4, (byte_marks, rx_marks)
            offsets = core.locator('#um-byte-cells rect[data-field-offset="water_turbidity"]').evaluate_all('els => els.map(el => Number(el.dataset.byteOffset))')
            assert offsets == [24, 25, 26, 27], offsets
            normal_wall_duration = time.monotonic() - normal_wall_started
            normal_post = next(event for event in raw if event['kind'] == 'post' and event['sequence'] == 1)
            normal_duration = (normal_post['at'] - normal_started) / 1000
            check('keyboard spotlight maps exact float32 bytes 24–27 through actual TX, callback RX and decoded shore; edit cannot mutate flight',
                  {'tx_hex': first['wireHex'], 'rx_hex': first['receivedHex'], 'post': posts[0], 'callback': callbacks[0],
                   'intermediate_dot_x': intermediate_x, 'snapshot': first, 'normal_seconds': normal_duration})

            # Slow playback scales only the same phase/UI schedule and remains compatible with SEND.
            core.locator('#um-speed').select_option('slow')
            set_sample(core, 68)
            slow_started = core.evaluate('() => performance.now()')
            slow_wall_started = time.monotonic()
            core.locator('[data-testid="send-button"]').click()
            assert core.locator('#um-speed').is_disabled()
            core.wait_for_function('() => window.UplinkMotion.snapshot().phase === "transmit"', timeout=12000)
            set_sample(core, 91)
            assert snapshot(core)['sample']['turbidity'] == 68
            assert core.locator('#um-packet-label').text_content() == 'SEQ 2 · 68 NTU'
            assert core.locator('[data-testid="shore-value"]').inner_text() == '24'
            wait_received(core, timeout=18000)
            second = snapshot(core)
            slow_wall_duration = time.monotonic() - slow_wall_started
            slow_post = next(event for event in raw_transport(core) if event['kind'] == 'post' and event['sequence'] == 2)
            slow_duration = (slow_post['at'] - slow_started) / 1000
            assert second['sequence'] == 2 and second['decoded']['water_turbidity'] == 68
            assert core.locator('#um-rx-sequence').inner_text() == 'RX SEQ 2'
            assert slow_duration > normal_duration * 1.4, {'normal': normal_duration, 'slow': slow_duration}
            core.locator('#um-speed').select_option('normal')
            core.locator('[data-testid="send-button"]').click()
            wait_received(core)
            third = snapshot(core)
            assert third['sequence'] == 3 and third['decoded']['water_turbidity'] == 91
            check('slow control uniformly lengthens a real send and next explicit send snapshots the edited value',
                  {'normal_to_post_seconds': normal_duration, 'slow_to_post_seconds': slow_duration,
                   'normal_wall_seconds': normal_wall_duration, 'slow_wall_seconds': slow_wall_duration,
                   'seq2_wire_hex': second['wireHex'], 'seq3_wire_hex': third['wireHex'], 'seq3': third})

            # Drop-first retry reuses immutable snapshot; all-drop retains actual last RX and needs explicit fresh send.
            set_sample(core, 51)
            core.locator('[data-testid="drop-first"]').check()
            core.locator('[data-testid="send-button"]').click()
            core.wait_for_function('() => window.UplinkMotion.snapshot().phase === "retry"', timeout=10000)
            first_drop = snapshot(core)
            assert len(first_drop['attempts']) == 1 and first_drop['attempts'][0].get('modeledDrop')
            assert first_drop['attempts'][0]['sequence'] == 4
            assert not [event for event in raw_transport(core) if event['kind'] == 'post' and event['sequence'] == 4]
            assert core.locator('#um-packet').evaluate('el => el.classList.contains("is-lost")')
            assert core.locator('[data-testid="shore-value"]').inner_text() == '91'
            core.locator('[data-testid="drop-first"]').uncheck()
            wait_received(core, timeout=15000)
            retried = snapshot(core)
            assert [attempt['sequence'] for attempt in retried['attempts']] == [4, 4]
            assert len({attempt['bytesHex'] for attempt in retried['attempts']}) == 1
            retry_post = [event for event in raw_transport(core) if event['kind'] == 'post' and event['sequence'] == 4]
            retry_callback = [event for event in raw_transport(core) if event['kind'] == 'callback' and event['sequence'] == 4]
            assert len(retry_post) == len(retry_callback) == 1
            assert retry_post[0]['hex'] == retry_callback[0]['hex'] == retried['wireHex']

            set_sample(core, 73)
            core.locator('[data-testid="link-off"]').check()
            core.locator('[data-testid="send-button"]').click()
            core.wait_for_function('() => window.UplinkMotion.snapshot().phase === "retry"', timeout=10000)
            core.wait_for_function('() => window.UplinkMotion.snapshot().outcome === "failed"', timeout=18000)
            failed = snapshot(core)
            assert [attempt['sequence'] for attempt in failed['attempts']] == [5, 5, 5]
            assert len({attempt['bytesHex'] for attempt in failed['attempts']}) == 1
            assert failed['decoded']['sequence_number'] == 4 and failed['shoreValue'] == 51
            assert failed['receivedHex'] == retried['receivedHex']
            assert core.locator('#um-rx-sequence').inner_text() == 'RX SEQ 4'
            assert core.locator('[data-testid="shore-value"]').inner_text() == '51'
            assert core.locator('[data-testid="stale-label"]').is_visible()
            assert core.locator('#um-packet').evaluate('el => el.classList.contains("is-lost")')
            set_sample(core, 88)
            core.locator('[data-testid="link-off"]').uncheck()
            assert snapshot(core)['sequence'] == 5, 'recovering link must not replay or buffer'
            core.locator('[data-testid="send-button"]').click()
            wait_received(core)
            fresh = snapshot(core)
            assert fresh['sequence'] == 6 and fresh['decoded']['water_turbidity'] == 88
            check('first-drop same-byte retry and all-drop stale RX hold; link recovery requires explicit fresh send',
                  {'first_drop': first_drop, 'retry': retried, 'failed': failed, 'fresh': fresh,
                   'retry_post': retry_post[0], 'retry_callback': retry_callback[0]})

            # STANDBY preserves real NaN bytes and decoded unavailable state.
            standby, _ = new_page(browser, 1440, 900, motion='reduce')
            set_sample(standby, 55)
            standby.locator('[data-testid="mode-input"]').select_option('standby')
            standby.locator('[data-testid="field-spotlight"]').click()
            standby.locator('[data-testid="send-button"]').click()
            wait_received(standby)
            standby_state = snapshot(standby)
            assert standby.evaluate('Number.isNaN(window.UplinkMotion.snapshot().decoded.water_turbidity)')
            standby_tx = bytes.fromhex(standby_state['wireHex'])
            standby_rx = bytes.fromhex(standby_state['receivedHex'])
            assert math.isnan(struct.unpack('<f', standby_tx[24:28])[0])
            assert math.isnan(struct.unpack('<f', standby_rx[24:28])[0])
            assert standby.locator('[data-testid="shore-value"]').inner_text() == 'NaN · STANDBY'
            assert 'NaN · STANDBY' in standby.locator('#um-field-source').inner_text()
            assert 'NaN · STANDBY' in standby.locator('#um-field-rx').inner_text()
            assert standby.locator('#um-packet-label').text_content() == 'SEQ 1 · STANDBY · NaN'
            assert standby.locator('#um-byte-cells rect.is-highlighted').count() == 4
            check('STANDBY transmits and receives actual float32 NaN at byte offsets 24–27',
                  {'tx_hex': standby_state['wireHex'], 'rx_hex': standby_state['receivedHex'], 'snapshot': standby_state})

            # Reduced motion, invalid length rejection, reset cancellation and hidden-page cancellation.
            invalid = core.evaluate('() => window.UplinkMotion.verifyInvalidLength()')
            assert invalid['accepted'] is False and invalid['invalidLengthRejected'] is True and invalid['shoreUnchanged'] is True, invalid
            reset_page, _ = new_page(browser, 1440, 900, motion='reduce')
            set_sample(reset_page, 68)
            reset_page.locator('[data-testid="send-button"]').click()
            reset_page.wait_for_function('() => window.UplinkMotion.snapshot().phase === "build"', timeout=5000)
            reset_page.locator('[data-testid="reset-button"]').click()
            assert snapshot(reset_page)['outcome'] == 'idle'
            reset_page.wait_for_timeout(850)
            after_reset = snapshot(reset_page)
            assert after_reset['receiverCallbacks'] == 0 and after_reset['pendingTimerCount'] == 0 and not after_reset['hasOpenChannel']
            assert reset_page.locator('[data-testid="shore-value"]').inner_text() == '—'
            hidden_page, _ = new_page(browser, 1440, 900)
            hidden_page.locator('[data-testid="send-button"]').click()
            hidden_page.wait_for_function('() => window.UplinkMotion.snapshot().phase === "transmit"', timeout=8000)
            hidden_page.evaluate('''() => { Object.defineProperty(document, 'hidden', { configurable:true, value:true });
              document.dispatchEvent(new Event('visibilitychange')); }''')
            hidden_state = snapshot(hidden_page)
            assert hidden_state['outcome'] == 'paused' and hidden_state['pendingTimerCount'] == 0 and not hidden_state['hasOpenChannel']
            hidden_page.wait_for_timeout(1500)
            assert snapshot(hidden_page)['receiverCallbacks'] == 0
            check('reduced-motion transfer, invalid length rejection, reset and hidden-page cancel suppress stale callbacks',
                  {'invalid_length': invalid, 'after_reset': after_reset, 'hidden_cancel': hidden_state})

            for item in PAGES:
                REPORT['errors'].append({'url': item['page'].url, **item['errors']})
            assert all(not any(errors.values()) for errors in (item['errors'] for item in PAGES)), REPORT['errors']
            REPORT['transport'] = {
                'core': raw_transport(core), 'standby': raw_transport(standby), 'retry_and_loss': raw_transport(core),
                'actual_bytes': 'captured by init-script MessagePort.postMessage and MessagePort.onmessage instrumentation',
            }
            REPORT['finished_at'] = datetime.now().astimezone().isoformat()
            save_report()
        finally:
            browser.close()


try:
    main()
except Exception as error:
    REPORT['failure'] = {'type': type(error).__name__, 'message': str(error)}
    REPORT['errors'].extend({'url': item['page'].url, **item['errors']} for item in PAGES)
    save_report()
    raise
