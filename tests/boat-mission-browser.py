#!/usr/bin/env python3
"""Source-bound Chromium checks for the boat mission simulation."""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = Path(__file__).resolve().parents[2] / "evidence" / "boat-simulation" / "builder"
PAGE = ROOT / "pages" / "system-explorer.html"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    global EVIDENCE
    parser = argparse.ArgumentParser()
    parser.add_argument("--red", action="store_true")
    parser.add_argument("--run-dir", choices=["final"], default="")
    args = parser.parse_args()
    if args.run_dir:
        EVIDENCE = EVIDENCE / args.run_dir
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    report = {"mode": "behavior-red" if args.red else "browser-suite", "started_unix": time.time(), "checks": [], "source_sha256": {}, "screenshots": [], "events": {}}
    def check(name, ok, details=None):
        report["checks"].append({"name": name, "passed": bool(ok), "details": details})
        if not ok and not args.red:
            raise AssertionError(f"{name}: {details!r}")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            events = {"page_errors": [], "console_errors": [], "request_failures": []}
            page.on("pageerror", lambda error: events["page_errors"].append(str(error)))
            page.on("console", lambda msg: events["console_errors"].append(msg.text) if msg.type == "error" else None)
            page.on("requestfailed", lambda req: events["request_failures"].append({"url": req.url, "failure": req.failure}))
            report["events"]["desktop"] = events
            for relative in ("pages/system-explorer.html", "src/js/explorer/boat-mission-model.js", "src/js/explorer/boat-mission-ui.js", "src/css/boat-mission.css"):
                report["source_sha256"][relative] = sha(ROOT / relative)
            response = page.goto(PAGE.as_uri(), wait_until="load")
            check("local existing page renders", response is not None and response.status == 200 and page.locator("#explorer").count() == 1, {"status": response.status if response else None, "title": page.title()})
            if args.red:
                page.screenshot(path=str(EVIDENCE / "behavior-red-before.png"), full_page=True)
                report["screenshots"].append(str(EVIDENCE / "behavior-red-before.png"))
                check("RED: loaded existing page exposes real mission START control", page.locator("#sim-start").count() == 1, {"count": page.locator("#sim-start").count()})
                check("RED: loaded existing page exposes one shared live boat mission snapshot", page.evaluate("Boolean(window.BoatSimulation && window.BoatSimulation.snapshot)") is True)
            else:
                check("file:// response matches saved page source hash", hashlib.sha256(response.body()).hexdigest()==report["source_sha256"]["pages/system-explorer.html"])
                check("one serializable shared production snapshot is exposed", page.evaluate("Boolean(window.BoatSimulation && window.BoatSimulation.snapshot && JSON.stringify(window.BoatSimulation.snapshot()))"))
                initial=page.evaluate("window.BoatSimulation.snapshot()")
                check("default presentation starts paused with explicit ready synthetic inputs", initial["mode"]=="STANDBY" and initial["readiness"]["start"] and not initial["playing"], initial)
                page.screenshot(path=str(EVIDENCE/"desktop-whole.png"),full_page=True); report["screenshots"].append(str(EVIDENCE/"desktop-whole.png"))
                page.locator("#sim-inspect").click()
                # A selected function is a lens over the exact same state and never resets the map.
                for focus_name in ("readiness","gps","compass","navigation","steering","whole"):
                    page.locator(f"#mission-focus [data-focus='{focus_name}']").click()
                    current=page.evaluate("window.BoatSimulation.snapshot()")
                    check(f"focus {focus_name} preserves the same pose and simulation clock",current["position"]==initial["position"] and current["clockMs"]==initial["clockMs"],current)
                    page.screenshot(path=str(EVIDENCE/f"desktop-{focus_name}.png"),full_page=True)
                    report["screenshots"].append(str(EVIDENCE/f"desktop-{focus_name}.png"))
                page.locator("#mission-focus [data-focus='readiness']").click()
                page.locator("#sim-ready").click()
                page.locator("#sim-home-set").uncheck()
                page.locator("#sim-route-sealed").uncheck()
                # Deterministic command/step contract; native one-click autoplay is
                # separately exercised by boat-presentation-browser.py.
                page.evaluate("window.BoatSimulation.dispatch({type:'start'})")
                page.locator("#sim-step").click()
                waiting=page.evaluate("window.BoatSimulation.snapshot()")
                check("START remains pending when the sealed route gate is missing",waiting["mode"]=="STANDBY" and waiting["pendingStart"] and waiting["home"] is None,waiting)
                page.locator("#sim-route-sealed").check()
                page.locator("#sim-step").click()
                accepted=page.evaluate("window.BoatSimulation.snapshot()")
                check("START recovers without HOME and acceptance does not drive in the same tick",accepted["mode"]=="GRID" and not accepted["pendingStart"] and accepted["position"]==waiting["position"] and accepted["home"] is None,accepted)
                page.locator("#sim-step").click()
                moved=page.evaluate("window.BoatSimulation.snapshot()")
                check("native fixed step changes heading and position through one coupled plant",moved["position"]!=accepted["position"] and moved["heading"]!=accepted["heading"] and moved["speedMps"]>0,moved)
                ctm=page.evaluate("""() => {
                  const s=window.BoatSimulation.snapshot(), svg=document.querySelector('.scene-svg'), layer=document.querySelector('#mission-dynamics');
                  const boat=document.querySelector('#sim-boat'), target=document.querySelector('#sim-target');
                  const map=p=>({x:p.x,y:p.y}); const b=map(s.position),t=map(s.target);
                  const point=(p)=>{const q=svg.createSVGPoint();q.x=p.x;q.y=p.y;return q.matrixTransform(layer.getScreenCTM());};
                  const expectedBoat=point(b), expectedTarget=point(t), bm=boat.getScreenCTM();
                  const angle=((Math.atan2(bm.b,bm.a)*180/Math.PI)%360+360)%360;
                  return {boatError:Math.hypot(expectedBoat.x-bm.e,expectedBoat.y-bm.f),targetError:Math.hypot(expectedTarget.x-point({x:Number(target.getAttribute('cx')),y:Number(target.getAttribute('cy'))}).x,expectedTarget.y-point({x:Number(target.getAttribute('cx')),y:Number(target.getAttribute('cy'))}).y),angle,heading:s.heading,trail:document.querySelector('#sim-trail').getAttribute('d')};
                }""")
                check("actual boat/target screen CTMs and trail endpoint agree with exported model pose",ctm["boatError"]<1 and ctm["targetError"]<1 and abs(((ctm["angle"]-ctm["heading"]+180)%360)-180)<.1 and ctm["trail"].endswith(f"{moved['position']['x']:.2f} {moved['position']['y']:.2f}"),ctm)
                page.screenshot(path=str(EVIDENCE/"desktop-grid-motion.png"),full_page=True); report["screenshots"].append(str(EVIDENCE/"desktop-grid-motion.png"))
                # Playback, pause, speed, and reset are all actions on this same production state.
                page.locator("#sim-speed").select_option("12")
                page.locator("#sim-play").click()
                start_clock=page.evaluate("window.BoatSimulation.snapshot().clockMs")
                page.wait_for_function("n=>window.BoatSimulation.snapshot().clockMs>=n+750",arg=start_clock,timeout=5000)
                page.locator("#sim-play").click()
                paused=page.evaluate("window.BoatSimulation.snapshot()")
                page.wait_for_timeout(150)
                settled=page.evaluate("window.BoatSimulation.snapshot()")
                check("play/pause stops the only simulation loop",not paused["playing"] and paused["clockMs"]==settled["clockMs"],{"paused":paused,"settled":settled})
                page.locator("#sim-reset").click()
                reset=page.evaluate("window.BoatSimulation.snapshot()")
                page.wait_for_timeout(120)
                check("reset clears mission and cancels stale playback callback",reset["mode"]=="STANDBY" and reset["clockMs"]==0 and reset["activeLoop"]==0 and page.evaluate("window.BoatSimulation.snapshot().clockMs") == 0,reset)
                page.emulate_media(reduced_motion="reduce")
                page.locator("#sim-ready").click(); page.evaluate("window.BoatSimulation.dispatch({type:'start'})"); page.locator("#sim-step").click(); page.locator("#sim-step").click()
                reduced=page.evaluate("window.BoatSimulation.snapshot()")
                check("reduced motion keeps deterministic mission stepping usable",reduced["mode"]=="GRID" and reduced["clockMs"]==500)
                check("1440x900 desktop has no body-level horizontal overflow",page.evaluate("document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth"))
                transport=page.locator("#mission-transport").bounding_box()
                check("desktop primary controls fit in the initial viewport",transport is not None and transport["y"]+transport["height"]<=900,transport)
                mobile=browser.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,reduced_motion="reduce")
                mobile_events={"page_errors":[],"console_errors":[],"request_failures":[]}
                mobile.on("pageerror",lambda error:mobile_events["page_errors"].append(str(error)))
                mobile.on("console",lambda msg:mobile_events["console_errors"].append(msg.text) if msg.type=="error" else None)
                mobile.on("requestfailed",lambda req:mobile_events["request_failures"].append({"url":req.url,"failure":req.failure}))
                report["events"]["mobile"]=mobile_events
                mobile.goto(PAGE.as_uri(),wait_until="load")
                check("390x844 mobile has no global horizontal overflow",mobile.evaluate("document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth"))
                check("mobile map remains a labelled keyboard-focusable pan region",mobile.locator("#scene-pan[role='region'][tabindex='0'][aria-label]").count()==1)
                mobile.locator("#sim-inspect").click()
                for focus_name in ("readiness","gps","compass","navigation","steering"):
                    mobile.locator(f"#mission-focus [data-focus='{focus_name}']").click()
                    mobile.screenshot(path=str(EVIDENCE/f"mobile-{focus_name}.png"),full_page=True)
                    report["screenshots"].append(str(EVIDENCE/f"mobile-{focus_name}.png"))
                buttons=mobile.locator("#mission-transport button:visible").evaluate_all("els=>els.map(e=>({id:e.id,h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))")
                check("mobile mission controls retain touch-size targets",bool(buttons) and all(b["h"]>=42 and b["w"]>=44 for b in buttons),buttons)
                mobile.locator("#mission-focus [data-focus='readiness']").click()
                mobile.locator("#sim-ready").click();mobile.locator("#sim-close-inspector").click();mobile.evaluate("window.BoatSimulation.dispatch({type:'start'})");mobile.locator("#sim-step").click();mobile.locator("#sim-step").click()
                check("mobile reduced-motion mode preserves real simulation step",mobile.evaluate("window.BoatSimulation.snapshot().mode==='GRID' && window.BoatSimulation.snapshot().speedMps>0"))
                for label,captured in report["events"].items():
                    check(f"{label} Chromium page has no uncaught errors/console errors/request failures",not captured["page_errors"] and not captured["console_errors"] and not captured["request_failures"],captured)
            browser.close()
    except Exception as error:
        report["failure"] = {"type": type(error).__name__, "message": str(error)}
    report["ended_unix"] = time.time()
    report["exit_code"] = 1 if report.get("failure") or any(not x["passed"] for x in report["checks"]) else 0
    report_path = EVIDENCE / f"{report['mode']}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "exit_code": report["exit_code"], "checks_passed": sum(c["passed"] for c in report["checks"]), "checks_total": len(report["checks"]), "failure": report.get("failure"), "report": str(report_path)}, ensure_ascii=False))
    return report["exit_code"]

if __name__ == "__main__":
    raise SystemExit(main())