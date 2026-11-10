(() => {
  const svgNS = "http://www.w3.org/2000/svg";
  const mapBounds = { x: 60, y: 48, width: 480, height: 260 };
  const margin = 0.10;
  const home = {
    x: mapBounds.x + mapBounds.width * margin,
    y: mapBounds.y + mapBounds.height * (1 - margin)
  };
  const gridLayer = document.getElementById("heatmapCells");
  const sampleLayer = document.getElementById("heatmapSamples");
  const waypointLayer = document.getElementById("heatmapWaypoints");
  const routeLine = document.getElementById("heatmapRoutePath");
  const homeLine = document.getElementById("heatmapHomePath");
  const travelledLine = document.getElementById("heatmapTravelledPath");
  const boat = document.getElementById("heatmapBoat");
  const startButton = document.getElementById("heatStart");
  const pauseButton = document.getElementById("heatPause");
  const resetButton = document.getElementById("heatReset");
  const speedSelect = document.getElementById("heatSpeed");
  const modeButtons = [...document.querySelectorAll("[data-heat-mode]")];
  const resolution = document.getElementById("heatmapResolution");
  const modeTitle = document.getElementById("heatmapModeTitle");
  const modeDescription = document.getElementById("heatmapModeDescription");
  const sampleList = document.getElementById("heatmapSampleList");
  const boatStatus = document.getElementById("heatBoatStatus");
  const sampleCount = document.getElementById("heatSampleCount");
  const latestNtu = document.getElementById("heatLatestNtu");
  const gateStatus = document.getElementById("heatGateStatus");

  if (!gridLayer || !sampleLayer || !waypointLayer || !boat || modeButtons.length === 0) return;

  const route = [];
  const sampleValues = [8, 13, 19, 24, 31, 27, 20, 15, 22, 29, 36, 40, 34, 25, 18];
  const stops = [
    { value: 0, rgb: [37, 99, 235] },
    { value: 10, rgb: [34, 197, 94] },
    { value: 20, rgb: [250, 204, 21] },
    { value: 30, rgb: [249, 115, 22] },
    { value: 40, rgb: [239, 68, 68] }
  ];
  const inner = {
    left: mapBounds.x + mapBounds.width * margin,
    right: mapBounds.x + mapBounds.width * (1 - margin),
    top: mapBounds.y + mapBounds.height * margin,
    bottom: mapBounds.y + mapBounds.height * (1 - margin)
  };
  const homePathPoints = [home];

  for (let lane = 0; lane < 5; lane += 1) {
    const x = inner.left + (inner.right - inner.left) * lane / 4;
    // Begin at the lower-left point, so the boat starts directly on WP1.
    const yOrder = lane % 2 === 0 ? [1, 0.5, 0] : [0, 0.5, 1];
    yOrder.forEach((fraction) => {
      route.push({
        x,
        y: inner.top + (inner.bottom - inner.top) * fraction,
        lane: lane + 1
      });
    });
  }

  const samples = [];
  let mode = "live";
  let currentLeg = 0;
  let legProgress = 0;
  let running = false;
  let started = false;
  let frame = null;
  let previousFrameTime = 0;

  function svgElement(tag, attrs) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function colorFor(value) {
    const ntu = Math.max(0, Math.min(40, Number(value) || 0));
    for (let i = 0; i < stops.length - 1; i += 1) {
      const a = stops[i];
      const b = stops[i + 1];
      if (ntu <= b.value) {
        const ratio = (ntu - a.value) / (b.value - a.value);
        const rgb = a.rgb.map((channel, index) =>
          Math.round(channel + (b.rgb[index] - channel) * ratio)
        );
        return "rgb(" + rgb.join(",") + ")";
      }
    }
    return "rgb(239,68,68)";
  }

  function idwValue(x, y) {
    let weightedTotal = 0;
    let weightTotal = 0;
    for (const sample of samples) {
      const distance = Math.hypot(x - sample.x, y - sample.y);
      if (distance < 0.001) return sample.ntu;
      const weight = 1 / Math.pow(distance, 2);
      weightedTotal += sample.ntu * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? weightedTotal / weightTotal : null;
  }

  function routePointsToString(points) {
    return points.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
  }

  function renderRoute() {
    routeLine.setAttribute("points", routePointsToString(route));
    homeLine.setAttribute("points", routePointsToString([home, route[0]]));
    renderWaypoints();
    renderTravelledPath();
    renderBoat();
  }

  function renderWaypoints() {
    waypointLayer.replaceChildren();
    route.forEach((point, index) => {
      const group = svgElement("g", {
        class: "heat-waypoint-node" +
          (index < samples.length ? " is-visited" : "") +
          (running && index === currentLeg ? " is-active" : "")
      });
      const circle = svgElement("circle", {
        cx: point.x,
        cy: point.y,
        r: 5
      });
      group.appendChild(circle);
      const label = svgElement("text", {
        x: point.x + (point.x > inner.right - 20 ? -8 : index === 0 ? 20 : 8),
        y: point.y - (index === 0 ? 12 : 7),
        "text-anchor": point.x > inner.right - 20 ? "end" : "start",
        class: "heat-waypoint-label"
      });
      label.textContent = String(index + 1).padStart(2, "0");
      group.appendChild(label);
      waypointLayer.appendChild(group);
    });
  }

  function currentBoatPosition() {
    if (!started) return home;
    if (currentLeg >= route.length) return route[route.length - 1];
    const from = currentLeg === 0 ? home : route[currentLeg - 1];
    const to = route[currentLeg];
    return {
      x: from.x + (to.x - from.x) * legProgress,
      y: from.y + (to.y - from.y) * legProgress
    };
  }

  function renderBoat() {
    const position = currentBoatPosition();
    let angle = 0;
    if (started && currentLeg < route.length) {
      const from = currentLeg === 0 ? home : route[currentLeg - 1];
      const to = route[currentLeg];
      angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    }
    boat.setAttribute(
      "transform",
      "translate(" + position.x.toFixed(2) + " " + position.y.toFixed(2) + ") rotate(" + angle.toFixed(1) + ")"
    );
  }

  function renderTravelledPath() {
    if (!started) {
      travelledLine.setAttribute("points", "");
      return;
    }
    const traveled = [home, ...route.slice(0, samples.length)];
    if (currentLeg < route.length && (running || legProgress > 0)) {
      traveled.push(currentBoatPosition());
    }
    travelledLine.setAttribute("points", routePointsToString(traveled));
  }

  function renderCells() {
    gridLayer.replaceChildren();
    if (mode === "live" || samples.length === 0) return;

    const size = mode === "final" ? 10 : 40;
    const cellWidth = mapBounds.width / size;
    const cellHeight = mapBounds.height / size;
    const measuredCells = new Map();

    if (mode === "final") {
      samples.forEach((sample) => {
        const col = Math.max(0, Math.min(size - 1, Math.floor((sample.x - mapBounds.x) / cellWidth)));
        const row = Math.max(0, Math.min(size - 1, Math.floor((sample.y - mapBounds.y) / cellHeight)));
        const key = row + ":" + col;
        if (!measuredCells.has(key)) measuredCells.set(key, []);
        measuredCells.get(key).push(sample.ntu);
      });
    }

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const x = mapBounds.x + col * cellWidth;
        const y = mapBounds.y + row * cellHeight;
        const measured = measuredCells.get(row + ":" + col);
        const value = measured
          ? measured.reduce((sum, item) => sum + item, 0) / measured.length
          : idwValue(x + cellWidth / 2, y + cellHeight / 2);
        gridLayer.appendChild(svgElement("rect", {
          x: x + 0.4,
          y: y + 0.4,
          width: Math.max(0, cellWidth - 0.8),
          height: Math.max(0, cellHeight - 0.8),
          rx: size === 10 ? 1.5 : 0,
          class: measured ? "heat-cell is-measured" : "heat-cell is-estimated",
          fill: colorFor(value),
          "fill-opacity": mode === "final" ? 0.9 : 0.78
        }));
      }
    }
  }

  function renderSamples() {
    sampleLayer.replaceChildren();
    samples.forEach((sample, index) => {
      if (mode === "live") {
        [
          { radius: 25, opacity: 0.09 },
          { radius: 17, opacity: 0.16 },
          { radius: 9, opacity: 0.25 }
        ].forEach((ring) => {
          sampleLayer.appendChild(svgElement("circle", {
            cx: sample.x,
            cy: sample.y,
            r: ring.radius,
            class: "heat-live-ring",
            fill: colorFor(sample.ntu),
            "fill-opacity": ring.opacity
          }));
        });
      }

      sampleLayer.appendChild(svgElement("circle", {
        cx: sample.x,
        cy: sample.y,
        r: 4.2,
        class: "heat-sample-halo"
      }));
      sampleLayer.appendChild(svgElement("circle", {
        cx: sample.x,
        cy: sample.y,
        r: 3,
        class: "heat-sample-core",
        fill: colorFor(sample.ntu)
      }));

      const label = svgElement("text", {
        x: sample.x > mapBounds.x + mapBounds.width - 25 ? sample.x - 7 : sample.x + 7,
        y: sample.y < mapBounds.y + 20 ? sample.y + 18 : sample.y - 7,
        "text-anchor": sample.x > mapBounds.x + mapBounds.width - 25 ? "end" : "start",
        class: "heat-sample-label"
      });
      label.textContent = "WP" + String(index + 1).padStart(2, "0") + " · " + sample.ntu;
      sampleLayer.appendChild(label);
    });
  }

  function renderSampleList() {
    if (!sampleList) return;
    sampleList.replaceChildren();
    if (samples.length === 0) {
      const empty = document.createElement("p");
      empty.className = "heatmap-no-samples";
      empty.textContent = "ยังไม่มี sample · รอเริ่มภารกิจ";
      sampleList.appendChild(empty);
      return;
    }
    samples.slice(-5).reverse().forEach((sample, reverseIndex) => {
      const index = samples.length - reverseIndex;
      const row = document.createElement("div");
      const dot = document.createElement("span");
      dot.className = "sample-dot";
      dot.style.background = colorFor(sample.ntu);
      const label = document.createElement("span");
      label.textContent = "WP" + String(index).padStart(2, "0") + " · sample";
      const value = document.createElement("strong");
      value.textContent = sample.ntu + " NTU";
      row.append(dot, label, value);
      sampleList.appendChild(row);
    });
  }

  function renderTelemetry() {
    if (sampleCount) sampleCount.textContent = String(samples.length);
    if (latestNtu) {
      latestNtu.textContent = samples.length > 0
        ? samples[samples.length - 1].ntu + " NTU"
        : "—";
    }

    if (boatStatus) {
      if (!started) boatStatus.textContent = "HOME · WP1";
      else if (currentLeg >= route.length) boatStatus.textContent = "WP15 · DONE";
      else boatStatus.textContent = "WP" + String(currentLeg + 1).padStart(2, "0");
    }

    if (gateStatus) {
      gateStatus.textContent = samples.length === 0
        ? "LOCKED"
        : currentLeg >= route.length
          ? "COMPLETE"
          : "LIVE";
    }

    const finalAvailable = samples.length === route.length;
    modeButtons.forEach((button) => {
      const buttonMode = button.dataset.heatMode;
      const selected = buttonMode === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.disabled = buttonMode !== "live" && !finalAvailable;
    });

    if (resolution) {
      if (mode === "live") {
        resolution.textContent = samples.length === 0
          ? "LOCKED · รอเริ่มที่ WP1"
          : "LIVE · " + samples.length + " / 15 sample";
      } else if (mode === "final") {
        resolution.textContent = "10 × 10 · FINAL";
      } else {
        resolution.textContent = "40 × 40 · MISSION";
      }
    }

    const modeCopy = {
      live: samples.length === 0
        ? ["Live Monitor · รอเริ่มที่ WP1", "เรือเริ่มที่ WP1 มุมล่างซ้าย · ก่อนกดเริ่มยังไม่มี sample เมื่อเริ่มแล้ว gate จะเปิดและแสดงค่าจุดแรกทันที"]
        : ["Live Monitor · " + samples.length + " sample", "วงสีแสดง NTU จากจุดที่เรือเก็บได้โดยตรง ยังไม่คำนวณค่าระหว่างจุดด้วย IDW"],
      final: ["Final summary · 10 × 10", "ช่องที่มี sample ใช้ค่าเฉลี่ยของค่าที่เก็บจริง ช่องว่างจึงเติมด้วย IDW power 2 หลังเรือถึง WP15"],
      mission: ["Mission detail · 40 × 40", "แสดงการประมาณค่า IDW power 2 เต็มกริดของภารกิจที่เลือก จุด sample ที่แสดงยังเป็นจุดข้อมูลต้นทาง"]
    }[mode];
    if (modeTitle) modeTitle.textContent = modeCopy[0];
    if (modeDescription) modeDescription.textContent = modeCopy[1];
  }

  function renderAll() {
    renderRoute();
    renderCells();
    renderSamples();
    renderSampleList();
    renderTelemetry();
  }

  function recordSample(index) {
    const waypoint = route[index];
    if (!waypoint || samples.some((sample) => sample.waypoint === index + 1)) return;
    samples.push({
      x: waypoint.x,
      y: waypoint.y,
      ntu: sampleValues[index],
      waypoint: index + 1
    });
    renderAll();
  }

  function setRunning(value) {
    running = value;
    if (startButton) {
      startButton.disabled = running || currentLeg >= route.length;
      startButton.textContent = currentLeg >= route.length
        ? "เดินครบ route"
        : started
          ? "วิ่งต่อ"
          : "เริ่มเรือ";
    }
    if (pauseButton) {
      pauseButton.disabled = !running;
      pauseButton.textContent = "พัก";
    }
    renderWaypoints();
    renderTravelledPath();
    renderTelemetry();
  }

  function finishSimulation() {
    currentLeg = route.length;
    legProgress = 1;
    setRunning(false);
    mode = "final";
    renderAll();
  }

  function animate(timestamp) {
    if (!running) return;
    frame = null;
    if (!Number.isFinite(timestamp)) timestamp = performance.now();
    if (previousFrameTime === 0) previousFrameTime = timestamp;
    // A delayed frame should slow the demo briefly instead of teleporting the boat.
    const elapsed = Math.max(0, Math.min(80, timestamp - previousFrameTime));
    previousFrameTime = timestamp;
    const selectedDuration = Number(speedSelect?.value);
    const duration = Number.isFinite(selectedDuration) && selectedDuration > 0
      ? Math.max(100, selectedDuration)
      : 420;
    legProgress = Math.min(1, legProgress + elapsed / duration);
    renderBoat();
    renderTravelledPath();

    if (legProgress >= 1) {
      const reachedIndex = currentLeg;
      currentLeg += 1;
      legProgress = 0;
      started = true;
      recordSample(reachedIndex);
      if (currentLeg >= route.length) {
        finishSimulation();
        return;
      }
      renderWaypoints();
      renderTelemetry();
    }

    frame = window.requestAnimationFrame(animate);
  }

  function startSimulation() {
    if (currentLeg >= route.length || running) return;
    if (!started && Math.hypot(home.x - route[0].x, home.y - route[0].y) < 0.001) {
      // The boat starts on WP1, so take its first sample before moving to WP2.
      started = true;
      currentLeg = 1;
      recordSample(0);
    }
    started = true;
    previousFrameTime = 0;
    setRunning(true);
    frame = window.requestAnimationFrame(animate);
  }

  function pauseSimulation() {
    if (!running) return;
    running = false;
    previousFrameTime = 0;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "วิ่งต่อ";
    }
    if (pauseButton) pauseButton.disabled = true;
    renderWaypoints();
    renderTravelledPath();
    renderTelemetry();
  }

  function resetSimulation() {
    running = false;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    previousFrameTime = 0;
    currentLeg = 0;
    legProgress = 0;
    started = false;
    samples.splice(0, samples.length);
    mode = "live";
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "เริ่มเรือ";
    }
    if (pauseButton) {
      pauseButton.disabled = true;
      pauseButton.textContent = "พัก";
    }
    renderAll();
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.heatMode;
      if (!["live", "final", "mission"].includes(nextMode)) return;
      if (nextMode !== "live" && samples.length !== route.length) return;
      mode = nextMode;
      renderAll();
    });
  });
  startButton?.addEventListener("click", startSimulation);
  pauseButton?.addEventListener("click", pauseSimulation);
  resetButton?.addEventListener("click", resetSimulation);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseSimulation();
  });

  renderAll();
})();
