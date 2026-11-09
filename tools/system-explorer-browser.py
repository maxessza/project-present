#!/usr/bin/env python3
"""Real Chromium evidence harness for the local system-explorer prototype."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = Path(__file__).resolve().parents[2] / "evidence" / "top-down" / "builder"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attach_events(page, label, events):
    events[label] = {"console": [], "page_errors": [], "request_failures": [], "responses": []}
    page.on("console", lambda msg: events[label]["console"].append({"type": msg.type, "text": msg.text}))
    page.on("pageerror", lambda error: events[label]["page_errors"].append(str(error)))
    page.on("requestfailed", lambda req: events[label]["request_failures"].append({"url": req.url, "failure": req.failure}))
    def record_response(response):
        events[label]["responses"].append({"url": response.url, "status": response.status})
    page.on("response", record_response)


def check(report, name, condition, details=None):
    report["checks"].append({"name": name, "passed": bool(condition), "details": details})
    if not condition:
        raise AssertionError(f"{name}: {details!r}")


def check_whole_scene(report, page, prefix):
    geometry = page.evaluate("""() => {
      const box = el => { const b=el.getBoundingClientRect(); return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}; };
      const intersects = (a,b) => Math.min(a.right,b.right)-Math.max(a.x,b.x)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2;
      const texts=[...document.querySelectorAll('#survey-area text')].map(el=>({text:el.textContent,box:box(el)}));
      const overlaps=[];
      texts.forEach((a,i)=>texts.slice(i+1).forEach(b=>{if(intersects(a.box,b.box))overlaps.push([a.text,b.text]);}));
      const hull=box(document.querySelector('#boat-whole > path'));
      const points=[...document.querySelectorAll('.survey-waypoint')].map(el=>({label:el.textContent.trim(),box:box(el)}));
      const pointsOverBoat=points.filter(point=>intersects(point.box,hull)).map(point=>point.label);
      return {overlaps,labels:texts.map(item=>item.text),pointLabels:points.map(point=>point.label),pointsOverBoat,hull};
    }""")
    check(report, f"{prefix}: survey area, water subtitle, and 3x3 title do not overlap", not geometry["overlaps"], geometry)
    check(report, f"{prefix}: all nine readable waypoint markers remain outside the boat silhouette", geometry["pointLabels"] == [str(index) for index in range(1, 10)] and not geometry["pointsOverBoat"], geometry)


def page_url(path: Path) -> str:
    return path.resolve().as_uri()


def navigate_to_heading(page, report, prefix):
    check(report, f"{prefix}: whole level is initially rendered", page.locator("#explorer").get_attribute("data-level") == "whole")
    check(report, f"{prefix}: no equation or gain controls on first view", page.locator("#experiment-details").is_hidden())
    page.screenshot(path=str(EVIDENCE / f"{prefix}-whole.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-whole.png"))
    page.locator("#enter-navigation").click()
    check(report, f"{prefix}: whole to navigation", page.locator("#explorer").get_attribute("data-level") == "navigation")
    page.wait_for_timeout(330)
    navigation_camera = page.locator("#scene-camera").evaluate("""el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return {transform:getComputedStyle(el).transform,scale:Math.hypot(m.a,m.b),tx:m.e,ty:m.f}; }""")
    report.setdefault("camera_transitions", []).append({"name": f"{prefix}: whole-to-navigation in flight", **navigation_camera})
    check(report, f"{prefix}: whole-to-navigation camera is visibly in flight", 1.02 < navigation_camera["scale"] < 1.63 and navigation_camera["tx"] < 0, navigation_camera)
    visual_box = page.locator(".visual-panel").bounding_box()
    story_box = page.locator(".story-panel").bounding_box()
    no_panel_overlap = visual_box["x"] + visual_box["width"] <= story_box["x"] or story_box["x"] + story_box["width"] <= visual_box["x"] or visual_box["y"] + visual_box["height"] <= story_box["y"] or story_box["y"] + story_box["height"] <= visual_box["y"]
    check(report, f"{prefix}: scene and narration panels do not overlap", no_panel_overlap, {"visual": visual_box, "story": story_box})
    page.screenshot(path=str(EVIDENCE / f"{prefix}-navigation-transition.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-navigation-transition.png"))
    page.wait_for_timeout(570)
    navigation_camera_end = page.locator("#scene-camera").evaluate("el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return Math.hypot(m.a,m.b); }")
    check(report, f"{prefix}: navigation camera reaches its endpoint", abs(navigation_camera_end - 1.65) < 0.02, navigation_camera_end)
    page.screenshot(path=str(EVIDENCE / f"{prefix}-navigation.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-navigation.png"))
    page.locator("#enter-heading").click()
    check(report, f"{prefix}: navigation to heading", page.locator("#explorer").get_attribute("data-level") == "heading")
    page.wait_for_timeout(330)
    heading_camera = page.locator("#scene-camera").evaluate("""el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return {transform:getComputedStyle(el).transform,scale:Math.hypot(m.a,m.b),tx:m.e,ty:m.f}; }""")
    report.setdefault("camera_transitions", []).append({"name": f"{prefix}: navigation-to-heading in flight", **heading_camera})
    check(report, f"{prefix}: navigation-to-heading camera is visibly in flight", 1.65 < heading_camera["scale"] < 1.75 and heading_camera["tx"] < -142, heading_camera)
    page.screenshot(path=str(EVIDENCE / f"{prefix}-heading-transition.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-heading-transition.png"))
    page.wait_for_timeout(570)
    page.screenshot(path=str(EVIDENCE / f"{prefix}-heading-before.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-heading-before.png"))
    if not prefix.startswith("mobile-"):
        final_camera = page.locator("#scene-camera").evaluate("""el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return {scale:Math.hypot(m.a,m.b),tx:m.e,ty:m.f}; }""")
        check(report, f"{prefix}: heading camera settles on the fitted detail view", abs(final_camera["scale"] - 1.75) < 0.02 and abs(final_camera["tx"] + 187.5) < 0.1 and abs(final_camera["ty"] + 337.25) < 0.1, final_camera)
        scene_box = page.locator("#scene-pan").bounding_box()
        detail_box = page.locator("#heading-detail").bounding_box()
        command_box = page.locator("#motor-command-label").bounding_box()
        control_box = page.locator("#experiment-controls").bounding_box()
        detail_fits = scene_box and detail_box and detail_box["x"] >= scene_box["x"] and detail_box["y"] >= scene_box["y"] and detail_box["x"] + detail_box["width"] <= scene_box["x"] + scene_box["width"] and detail_box["y"] + detail_box["height"] <= scene_box["y"] + scene_box["height"]
        check(report, f"{prefix}: full dial, motor gauge, and command label stay inside the scene", detail_fits and command_box and command_box["y"] + command_box["height"] <= detail_box["y"] + detail_box["height"], {"scene": scene_box, "detail": detail_box, "command": command_box})
        check(report, f"{prefix}: bottom controls fit inside the 1440x900 initial viewport", control_box and control_box["y"] + control_box["height"] <= 900, control_box)
        check(report, f"{prefix}: no directional motor icon contradicts the yaw command", page.locator("#motor-left,#motor-right").count() == 0 and "คำสั่ง yaw จำลอง" in page.locator("#motor-command-label").text_content(), page.locator("#motor-command-label").text_content())


def check_heading_model(page, report, prefix):
    page.locator("#target-bearing").evaluate("(el) => { el.value = '135'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
    check(report, f"{prefix}: non-default target input is visible", page.locator("#target-bearing-value").inner_text().strip() == "135°")
    before_step = page.evaluate("window.SystemExplorer.snapshot()")
    page.locator("#step").click()
    snapshot = page.evaluate("window.SystemExplorer.snapshot()")
    expected = page.evaluate("s => window.HeadingModel.advance(s.model, s.target, s.gains, s.wind, s.dt)", before_step)
    model_matches = all(abs(float(snapshot["model"][key]) - float(expected[key])) < 1e-10 for key in ("heading", "rate", "integral", "p", "i", "d", "u"))
    check(report, f"{prefix}: step state agrees with read-only HeadingModel.advance", model_matches, {"actual": snapshot["model"], "expected": expected})
    check(report, f"{prefix}: target produces signed shortest error", page.locator("#heading-error").inner_text().strip() == "+135.0°")
    check(report, f"{prefix}: normalized command is explicitly not PWM", "PWM" in page.locator("#command-boundary").inner_text() and "normalized" in page.locator("#command-boundary").inner_text().lower())
    angle = page.locator("#yaw-arrow").evaluate("""el => { const m = el.getScreenCTM(); return ((Math.atan2(m.b,m.a)*180/Math.PI)%360+360)%360; }""")
    angle_delta = abs(((angle - snapshot["model"]["heading"] + 180) % 360) - 180)
    check(report, f"{prefix}: actual SVG CTM yaw angle follows model state", angle_delta < 0.05, {"ctm_degrees": angle, "model_heading": snapshot["model"]["heading"]})
    active_stage = page.evaluate("SystemExplorer.snapshot().highlightedStage")
    active_count = page.locator("[data-cause-stage].is-active").count()
    check(report, f"{prefix}: a manual step starts at one causal stage", active_stage == "target" and active_count == 1, {"stage": active_stage, "active_count": active_count})
    page.wait_for_function("SystemExplorer.snapshot().highlightedStage === 'error'", timeout=1500)
    page.screenshot(path=str(EVIDENCE / f"{prefix}-cause-error-step.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-cause-error-step.png"))
    for expected_stage in ("controller", "motor", "feedback"):
        page.wait_for_function("expected => SystemExplorer.snapshot().highlightedStage === expected", arg=expected_stage, timeout=1500)
        check(report, f"{prefix}: causal emphasis advances to {expected_stage}", page.locator("[data-cause-stage].is-active").count() == 1, expected_stage)
    page.screenshot(path=str(EVIDENCE / f"{prefix}-heading-after-step.png"), full_page=True)
    report["screenshots"].append(str(EVIDENCE / f"{prefix}-heading-after-step.png"))
    before_input = snapshot["model"]
    page.locator("#gain-p").evaluate("(el) => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
    after_input = page.evaluate("window.SystemExplorer.snapshot()")
    check(report, f"{prefix}: gain input changes without resetting numeric state", after_input["model"] == before_input, {"before": before_input, "after": after_input["model"]})
    return after_input


def run_red(outdir):
    report = {"mode": "baseline-red", "started_unix": time.time(), "checks": [], "source_sha256": {}, "events": {}, "screenshots": []}
    target = ROOT / "pages" / "heading-pid.html"
    report["source_sha256"][str(target.relative_to(ROOT))] = sha256(target)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            attach_events(page, "baseline-heading-lab-file", report["events"])
            page.goto(page_url(target), wait_until="load")
            check(report, "valid existing Heading Lab actually renders in Chromium", page.title().endswith("Heading Lab") and page.locator("#dial-a").count() == 1)
            check(report, "existing page has its interactive HeadingModel", page.evaluate("Boolean(window.HeadingModel && window.HeadingLab)") is True)
            page.screenshot(path=str(outdir / "baseline-heading-lab.png"), full_page=True)
            report["screenshots"].append(str(outdir / "baseline-heading-lab.png"))
            # Deliberately fail on the missing approved navigation behavior, not on a missing file or 404.
            found = page.locator("[data-explorer-level='whole']").count() == 1 and page.locator("#enter-navigation").count() == 1
            check(report, "RED: rendered existing page exposes whole-system drill-down navigation", found, {"title": page.title(), "whole_level": page.locator("[data-explorer-level='whole']").count(), "navigation_buttons": page.locator("#enter-navigation").count()})
            browser.close()
    except Exception as error:
        report["failure"] = {"type": type(error).__name__, "message": str(error)}
    report["ended_unix"] = time.time()
    report["exit_code"] = 1 if report.get("failure") else 0
    (outdir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "exit_code": report["exit_code"], "failure": report.get("failure"), "checks": report["checks"], "report": str(outdir / "report.json")}, ensure_ascii=False))
    return report["exit_code"]


def run_behavior_red(outdir):
    report = {"mode": "behavior-red", "started_unix": time.time(), "checks": [], "source_sha256": {}, "events": {}, "screenshots": []}
    def record(name, condition, details=None):
        report["checks"].append({"name": name, "passed": bool(condition), "details": details})
    html = ROOT / "pages" / "system-explorer.html"
    for source in (html, ROOT / "src" / "css" / "system-explorer.css", ROOT / "src" / "js" / "explorer" / "system-explorer.js"):
        report["source_sha256"][str(source.relative_to(ROOT))] = sha256(source)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            attach_events(page, "prototype-file-normal", report["events"])
            page.goto(page_url(html), wait_until="load")
            record("prototype shell is valid and renders", page.locator("#explorer").count() == 1 and page.title().endswith("System Explorer"))
            page.locator("#enter-navigation").click()
            page.locator("#enter-heading").click()
            record("navigation reaches visible heading function", page.locator("#explorer").get_attribute("data-level") == "heading" and page.locator("#experiment-details").is_visible())
            page.screenshot(path=str(outdir / "heading-static-red.png"), full_page=True)
            report["screenshots"].append(str(outdir / "heading-static-red.png"))

            page.locator("#target-bearing").evaluate("(el) => { el.value = '135'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
            target_value = page.locator("#target-bearing-value").inner_text().strip()
            record("RED: changing bearing updates the rendered model input", target_value == "135°", {"actual": target_value, "expected": "135°"})
            heading_before = page.locator("#actual-heading").inner_text().strip()
            page.locator("#step").click()
            heading_after = page.locator("#actual-heading").inner_text().strip()
            record("RED: one step advances the actual heading state", heading_after != heading_before, {"before": heading_before, "after": heading_after})
            play_before = page.locator("#play").inner_text().strip()
            page.locator("#play").click()
            time.sleep(0.12)
            play_after = page.locator("#play").inner_text().strip()
            record("RED: play enters a controllable playback lifecycle", play_after != play_before, {"before": play_before, "after": play_after})
            page.emulate_media(reduced_motion="reduce")
            duration = page.locator("#scene-camera").evaluate("el => getComputedStyle(el).transitionDuration")
            record("RED: live reduced-motion preference stops camera animation", all(float(value.replace("s", "")) == 0 for value in duration.split(",")), {"transition_duration": duration})
            browser.close()
    except Exception as error:
        report["failure"] = {"type": type(error).__name__, "message": str(error)}
    report["ended_unix"] = time.time()
    report["exit_code"] = 1 if report.get("failure") or any(not item["passed"] for item in report["checks"]) else 0
    (outdir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "exit_code": report["exit_code"], "failure": report.get("failure"), "checks_passed": sum(item["passed"] for item in report["checks"]), "checks_total": len(report["checks"]), "report": str(outdir / "report.json")}, ensure_ascii=False))
    return report["exit_code"]


def run_visual_red(outdir):
    report = {"mode": "visual-red", "started_unix": time.time(), "checks": [], "events": {}, "screenshots": []}
    def record(name, condition, details=None):
        report["checks"].append({"name": name, "passed": bool(condition), "details": details})
    html = ROOT / "pages" / "system-explorer.html"
    for source in (html, ROOT / "src" / "css" / "system-explorer.css", ROOT / "src" / "js" / "explorer" / "system-explorer.js"):
        report.setdefault("source_sha256", {})[source.relative_to(ROOT).as_posix()] = sha256(source)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            attach_events(page, "visual-red-file", report["events"])
            page.goto(page_url(html), wait_until="load")
            page.screenshot(path=str(outdir / "whole-visual-red.png"), full_page=True)
            report["screenshots"].append(str(outdir / "whole-visual-red.png"))
            whole = page.evaluate("""() => {
              const rect = el => { const b=el.getBoundingClientRect(); return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}; };
              const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
              const visualText=[...document.querySelectorAll('.map-label')];
              const subtitle=rect(visualText.find(el=>el.textContent.includes('แนวเก็บข้อมูล')));
              const grid=rect(document.querySelector('.survey-grid-label'));
              const hull=rect(document.querySelector('#boat-whole > path'));
              const overlaps=[...document.querySelectorAll('.survey-waypoint')].filter(el=>overlap(rect(el),hull)).map(el=>el.dataset.surveyWp);
              return {subtitle,grid,title_overlap:overlap(subtitle,grid),route_points:document.querySelectorAll('.survey-waypoint').length,points_over_boat:overlaps};
            }""")
            record("RED: survey title and water-area subtitle have non-overlapping reserved zones", not whole["title_overlap"], whole)
            record("RED: all nine survey markers are legible and clear of boat silhouette", whole["route_points"] == 9 and not whole["points_over_boat"], whole)
            page.locator("#enter-navigation").click()
            page.locator("#enter-heading").click()
            page.locator("#target-bearing").evaluate("el => {el.value='135';el.dispatchEvent(new Event('input',{bubbles:true}));}")
            page.locator("#step").click()
            page.screenshot(path=str(outdir / "heading-visual-red.png"), full_page=True)
            report["screenshots"].append(str(outdir / "heading-visual-red.png"))
            heading = page.evaluate("""() => {
              const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
              const pan=rect(document.querySelector('#scene-pan'));
              const card=rect(document.querySelector('#heading-detail rect'));
              const command=rect(document.querySelector('#motor-command-label'));
              const controls=rect(document.querySelector('#experiment-controls'));
              const left=Number(document.querySelector('#motor-left').getAttribute('opacity'));
              const right=Number(document.querySelector('#motor-right').getAttribute('opacity'));
              return {scene:pan,heading_card:card,motor_label:command,controls,viewport_height:innerHeight,full_height:document.documentElement.scrollHeight,left_motor_intensity:left,right_motor_intensity:right,cause_stages:document.querySelectorAll('[data-cause-stage]').length,active_cause_stages:document.querySelectorAll('[data-cause-stage].is-active').length};
            }""")
            record("RED: heading dial, gauge, and command label fit without scene clipping", heading["heading_card"]["y"] >= heading["scene"]["y"] and heading["heading_card"]["bottom"] <= heading["scene"]["bottom"] and heading["motor_label"]["bottom"] <= heading["scene"]["bottom"], heading)
            record("RED: bottom presenter controls fit within 1440x900 initial view", heading["controls"]["bottom"] <= heading["viewport_height"], heading)
            record("RED: heading focus suppresses unrelated boat/map text", page.locator("#boat-whole").evaluate("el => Number(getComputedStyle(el).opacity)") < 0.3, {"boat_opacity": page.locator("#boat-whole").evaluate("el => getComputedStyle(el).opacity")})
            record("RED: signed yaw command does not reverse the established motor-mix convention", heading["right_motor_intensity"] <= heading["left_motor_intensity"], {"left": heading["left_motor_intensity"], "right": heading["right_motor_intensity"]})
            record("RED: model response presents visibly staged causal highlights", heading["cause_stages"] == 5 and heading["active_cause_stages"] > 0, heading)
            report["measurements"] = {"whole": whole, "heading": heading}
            browser.close()
    except Exception as error:
        report["failure"] = {"type": type(error).__name__, "message": str(error)}
    report["ended_unix"] = time.time()
    report["exit_code"] = 1 if report.get("failure") or any(not item["passed"] for item in report["checks"]) else 0
    (outdir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "exit_code": report["exit_code"], "failure": report.get("failure"), "checks_passed": sum(item["passed"] for item in report["checks"]), "checks_total": len(report["checks"]), "report": str(outdir / "report.json")}, ensure_ascii=False))
    return report["exit_code"]


def run_suite(outdir):
    report = {"mode": "browser-suite", "started_unix": time.time(), "checks": [], "source_sha256": {}, "events": {}, "screenshots": [], "response_hashes": {}}
    html = ROOT / "pages" / "system-explorer.html"
    model = ROOT / "src" / "js" / "heading" / "heading-model.js"
    for source in (html, model, ROOT / "src" / "js" / "explorer" / "system-explorer-model.js", ROOT / "src" / "js" / "explorer" / "system-explorer.js", ROOT / "src" / "css" / "system-explorer.css"):
        if source.exists():
            report["source_sha256"][source.relative_to(ROOT).as_posix()] = sha256(source)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    http_base = f"http://127.0.0.1:{server.server_address[1]}/"
    report["http_base"] = http_base
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            # File:// desktop, normal motion: full interaction and model trace.
            page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            attach_events(page, "desktop-file-normal", report["events"])
            file_response = page.goto(page_url(html), wait_until="load")
            file_html_sha = hashlib.sha256(file_response.body()).hexdigest()
            report["response_hashes"]["file://pages/system-explorer.html"] = file_html_sha
            check(report, "file:// page has correct prototype identity", "System Explorer" in page.title() and page.locator("#explorer").count() == 1)
            check(report, "file:// HTML response body matches local source hash", file_html_sha == report["source_sha256"].get("pages/system-explorer.html"))
            route_coordinates = page.locator(".survey-waypoint").evaluate_all("els => els.map(el => { const m = el.transform.baseVal.consolidate().matrix; return [el.dataset.surveyWp, Number(el.dataset.sourceX), Number(el.dataset.sourceY), Math.round(m.e * 10) / 10, Math.round(m.f * 10) / 10]; })")
            source_route = [(440, 170), (440, 280), (440, 390), (665, 390), (665, 280), (665, 170), (890, 170), (890, 280), (890, 390)]
            expected_route_coordinates = [[str(index + 1), x, y, round(x * .38 - 17.2, 1), round(y * .38 + 235.4, 1)] for index, (x, y) in enumerate(source_route)]
            check(report, "whole scene renders the confirmed 3x3 route in source order and fitted map geometry", route_coordinates == expected_route_coordinates and page.locator("#survey-home-marker").count() == 1, route_coordinates)
            check_whole_scene(report, page, "desktop-file")
            navigate_to_heading(page, report, "desktop-file")
            after_input = check_heading_model(page, report, "desktop-file")
            # Play/pause uses real model steps and stops advancing after pause.
            page.locator("#play").click()
            page.wait_for_function("window.SystemExplorer.snapshot().ticks >= 3", timeout=5000)
            page.locator("#play").click()
            paused = page.evaluate("window.SystemExplorer.snapshot()")
            time.sleep(0.18)
            settled = page.evaluate("window.SystemExplorer.snapshot()")
            check(report, "play-pause halts the simulation loop", not paused["playing"] and paused["ticks"] == settled["ticks"])
            # Leaving heading cancels playback; level changes preserve the numeric model state.
            page.locator("#play").click()
            page.wait_for_function("window.SystemExplorer.snapshot().ticks > 4", timeout=5000)
            page.locator("#to-whole").click()
            left = page.evaluate("window.SystemExplorer.snapshot()")
            time.sleep(0.18)
            left_settled = page.evaluate("window.SystemExplorer.snapshot()")
            check(report, "leaving heading pauses and cancels hidden playback", not left["playing"] and not left["activeLoop"] and left["ticks"] == left_settled["ticks"])
            check(report, "navigation level change preserves model state", left["model"] == left_settled["model"] and left["target"] == after_input["target"])
            page.locator("#enter-navigation").focus()
            page.keyboard.press("Enter")
            check(report, "navigation controls are keyboard operable", page.locator("#explorer").get_attribute("data-level") == "navigation")
            page.locator("#enter-heading").focus()
            page.keyboard.press("Enter")
            page.locator("#reset").click()
            reset = page.evaluate("window.SystemExplorer.snapshot()")
            check(report, "explicit reset clears dynamics but preserves selected target", reset["ticks"] == 0 and reset["model"]["heading"] == 0 and reset["target"] == 135)
            check(report, "reset preserves target input value", page.locator("#target-bearing-value").inner_text().strip() == "135°")
            page.locator("#target-bearing").focus()
            page.keyboard.press("ArrowRight")
            keyboard_target = page.locator("#target-bearing").input_value()
            check(report, "range inputs are keyboard operable", keyboard_target == "136" and page.locator("#target-bearing-value").inner_text().strip() == "136°", keyboard_target)
            page.keyboard.press("ArrowLeft")
            check(report, "keyboard can restore the selected bearing", page.locator("#target-bearing").input_value() == "135")
            page.screenshot(path=str(EVIDENCE / "desktop-file-reset.png"), full_page=True)
            report["screenshots"].append(str(EVIDENCE / "desktop-file-reset.png"))
            check(report, "1440x900 desktop canvas has no horizontal body overflow", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            check(report, "primary presentation label is at least 24 CSS px", float(page.locator("#main-caption").evaluate("el => getComputedStyle(el).fontSize.replace('px','')")) >= 24)
            # Live reduced-motion preference change must turn off camera interpolation without disabling stepping.
            page.emulate_media(reduced_motion="reduce")
            check(report, "live reduced-motion preference is observed", page.evaluate("window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.SystemExplorer.snapshot().reduced"))
            transition = page.locator("#scene-camera").evaluate("el => getComputedStyle(el).transitionDuration")
            check(report, "reduced motion disables camera transitions", all(float(value.replace('s','')) == 0 for value in transition.split(',')), transition)
            page.locator("#step").click()
            reduced_tick = page.evaluate("window.SystemExplorer.snapshot().ticks")
            check(report, "reduced motion retains usable step control", reduced_tick == 1)
            page.screenshot(path=str(EVIDENCE / "desktop-file-reduced-motion.png"), full_page=True)
            report["screenshots"].append(str(EVIDENCE / "desktop-file-reduced-motion.png"))

            # Mobile must keep the page within the viewport width and provide a keyboard-pan region.
            mobile = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="no-preference")
            attach_events(mobile, "mobile-file-normal", report["events"])
            mobile.goto(page_url(html), wait_until="load")
            check(report, "390x844 mobile retains all nine mirrored destinations", mobile.locator(".primary-nav .nav-link").count() == 9)
            check(report, "mobile page has no body-level horizontal overflow", mobile.evaluate("document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth"))
            check(report, "mobile SVG pan region is labelled and keyboard focusable", mobile.locator("#scene-pan[role='region'][tabindex='0'][aria-label]").count() == 1)
            navigate_to_heading(mobile, report, "mobile-file")
            buttons = mobile.locator("#experiment-controls button:visible").evaluate_all("els => els.map(el => ({id:el.id,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}))")
            check(report, "mobile experiment buttons meet 44px target size", bool(buttons) and all(button["height"] >= 44 and button["width"] >= 44 for button in buttons), buttons)
            check(report, "mobile presentation label remains readable", float(mobile.locator("#main-caption").evaluate("el => getComputedStyle(el).fontSize.replace('px','')")) >= 20)
            mobile.screenshot(path=str(EVIDENCE / "mobile-file-heading.png"), full_page=True)
            report["screenshots"].append(str(EVIDENCE / "mobile-file-heading.png"))

            # Ephemeral HTTP: repeat the actual navigation/input/model path and collect response/source hashes.
            http_page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            attach_events(http_page, "desktop-http-normal", report["events"])
            response = http_page.goto(urljoin(http_base, "pages/system-explorer.html"), wait_until="load")
            http_html_sha = hashlib.sha256(response.body()).hexdigest() if response is not None else None
            report["response_hashes"]["http://ephemeral/pages/system-explorer.html"] = http_html_sha
            check(report, "ephemeral HTTP returns the new page", response is not None and response.status == 200)
            check(report, "HTTP, file response bodies and local source hash match", http_html_sha == file_html_sha == report["source_sha256"].get("pages/system-explorer.html"), {"file_response_sha256": file_html_sha, "http_response_sha256": http_html_sha, "source_sha256": report["source_sha256"].get("pages/system-explorer.html")})
            navigate_to_heading(http_page, report, "desktop-http")
            check_heading_model(http_page, report, "desktop-http")
            http_page.locator("#to-whole").click()
            check(report, "HTTP return path reaches whole-system view", http_page.locator("#explorer").get_attribute("data-level") == "whole")
            http_page.screenshot(path=str(EVIDENCE / "desktop-http-return.png"), full_page=True)
            report["screenshots"].append(str(EVIDENCE / "desktop-http-return.png"))

            # Hook integrity: retain all real console/page/request events, then fail on any runtime faults.
            for label, captured in report["events"].items():
                check(report, f"{label}: no uncaught page errors", not captured["page_errors"], captured["page_errors"])
                check(report, f"{label}: no failed requests", not captured["request_failures"], captured["request_failures"])
            browser.close()
    except Exception as error:
        report["failure"] = {"type": type(error).__name__, "message": str(error)}
    finally:
        server.shutdown()
        server.server_close()
    report["ended_unix"] = time.time()
    report["exit_code"] = 1 if report.get("failure") or any(not item["passed"] for item in report["checks"]) else 0
    (outdir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "exit_code": report["exit_code"], "failure": report.get("failure"), "checks_passed": sum(item["passed"] for item in report["checks"]), "checks_total": len(report["checks"]), "report": str(outdir / "report.json")}, ensure_ascii=False))
    return report["exit_code"]


def main():
    global EVIDENCE
    parser = argparse.ArgumentParser()
    parser.add_argument("--red", action="store_true", help="prove the current rendered site lacks the accepted drill-down behavior")
    parser.add_argument("--red-behavior", action="store_true", help="run lifecycle, reduced-motion, and input behavior tests against the pre-simulation prototype")
    parser.add_argument("--red-visual", action="store_true", help="capture actual whole/heading visual defects before focused layout fixes")
    parser.add_argument("--out", type=Path, default=EVIDENCE / "browser")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    EVIDENCE = args.out
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if args.red:
        return run_red(args.out)
    if args.red_behavior:
        return run_behavior_red(args.out)
    if args.red_visual:
        return run_visual_red(args.out)
    return run_suite(args.out)


if __name__ == "__main__":
    raise SystemExit(main())
