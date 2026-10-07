window.presentationSlides = [
  {
    "type": "cover",
    "eyebrow": "Computer Engineering · Senior Project",
    "title": "Development of a Smart Water Surface Boat for Water Quality Monitoring",
    "subtitle": "Autonomous, location-aware surface water monitoring",
    "authors": ["Patcharapon Teerasamee", "Pisit Nilthongkam"],
    "meta": "Bachelor of Engineering in Computer Engineering · Mae Fah Luang University · 2026",
    "image": "assets/boat-structure.png",
    "alt": "Boat structure drawing with top-down and side profile views"
  },
  {
    "type": "story",
    "eyebrow": "01 / Monitoring need",
    "title": "A single sampling point cannot describe the whole water area",
    "lead": "Temperature, pH and turbidity can differ from one location to another. A fixed station follows its installation point; manual sampling takes time and leaves gaps between visits.",
    "sideTitle": "The monitoring question",
    "sideText": "Where are readings changing, and is a change limited to one location or spread across the site?",
    "sideItemsLabel": "Parameters measured by the project",
    "sideItems": ["Temperature", "pH", "Turbidity"],
    "footer": "Project rationale · BETA TEST.docx, Chapter 1"
  },
  {
    "type": "story",
    "eyebrow": "02 / Objectives and scope",
    "title": "The project combines sensing, movement and remote review",
    "lead": "The goal is a mobile platform that collects surface-water measurements at GPS-tagged locations, follows a planned route, stores mission data and presents information through a web dashboard.",
    "sideTitle": "Included in the project",
    "sideText": "The system targets surface water in ponds, lakes and reservoirs under moderate operating conditions.",
    "sideItemsStyle": "list",
    "sideItemsLabel": "Core functions described in the report",
    "sideItems": [
      "Measure temperature, pH and turbidity.",
      "Navigate by GPS waypoints and compass heading; support PID steering and return-to-home.",
      "Log mission data to MicroSD and exchange commands and telemetry through ESP-NOW.",
      "Flag configured threshold crossings and collect nearby readings with spiral mapping.",
      "Estimate turbidity between sampled locations with IDW for a heat map."
    ],
    "footer": "Project objectives and scope · BETA TEST.docx, Sections 1.2–1.3"
  },
  {
    "type": "story",
    "eyebrow": "03 / Existing approaches",
    "title": "Mobile sampling adds spatial coverage to point monitoring",
    "lead": "The report describes fixed stations as continuous but limited to their installed locations. Manual sampling can target selected places, but requires visits and does not provide continuous readings between them.",
    "sideTitle": "Project response",
    "sideText": "The boat follows user-defined waypoints and associates sensor readings with location and mission context.",
    "sideItemsStyle": "list",
    "sideItemsLabel": "What mobility changes",
    "sideItems": [
      "A route samples several locations during one mission.",
      "GPS position lets users review readings along the route.",
      "Coverage depends on route design, navigation quality, sensor calibration, communication range and battery capacity."
    ],
    "footer": "Comparison summarized from BETA TEST.docx, Chapters 1–3"
  },
  {
    "type": "flow",
    "eyebrow": "04 / System architecture",
    "title": "Four subsystems carry each mission from water to dashboard",
    "steps": [
      {"label": "01 / SENSE", "title": "Boat sensors", "text": "DS18B20, pH and turbidity sensors collect water readings. GPS and the compass provide position and heading context."},
      {"label": "02 / CONTROL", "title": "ESP32-S3", "text": "The controller reads sensors, runs navigation and heading control, manages mission commands and writes a local SD-card log."},
      {"label": "03 / TRANSFER", "title": "Base station", "text": "ESP-NOW carries commands, waypoint information and telemetry between the boat and base station."},
      {"label": "04 / REVIEW", "title": "Backend + web", "text": "FastAPI and MySQL receive and store data. The dashboard presents boat state, mission progress, routes, alerts and turbidity maps."}
    ],
    "note": "The boat keeps a local mission log while telemetry is sent through the base station for backend storage and web monitoring.",
    "stack": "ESP32-S3 · ESP-NOW · FastAPI · MySQL",
    "footer": "System architecture · BETA TEST.docx, Chapters 1–3; supplied source code"
  },
  {
    "type": "diagram",
    "eyebrow": "05 / Boat platform",
    "title": "A twin-hull surface platform carries the monitoring equipment",
    "lead": "The report includes top and side views of the boat structure. The drawing shows the platform layout used to organize propulsion, electronics and sensor equipment.",
    "image": "assets/boat-structure.png",
    "alt": "Top-down and side profile design drawing of the smart water surface boat",
    "caption": "Boat structure design · BETA TEST.docx, Figure 3.3",
    "footer": "Design drawing from the supplied project report"
  },
  {
    "type": "diagram",
    "eyebrow": "06 / Hardware integration",
    "title": "The wiring joins sensors, navigation, storage and propulsion",
    "lead": "The ESP32-S3 is the main controller. The diagram connects the water sensors and navigation modules to the controller, with motor drivers and two thrusters providing movement.",
    "image": "assets/hardware-wiring.png",
    "alt": "Hardware wiring diagram for the ESP32-S3 water monitoring boat",
    "caption": "Hardware wiring diagram · BETA TEST.docx, Figure 3.4",
    "footer": "The report specifies BTS7960 motor drivers, 12 V thrusters, a 3S LiPo battery and an LM2596 buck converter"
  },
  {
    "type": "flow",
    "eyebrow": "07 / Data journey",
    "title": "Every reading can be logged locally and reviewed remotely",
    "steps": [
      {"label": "01 / MEASURE", "title": "Read + locate", "text": "The controller reads temperature, pH and turbidity together with GPS and heading information."},
      {"label": "02 / PREPARE", "title": "Filter + format", "text": "The report describes basic filtering, signal conversion, calibration and formatting before data are used."},
      {"label": "03 / PRESERVE", "title": "Log + transmit", "text": "Mission readings are written to MicroSD. ESP-NOW carries commands and telemetry to the base station."},
      {"label": "04 / REVIEW", "title": "Store + visualize", "text": "The backend stores records for the dashboard to show current state, route, mission history, alerts and mapped turbidity."}
    ],
    "note": "Local SD logging provides a mission copy when the wireless link is unavailable; remote updates still depend on the communication path.",
    "stack": "Sensors → ESP32-S3 → MicroSD / ESP-NOW → FastAPI → MySQL → Dashboard",
    "footer": "Data workflow · BETA TEST.docx, Sections 1.3–2.4"
  },
  {
    "type": "phases",
    "eyebrow": "08 / Mission workflow",
    "title": "A patrol moves from area setup through return-to-home",
    "phases": [
      {"label": "PHASE 0", "title": "Define area", "text": "Set the monitoring boundary and grid layout, then generate waypoints."},
      {"label": "PHASE 1", "title": "Check readiness", "text": "Record home, upload waypoints and check GPS, compass and battery before start."},
      {"label": "PHASE 2", "title": "Patrol grid", "text": "Follow waypoints, read sensors at locations and save measurements to MicroSD."},
      {"label": "PHASE 3", "title": "Investigate", "text": "On an abnormal reading, spiral around its location and collect more nearby data."},
      {"label": "PHASE 4", "title": "Return + close", "text": "Return home, stop motors and finalize the mission log after patrol completion."}
    ],
    "note": "The activity diagram describes resuming the grid at the nearest waypoint after a spiral scan. The report says Wi-Fi is disabled during missions and ESP-NOW is used for boat communication.",
    "image": "assets/activity-flow.png",
    "alt": "Activity diagram showing setup, pre-mission checks, grid patrol, spiral mapping, and return home",
    "caption": "Full activity diagram from the report · open to zoom",
    "footer": "Mission workflow · BETA TEST.docx, Section 3.6 and Figure 3.6"
  },
  {
    "type": "code",
    "eyebrow": "09 / Route planning",
    "title": "The automatic sweep spreads nine waypoints across the area",
    "lead": "For a horizontal sweep, the backend divides the selected area into three latitude lines. Each line receives start, middle and end points; the point order reverses on alternating lines.",
    "codeLabel": "Planner logic · simplified from main.py",
    "source": "main.py · /generate_sweep",
    "code": "sweep_lines = [start_lat, middle_lat, end_lat]\nline_points = [start_lng, middle_lng, end_lng]\ndirection = 1\n\nfor lat in sweep_lines:\n    points = line_points if direction == 1 else list(reversed(line_points))\n    for lng in points:\n        add_waypoint(lat, lng)\n    direction *= -1",
    "facts": [
      "Three sweep lines × three points produce nine waypoints in the automatic layout.",
      "Reversing point order creates a serpentine route across the area.",
      "The source also supports a vertical orientation; the dashboard has a separate manual-route workflow."
    ],
    "note": "This is a shortened excerpt of the route logic. The automatic layout uses start, midpoint and end coordinates; the report does not give a field-tested spacing or coverage percentage.",
    "footer": "Implementation excerpt · supplied main.py and dashboard.html"
  },
  {
    "type": "story",
    "eyebrow": "10 / Navigation and control",
    "title": "Waypoint guidance and heading control steer the boat",
    "lead": "At each waypoint, GPS provides the current position and the compass provides boat heading. The report describes line-of-sight guidance with heading PID control to guide movement and correct heading error.",
    "sideTitle": "Mission control",
    "sideText": "The boat checks navigation readiness before it starts, advances through the route, then returns to its recorded home location when commanded or when the patrol is complete.",
    "sideItemsStyle": "list",
    "sideItemsLabel": "Signals and actions involved",
    "sideItems": [
      "NEO-8M GPS provides position for waypoint tracking.",
      "QMC5883L magnetometer provides heading information.",
      "PID control adjusts movement through the left and right thrusters.",
      "Return-to-home uses the recorded home coordinate and navigation control."
    ],
    "footer": "Navigation method described in BETA TEST.docx, Sections 1.3 and 3.7"
  },
  {
    "type": "story",
    "eyebrow": "11 / Threshold response",
    "title": "An abnormal reading triggers a closer local survey",
    "lead": "The report describes comparing temperature, pH and turbidity readings with configured thresholds. When a value is outside its accepted range, the system raises an alert and can collect additional readings around that location.",
    "sideTitle": "Response sequence",
    "sideText": "The local investigation is intended to add spatial detail around the reading that triggered the alert.",
    "sideItemsStyle": "list",
    "sideItemsLabel": "How the report describes it",
    "sideItems": [
      "Compare each measurement with its configured limit.",
      "Mark the abnormal condition for dashboard review.",
      "Run an expanding spiral scan around the detected location.",
      "Return to grid patrol near the closest waypoint."
    ],
    "footer": "Threshold detection and spiral mapping · BETA TEST.docx, Sections 1.2, 3.6 and 3.8"
  },
  {
    "type": "code",
    "eyebrow": "12 / Telemetry data model",
    "title": "The backend accepts water readings with boat state",
    "lead": "A single SensorData payload can carry the boat identifier, coordinates, three water readings, battery, heading and mission-state values. Optional fields let the sender omit unavailable measurements.",
    "codeLabel": "Python model · selected fields",
    "source": "main.py · SensorData (Pydantic model)",
    "code": "class SensorData(BaseModel):\n    boat_id: str\n    latitude: float | None = None\n    longitude: float | None = None\n    temp_c: float | None = None\n    ph_level: float | None = None\n    turbidity_ntu: float | None = None\n    battery: float | None = None\n    heading: float | None = None\n    current_mode: int | None = None\n    stage_intent: int | None = None",
    "facts": [
      "GPS coordinates associate the measurement with a place on the route.",
      "Temperature, pH and turbidity remain separate values with their own units or scales.",
      "Battery, heading and mission state help explain what the boat was doing when it sent data."
    ],
    "note": "Only selected fields are shown. The backend model also contains flow_v_lat and flow_v_lng; this slide does not infer their meaning beyond the source field names.",
    "footer": "Implementation excerpt · supplied main.py"
  },
  {
    "type": "code",
    "eyebrow": "13 / Mission commands",
    "title": "The backend exposes separate controls for mission state",
    "lead": "The supplied API has endpoints for mission start and completion, return-to-home, emergency stop, status and waypoint progress. The dashboard uses these routes to request mission actions and read current state.",
    "codeLabel": "Python API · emergency-stop endpoint",
    "source": "main.py · POST /mission/emergency-stop",
    "code": "@app.post(\"/mission/emergency-stop\")\ndef emergencyStop():\n    global mission_running\n    global boat_state\n    global mission_command\n\n    mission_running = False\n    boat_state = \"Emergency Stop\"\n    mission_command = \"EMERGENCY_STOP\"\n\n    return {\n        \"success\": True,\n        \"status\": \"Emergency Stop\",\n        \"command\": \"EMERGENCY_STOP\"\n    }",
    "facts": [
      "The endpoint records an emergency-stop state and command on the backend.",
      "Other routes support starting, completing or returning from a mission.",
      "Status and waypoint-progress routes let the dashboard request mission updates."
    ],
    "note": "This code confirms the server-side state change and response. The excerpt alone does not prove that the physical motors stopped; the boat must receive and apply the command.",
    "footer": "Implementation excerpt · supplied main.py"
  },
  {
    "type": "code",
    "eyebrow": "14 / Dashboard updates",
    "title": "The dashboard polls boat position more often than history",
    "lead": "The supplied page schedules refreshes at different intervals for boat state, mission progress, route information and history. These are browser polling intervals, not measured network latency or guaranteed update times.",
    "codeLabel": "JavaScript · scheduled polling",
    "source": "dashboard.html · dashboard initialization",
    "code": "setInterval(loadBoat, 1000);\nsetInterval(loadMissionStatus, 2000);\nsetInterval(loadMissionProgress, 2000);\nsetInterval(loadPath, 5000);\nsetInterval(loadPrediction, 5000);\nsetInterval(loadHistory, 30000);",
    "facts": [
      "Boat status is scheduled every 1 second.",
      "Mission status and progress are scheduled every 2 seconds.",
      "Path and prediction are scheduled every 5 seconds; history every 30 seconds."
    ],
    "note": "Actual display freshness also depends on request completion, network availability and backend responses.",
    "footer": "Implementation excerpt · supplied dashboard.html"
  },
  {
    "type": "code",
    "eyebrow": "15 / Mission history",
    "title": "Completed missions store sample counts and sensor summaries",
    "lead": "When a mission is completed, the backend query counts its sensor rows and calculates average temperature, pH and turbidity, plus minimum and maximum turbidity.",
    "codeLabel": "SQL · mission summary query",
    "source": "main.py · completeMission()",
    "code": "SELECT\n    COUNT(*) AS sensor_samples,\n    AVG(temp_c) AS avg_temp,\n    AVG(ph_level) AS avg_ph,\n    AVG(turbidity_ntu) AS avg_turbidity,\n    MAX(turbidity_ntu) AS max_turbidity,\n    MIN(turbidity_ntu) AS min_turbidity\nFROM sensor_logs\nWHERE mission_id = %s",
    "facts": [
      "The query summarizes records linked to one mission ID.",
      "Dashboard history groups route details and sensor records by mission.",
      "The supplied dashboard source includes CSV export for sensor logs."
    ],
    "note": "This is the calculation logic, not a set of field results. The supplied report contains no sample count or measured sensor summary to display.",
    "footer": "Implementation excerpt · supplied main.py and dashboard.html"
  },
  {
    "type": "code",
    "eyebrow": "16 / Spatial turbidity map",
    "title": "IDW estimates turbidity between sampled coordinates",
    "lead": "Inverse Distance Weighting assigns more influence to nearby measurements. The supplied dashboard routine applies this calculation to a 25 × 25 grid using a distance power of three.",
    "codeLabel": "JavaScript · IDW calculation",
    "source": "dashboard.html · loadHeatMap()",
    "code": "const rows = 25;\nconst columns = 25;\nconst power = 3;\n\nconst weight = 1 / Math.pow(distance, power);\nweightedValue += sample.ntu * weight;\ntotalWeight += weight;\n\nconst estimatedNTU =\n    weightedValue / totalWeight;",
    "facts": [
      "The boat measures turbidity at sampled GPS locations.",
      "IDW estimates values at grid cells between those measurements.",
      "The heat map is an estimate of spatial distribution, not additional sensor readings."
    ],
    "note": "The IDW routine is present, but the supplied dashboard initialization has the general automatic startup and refresh calls commented out. Verify the active heat-map view before describing it as live.",
    "footer": "Implementation excerpt · supplied dashboard.html"
  },
  {
    "type": "phases",
    "eyebrow": "17 / Verification",
    "title": "Evaluation covers sensors, navigation and the full data path",
    "phases": [
      {"label": "01 / SENSORS", "title": "Readings", "text": "Check temperature, pH and turbidity readings, including calibration and signal conversion."},
      {"label": "02 / POSITION", "title": "Navigation", "text": "Evaluate GPS and compass inputs, waypoint tracking, heading control and return-to-home."},
      {"label": "03 / LINK", "title": "Communication", "text": "Check ESP-NOW waypoint transfer, commands and telemetry between boat and base station."},
      {"label": "04 / DATA", "title": "Storage + web", "text": "Follow records through MicroSD, backend storage and dashboard display."},
      {"label": "05 / FIELD", "title": "Operation", "text": "Assess navigation performance, communication reliability and system stability outdoors."}
    ],
    "note": "These are evaluation areas named in the report. It does not provide quantified accuracy, range, battery duration, pass rates or field-test measurements.",
    "footer": "Testing methodology and limitations · BETA TEST.docx, Sections 1.4 and 4.2"
  },
  {
    "type": "story",
    "eyebrow": "18 / Sources and evidence",
    "title": "The slides distinguish documented design from measured results",
    "lead": "Project behavior and architecture come from the supplied report. Code examples come from the supplied backend and dashboard files. The report does not provide quantified field-performance results, so this presentation does not add them.",
    "sideTitle": "Source materials",
    "sideText": "The project report also cites research and technical references related to unmanned surface vehicles, route planning, interpolation and ESP-NOW.",
    "sideItemsStyle": "list",
    "sideItemsLabel": "Selected references in the report",
    "sideItems": [
      "BETA TEST.docx · Senior Project Report, Mae Fah Luang University, 2026.",
      "Chang et al. · autonomous water-quality monitoring USV · Sensors 21(4), 1102 (2021).",
      "Cao et al. · wide-area water-quality monitoring with USVs · Water 12(3), 681 (2020).",
      "Wang & Xu · dynamics-constrained surface-vehicle path planning · IEEE TVT (2020).",
      "Shepard · two-dimensional interpolation for irregularly spaced data (1968).",
      "Espressif Systems · ESP-NOW Programming Guide (2026)."
    ],
    "footer": "Implementation examples are attributed to supplied main.py and dashboard.html excerpts"
  },
  {
    "type": "closing",
    "eyebrow": "19 / Conclusion and next steps",
    "title": "A mobile workflow for spatial water monitoring",
    "summary": "The project brings water sensing, waypoint navigation, local mission logging and web monitoring onto one surface platform. Its main contribution is moving measurements between locations and linking them to route context.",
    "limitations": [
      "Designed for surface water; it does not measure deep-water conditions.",
      "Operation is intended for moderate weather and relatively stable water.",
      "Measurement quality depends on sensor calibration and environmental conditions.",
      "Navigation and communications depend on GPS, compass and wireless coverage.",
      "Battery capacity and sample distribution constrain mission length and map detail."
    ],
    "future": "The report identifies sensor accuracy, navigation performance, communication reliability and power efficiency as improvement areas. Field measurements and validation results should be added when they are available.",
    "source": "Source: BETA TEST.docx, Chapters 1–4. No quantified field results were supplied.",
    "footer": "Thank you · Patcharapon Teerasamee and Pisit Nilthongkam"
  }
];
