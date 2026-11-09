# Overall live mission equations and limits

## Current activation (2026-10-20 continuation)

Authoritative active implementation: `overall/mission-kernel.js` + `mission-transport.js` + `autonomous-mission.js`, via compatibility export `autonomous-mission-model.js`, and codec-only `mission/uplink-motion.js`. See `AUTONOMOUS_MISSION.md` for current controls/policies/omissions. Fixed50ms nav, ADS250ms, TX1000ms. GRID u=clamp(.02e+.0002 integral−.0008 measuredRate,−1,1); SPIRAL/RTH use wrapped-error derivative instead. Signed normalized left/right actually drive yaw=(L−R)*45deg/s and surge=(L+R)/2*2.3m/s; near-target slowdown/pivot are browser choices. No independent path interpolation. Quiet pH/cache/every-second-WP holds and RTH dwell are implemented in the same state. Provenance uses current accepted TRACE_MAP hashes; older fingerprints below identify a historical reference, not current authority.

## Historical unmounted system-model implementation (not current Overall behavior)

Everything below describes the earlier unmounted system/* example and historical equations, not the current active page. Its250ms tick, interpolation, sliders/equation cards/API and source fingerprints must not be used as current activation or acceptance evidence.

`pages/overall.html#system` displays one browser demo state. The mission model is `src/js/system/system-model.js` (CommonJS `require` and browser global `SystemMissionModel`); its namespaced renderer and bounded `window.SystemMission` control API are in `src/js/system/system.js`. Equations below distinguish the web demo from read-only firmware references. No equation or visual certifies firmware behavior, a vehicle, a radio link, sensor calibration, or field safety.

## Sensor voltage and rolling SMA

The active conversion uses the constants shown in the bounded firmware evidence for `WaterSensors::readTurbidityNtu` (`src/sensors/WaterSensors.cpp`): clear voltage 1.93 V, dirty voltage 1.20 V, dirty endpoint 80 NTU, scale 1 and offset 0. For valid demo voltage `V`:

```text
V >= 1.93 V: NTU = 0
otherwise:   NTU = max(0, 80 * (1.93 - V) / (1.93 - 1.20))
```

The page slider uses 0.50–2.40 V. A reading below the firmware fault limit 0.50 V is displayed as invalid and is not inserted into the demo buffer. `turbidityFromVoltage()` implements the conversion; `step()` appends only valid sample values to the last-eight buffer; `analyzeSma()` reports `n`, sum and mean using the samples that exist. There is no fabricated full window before eight valid samples arrive.

```text
SMA_n = (x_1 + ... + x_n) / n, n <= 8
demo absolute candidate = n == 8 AND SMA_8 > 50 NTU
```

The optional spiral additionally requires reaching WP1 (the displayed waypoint index is at least 1) and not having used the one spiral allowed by this demo mission. The demo skips its optional spiral for clean water. This is only the absolute branch: current `WaterAnomalyMonitor::updateTurbidity` also has baseline dwell, ROC candidate, hysteresis and cooldown behavior that this demo does not fully port. A mean at or below 50 suppresses this demo's absolute branch; it is not a claim that every firmware anomaly path is suppressed.

## Map, coordinates and navigation

The schematic points match the existing Overall mission-start map in `pages/overall.html` (`#ms-map`): HOME `(335,455)` and WP1–WP9 `(440,170)`, `(440,280)`, `(440,390)`, `(665,390)`, `(665,280)`, `(665,170)`, `(890,170)`, `(890,280)`, `(890,390)`. `system-model.js` reproduces those existing coordinates without changing the earlier storyboard.

For this map only, 1 SVG unit is explicitly 0.15 m. The demo origin `(18°, 99°)` is synthetic. `toLatLon()` applies 111,320 m per latitude degree and the local cosine correction for longitude, then `navigation()` calculates clamped Haversine distance with `R = 6,371,000 m` and initial bearing via `atan2(y,x)`. These are synthetic coordinates, not boat GPS. The formulas correspond to read-only `Navigator::calculateDistance` and `Navigator::calculateBearing` in `src/navigation/Navigator.cpp`.

## Spiral target

The active target uses the current read-only firmware constants in `include/config.h` and `SpiralPlanner::nextSpiralPoint` (`src/navigation/SpiralPlanner.cpp`):

```text
b = (8 m - 4 m) / (6 pi)
r = min(8 m, 4 m + b * theta)
theta = 0 ... 6 pi, step = pi / 4  => 25 targets
east = r cos(theta); north = r sin(theta)
```

The SVG screen reverses the north axis (`y = center.y - north / scale`). The equation card shows the current index, radius, angle and east/north offset for its active target. The position animation between successive targets is a schematic interpolation; the yaw plant is calculated separately and does not control that path. Existing `OverallModel.generateSpiralTargets()` remains untouched and represents a separate historical schematic with different constants.

## Heading and steering

`navigation()` supplies a synthetic target bearing. Error is `wrap180(targetBearing - heading)`. GRID uses `gridSteering()`:

```text
e = wrap180(psi_target - psi)
u_raw = Kp * e + Ki * integral(e dt) - kRate * measuredHeadingRate
u = clamp(u_raw, -60, +60)
```

The `kRate` term damps measured heading rate; it is not a derivative of the target or error. SPIRAL and RTH use `pidSteering()` with derivative on wrapped heading error and a 0.30 low-pass factor. Both the unclamped result and capped output are shown. The output and forward mix (`left = clamp(40+u,0,100)`, `right = clamp(40-u,0,100)`) use normalized demo units, not PWM. Positive error/command is clockwise from north. Adjustable gains affect the displayed steering and the next yaw update. `psi_in` is the actual pre-plant heading used for the last control calculation; the boat and heading readout show the post-plant heading. These two values are intentionally not substituted interchangeably. The yaw plant is a small illustrative model; no vehicle path or firmware accuracy is claimed. Firmware references are the GRID correction block in `GridCaptureController.cpp` (`src/control/GridCaptureController.cpp`), `HeadingController::calculateThrusterOutputs` in `src/control/HeadingController.cpp`, and the constants in `include/config.h`; actual anti-windup rollback, first-derivative initialization, turn branches, drive gating, deadband and PWM are not ported. The older separate PID A/B lab retains its original 0.25 derivative filter and its own plant; it is not silently retuned by this scene.

## RTH gate

The same demo pose and clock provide HOME distance. With synthetic HOME/GPS readiness, departure requires distance at least 12 m continuously for 2 s. The RTH entry distance must exceed 4 m. Arrival requires distance at most 4 m continuously for 3 s; leaving the boundary or losing HOME/GPS resets the arrival dwell. The demo stops its interpolated movement inside 4 m but remains in RTH until the dwell completes. These reference values/functions are `MissionFsm::latchDeparted` and `MissionFsm::isArrivedHome` in `src/core/MissionFsm.cpp`, and `Tasks.cpp` uses them in `src/core/Tasks.cpp`. The browser state machine is a bounded teaching example.

## Telemetry and receiver lineage

The existing encoder and decoder bodies in `src/js/mission/uplink-motion.js` are unchanged; the file only adds `window.UplinkCodec` as an export of those existing functions. They use the existing 38-byte little-endian packet layout: sequence `uint32` at byte 0, GPS latitude/longitude `float64` at 4/12, water pH/turbidity/temperature `float32` at 20/24/28, mode and battery `uint8` at 32/33, heading `float32` at 34.

For every mission source snapshot, `withSource()` derives packet fields from the current mission state. `publish()` encodes that snapshot once and queues frozen byte values and hex; it does not replace the active TX display. `pump()` records TX only when promoting that queued run to active. `attempt()` posts a copy of those same bytes using a transferable `ArrayBuffer` over a real in-page `MessageChannel`; its callback passes only `event.data` to `decodeTelemetry()`. `recordReceiver()` derives shore values only from the decoded packet. The display keeps latest source, active/last TX, last callback, decode and shore-render IDs separate. A first-attempt drop retries the same source bytes; three drops hold the last good shore value and mark it stale. Link OFF keeps mission steps and browser-memory logging active while transport attempts fail. Reset closes ports/timers and retires callbacks from the prior generation.

This browser MessageChannel is local, not ESP-NOW or a firmware receiver/ACK. Browser-memory logs are illustrative only; they do not represent an SD write or offline replay. pH, temperature, battery percentage and GPS are explicitly synthetic. pH calibration is unknown; no pH-voltage formula is presented as active. At STANDBY, water pH, turbidity and temperature are encoded as `NaN`/unavailable rather than reusing the previous measurement.

## Presentation clock and traceability

One model step is a fixed 0.25 s (`SystemMissionModel.TICK_MS`). Playback speed changes browser scheduling, not the numeric integrator step, sample sequence or dwell result. GRID, SPIRAL and RTH generate current sample/pose/heading snapshots; finishing a spiral resumes the interrupted pending GRID target. The optional scene does not implement firmware spiral clean-abort/timeouts. During backlog, LATEST SOURCE may be newer than ACTIVE TX; the TX identity/hex remains the actual active immutable run until the next queued run is promoted. LAST RX/decode/render identifies the last received snapshot independently, which can be older than the now-active TX. These three records are not joined into a misleading single newest-source arrow. When the queue drains, the TX display is labelled LAST rather than ACTIVE.

The receiver records callback and decode evidence first. A render counter is recorded only after the actual shore DOM write returns and the displayed value matches the decoded value. The equation selector is presentation-only: automatic view follows the mission, while a selected group or all eight groups can be inspected without changing simulation state. Phone map panning also changes only the viewport, not navigation.

The navigation equations use radians internally: `a=sin²(Δφ/2)+cosφ1*cosφ2*sin²(Δλ/2)`, `d=2R*atan2(sqrt(a),sqrt(1-a))`. For bearing, `y=sin(Δλ)*cosφ2` and `x=cosφ1*sinφ2-sinφ1*cosφ2*cosΔλ`; convert `atan2(y,x)` to degrees and normalize into [0,360).


## Read-only source fingerprints

These SHA-256 fingerprints identify the local read-only formula reference snapshot, not a clean firmware commit or physical acceptance. Hardware calibration stored on the device remains unknown.

- `include/Packets.h`: `d0c2b0c787d53bee1d6c359f0b2080dfe1a18f4e72ae12258f8574d8a658b08a`
- `include/config.h`: `d9dc7903ce15d0cd101e10cf22c640df96ca2c0dcf352a6f603f5e6ba0a32c8d`
- `src/control/GridCaptureController.cpp`: `25d46d79e0ff1f9ebf258e2aa4ed7437cb8eee3f5cbc1335bbe16f3f67693d4d`
- `src/control/HeadingController.cpp`: `69d202548159dd507cba4a82efe9bafa23c629a05a0900d95c34fa3e91e84d23`
- `src/control/PidController.cpp`: `8098e81cd59ac2e9647985465dd6a0bd76733778adb545ef13979aa645ce4a1b`
- `src/core/MissionFsm.cpp`: `eb2aff28c0e6f5456e8dc3472253964ddb245f580679c49398901b1b7973e632`
- `src/core/MissionFsm.h`: `17fba8b082439098a997f86cb860dba3c19949cd4e003b5a5433d5ce39c239ed`
- `src/core/Tasks.cpp`: `2e371d120b0f050e5b0f9832c44d32ae9d5af17cc25501585b9fb7a2db57a1e0`
- `src/detection/WaterAnomalyMonitor.cpp`: `d28eda2292a5f568bec6a7ee915310ffa4f3ffc58e4359b3c0077edff90c9385`
- `src/detection/WaterAnomalyMonitor.h`: `937999cf9d8e1b96e5bdc0d4aac673ff3b333e3b5e3b437f10f5e1ac6d13540a`
- `src/navigation/Navigator.cpp`: `020c56e73be4665b655c4c475be364b5890cc07118e3e3bc589d5c2bedcb92e6`
- `src/navigation/SpiralPlanner.cpp`: `918638ec26cae675782212f390b3ec952762791c95dfe5177ec67767be536587`
- `src/sensors/WaterSensors.cpp`: `aa44cd03c290367b9aaff1fee1db0ce2e50abae98f494632e8b3d99741bd4d9b`
