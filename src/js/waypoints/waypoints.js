(() => {
  const svg = document.querySelector(".route-map-svg");
  const basePath = document.getElementById("routePathBase");
  const progressPath = document.getElementById("routeProgressPath");
  const pointLayer = document.getElementById("routePointLayer");
  const cornerLayer = document.getElementById("routeCornerLayer");
  const cornerOutline = document.getElementById("routeCornerOutline");
  const boundsPreview = document.getElementById("routeBoundsPreview");
  const boundsLabel = document.getElementById("routeBoundsLabel");
  const range = document.getElementById("routeRange");
  const count = document.getElementById("routeStepCount");
  const countLabel = document.getElementById("routeCountLabel");
  const output = document.getElementById("routeRangeOutput");
  const title = document.getElementById("routeStepTitle");
  const description = document.getElementById("routeStepDescription");
  const status = document.getElementById("routeInteractionStatus");
  const coordinate = document.getElementById("routeCoordText");
  const manualButton = document.getElementById("routeManualMode");
  const sweepButton = document.getElementById("routeSweepMode");
  const generateButton = document.getElementById("routeGenerateSweep");
  const addButton = document.getElementById("routeAddPoint");
  const undoButton = document.getElementById("routeUndo");
  const playButton = document.getElementById("routePlay");
  const resetButton = document.getElementById("routeReset");

  if (
    !svg || !basePath || !progressPath || !pointLayer || !cornerLayer || !range ||
    !title || !description || !status || !manualButton || !sweepButton ||
    !generateButton || !addButton || !undoButton || !playButton || !resetButton
  ) return;

  const svgSize = { width: 750, height: 350 };
  const survey = { left: 50, top: 40, right: 700, bottom: 310 };
  const margin = 0.10;
  const maxManualPoints = 100;
  const minimumCornerSpacing = 8;
  let mode = "manual";
  let manualPoints = [];
  let sweepCorners = [];
  let generatedPoints = [];
  let currentStep = 0;
  let timer = null;
  let pathLength = 0;

  function currentPoints() {
    return mode === "manual" ? manualPoints : generatedPoints;
  }

  function stopPlayback() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    if (playButton) {
      playButton.textContent = "เล่นเส้นทาง";
      playButton.setAttribute("aria-pressed", "false");
    }
  }

  function toSurveyPercent(point) {
    return {
      lat: Math.round(((point.y - survey.top) / (survey.bottom - survey.top)) * 100),
      lng: Math.round(((point.x - survey.left) / (survey.right - survey.left)) * 100)
    };
  }

  function inSurvey(point) {
    return Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= survey.left && point.x <= survey.right &&
      point.y >= survey.top && point.y <= survey.bottom;
  }

  function pointFromPointer(event) {
    // Convert through the SVG's own coordinate transform so clicks stay aligned
    // when the page is resized or the SVG is letterboxed by preserveAspectRatio.
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      try {
        const matrix = svg.getScreenCTM();
        if (matrix) {
          const pointer = svg.createSVGPoint();
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          const point = pointer.matrixTransform(matrix.inverse());
          if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
            return { x: point.x, y: point.y };
          }
        }
      } catch {
        // Fall back to the bounding box conversion for browsers with incomplete SVG APIs.
      }
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: NaN, y: NaN };
    return {
      x: (event.clientX - rect.left) * svgSize.width / rect.width,
      y: (event.clientY - rect.top) * svgSize.height / rect.height
    };
  }

  function addSvgText(group, x, y, content, className, anchor) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("class", className);
    label.setAttribute("text-anchor", anchor || "middle");
    label.textContent = content;
    group.appendChild(label);
  }

  function renderCorners() {
    cornerLayer.replaceChildren();
    if (generatedPoints.length > 0) {
      if (cornerOutline) cornerOutline.setAttribute("points", "");
      return;
    }

    const outlinePoints = sweepCorners.map((point) =>
      point.x.toFixed(1) + "," + point.y.toFixed(1)
    );
    if (sweepCorners.length === 4) outlinePoints.push(outlinePoints[0]);
    if (cornerOutline) cornerOutline.setAttribute("points", outlinePoints.join(" "));

    sweepCorners.forEach((point, index) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "route-corner-marker");
      group.setAttribute("aria-label", "มุมที่ " + (index + 1));
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "7");
      group.appendChild(circle);
      addSvgText(group, point.x + 12, point.y - 10, "C" + (index + 1), "route-corner-label", "start");
      cornerLayer.appendChild(group);
    });
  }

  function updateBoundsPreview() {
    if (!boundsPreview || !boundsLabel) return;
    if (generatedPoints.length > 0 || mode !== "sweep" || sweepCorners.length !== 4) {
      boundsPreview.style.display = "none";
      boundsLabel.style.display = "none";
      return;
    }

    const xs = sweepCorners.map((point) => point.x);
    const ys = sweepCorners.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const insetX = (maxX - minX) * margin;
    const insetY = (maxY - minY) * margin;
    boundsPreview.setAttribute("x", String(minX + insetX));
    boundsPreview.setAttribute("y", String(minY + insetY));
    boundsPreview.setAttribute("width", String((maxX - minX) - insetX * 2));
    boundsPreview.setAttribute("height", String((maxY - minY) - insetY * 2));
    boundsPreview.style.display = "block";
    boundsLabel.setAttribute("x", String(minX + insetX + 4));
    boundsLabel.setAttribute("y", String(Math.max(34, minY + insetY - 7)));
    boundsLabel.style.display = "block";
  }

  function renderRoutePoints(points) {
    pointLayer.replaceChildren();
    points.forEach((point, index) => {
      const order = index + 1;
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "route-point");
      group.dataset.order = String(order);
      group.dataset.lane = String(point.lane || "");
      const pct = toSurveyPercent(point);
      group.dataset.lat = String(pct.lat);
      group.dataset.lng = String(pct.lng);
      group.setAttribute(
        "aria-label",
        "Waypoint " + order + ", latitude " + pct.lat + " percent, longitude " + pct.lng + " percent"
      );

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "9");
      group.appendChild(circle);
      const labelX = point.x > survey.right - 35 ? point.x - 12 : point.x + 12;
      const anchor = point.x > survey.right - 35 ? "end" : "start";
      addSvgText(
        group,
        labelX,
        point.y - 10,
        String(order).padStart(2, "0"),
        "route-point-label",
        anchor
      );
      pointLayer.appendChild(group);
    });
  }

  function updateProgress(points) {
    const pathPoints = points.map((point) =>
      point.x.toFixed(1) + "," + point.y.toFixed(1)
    ).join(" ");
    basePath.setAttribute("points", pathPoints);
    progressPath.setAttribute("points", pathPoints);
    pathLength = 0;
    if (points.length > 1) {
      try {
        pathLength = progressPath.getTotalLength();
        progressPath.style.strokeDasharray = String(pathLength) + " " + String(pathLength);
      } catch {
        pathLength = 0;
      }
    } else {
      progressPath.style.strokeDasharray = "none";
      progressPath.style.strokeDashoffset = "0";
    }
  }

  function updateStep(step, points) {
    currentStep = Math.max(0, Math.min(points.length, Number(step) || 0));
    range.max = String(points.length);
    range.value = String(currentStep);
    range.disabled = points.length < 2;
    if (output) output.value = currentStep + " / " + points.length;

    if (pathLength > 0) {
      progressPath.style.strokeDashoffset =
        String(pathLength * (1 - currentStep / Math.max(1, points.length)));
    }

    [...pointLayer.querySelectorAll(".route-point")].forEach((point) => {
      const order = Number(point.dataset.order);
      point.classList.toggle("is-visited", order <= currentStep);
      point.classList.toggle("is-active", order === currentStep);
    });

    let shownPoint = currentStep > 0 ? points[currentStep - 1] : null;
    if (!shownPoint && points.length > 0) shownPoint = points[points.length - 1];
    if (shownPoint && coordinate) {
      const pct = toSurveyPercent(shownPoint);
      coordinate.textContent =
        "ละติจูดประมาณ " + pct.lat + "% · ลองจิจูดประมาณ " + pct.lng + "% ของกรอบ";
    } else if (coordinate) {
      coordinate.textContent = "ยังไม่มี waypoint";
    }

    if (count) count.textContent = String(points.length);
    if (playButton) playButton.disabled = points.length < 2;
  }

  function render() {
    const points = currentPoints();
    renderCorners();
    updateBoundsPreview();
    renderRoutePoints(points);
    updateProgress(points);
    updateStep(currentStep, points);

    const isManual = mode === "manual";
    manualButton.classList.toggle("is-selected", isManual);
    manualButton.setAttribute("aria-pressed", isManual ? "true" : "false");
    sweepButton.classList.toggle("is-selected", !isManual);
    sweepButton.setAttribute("aria-pressed", !isManual ? "true" : "false");
    if (countLabel) countLabel.textContent = isManual ? "waypoint วางเอง" : "waypoint ใน Auto Sweep";
    if (addButton) addButton.disabled = !isManual;
    if (undoButton) undoButton.disabled = isManual
      ? manualPoints.length === 0
      : generatedPoints.length === 0 && sweepCorners.length === 0;
    if (generateButton) {
      generateButton.disabled = isManual || sweepCorners.length !== 4 || generatedPoints.length > 0;
      generateButton.textContent = generatedPoints.length > 0
        ? "Generate แล้ว · 15 waypoint"
        : sweepCorners.length === 4
          ? "Generate Auto Sweep · 15 waypoint"
          : "เลือกมุม " + sweepCorners.length + " / 4 ก่อน Generate";
    }

    if (isManual) {
      title.textContent = points.length === 0
        ? "คลิกพื้นที่แผนที่เพื่อวางจุดแรก"
        : "มี " + points.length + " waypoint ใน route";
      description.textContent = points.length === 0
        ? "แต่ละคลิกจะเพิ่ม waypoint พร้อมหมายเลขและเส้นเชื่อมตามลำดับ"
        : "เส้นเชื่อมและหมายเลขแสดงลำดับที่คลิก จุดล่าสุดอยู่ที่ WP" + String(points.length).padStart(2, "0");
      status.textContent = "โหมดวางเอง · คลิกภายในกรอบแผนที่";
    } else if (sweepCorners.length < 4) {
      title.textContent = "เลือกมุมพื้นที่ " + sweepCorners.length + " / 4";
      description.textContent = "คลิก 4 มุมของบริเวณสำรวจ กรอบ route ด้านในจะเว้นขอบด้านละ 10%";
      status.textContent = "Auto Sweep · คลิกมุมต่อไป " + (sweepCorners.length + 1) + " / 4";
    } else if (generatedPoints.length === 0) {
      title.textContent = "ขอบเขตพร้อมสร้าง route";
      description.textContent = "กด Generate เพื่อสร้าง 5 แนว × 3 จุด แล้วดูเส้นทางที่ต่อเนื่องกัน";
      status.textContent = "เลือกครบ 4 มุมแล้ว · พร้อม Generate Sweep";
    } else {
      title.textContent = "Auto Sweep สร้างครบ 15 จุด";
      description.textContent = "WP1 เริ่มที่มุมล่างซ้ายแล้ววิ่งซิกแซ็ก · ซ่อนมุมที่เลือกหลัง Generate แล้ว";
      status.textContent = "สร้าง route ร่างแล้ว · กดเล่นเส้นทางเพื่อดูการเดิน";
    }
  }

  function addManualPoint(point) {
    if (!inSurvey(point)) {
      status.textContent = "คลิกภายในกรอบเส้นประเพื่อวาง waypoint";
      return;
    }
    if (manualPoints.length >= maxManualPoints) {
      status.textContent = "ถึงขีดจำกัด " + maxManualPoints + " waypoint สำหรับหน้าเดโมแล้ว · กดเริ่มใหม่เพื่อล้าง route";
      return;
    }
    stopPlayback();
    manualPoints.push(point);
    currentStep = manualPoints.length;
    render();
  }

  function generateSweep() {
    if (mode !== "sweep" || sweepCorners.length !== 4) return;
    const xs = sweepCorners.map((point) => point.x);
    const ys = sweepCorners.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    if (maxX - minX < 40 || maxY - minY < 40) {
      status.textContent = "กรอบเล็กเกินไปในภาพสาธิต กรุณาเลือก 4 มุมให้ครอบคลุมพื้นที่กว้างขึ้น";
      return;
    }
    if (new Set(sweepCorners.map((point) => Math.round(point.x) + ":" + Math.round(point.y))).size < 4) {
      status.textContent = "มุมที่เลือกซ้ำกัน · กรุณาเลือก 4 มุมคนละตำแหน่ง";
      return;
    }

    const innerLeft = minX + (maxX - minX) * margin;
    const innerRight = maxX - (maxX - minX) * margin;
    const innerTop = minY + (maxY - minY) * margin;
    const innerBottom = maxY - (maxY - minY) * margin;
    const lineFractions = [0, 0.25, 0.5, 0.75, 1];
    const pointFractions = [0, 0.5, 1];
    generatedPoints = [];

    lineFractions.forEach((fraction, laneIndex) => {
      const x = innerLeft + (innerRight - innerLeft) * fraction;
      // Start at the lower-left point (previously WP3), now the true WP1.
      const yFractions = laneIndex % 2 === 0
        ? [...pointFractions].reverse()
        : pointFractions;
      yFractions.forEach((yFraction) => {
        generatedPoints.push({
          x,
          y: innerTop + (innerBottom - innerTop) * yFraction,
          lane: laneIndex + 1
        });
      });
    });

    stopPlayback();
    currentStep = 0;
    render();
  }

  function addKeyboardExamplePoint() {
    const index = manualPoints.length;
    const col = index % 10;
    const row = Math.floor(index / 10);
    addManualPoint({
      x: survey.left + 30 + col * ((survey.right - survey.left - 60) / 9),
      y: survey.top + 30 + row * ((survey.bottom - survey.top - 60) / 9)
    });
  }

  svg.addEventListener("click", (event) => {
    const point = pointFromPointer(event);
    if (!inSurvey(point)) {
      status.textContent = "เลือกจุดภายในกรอบเส้นประ";
      return;
    }

    stopPlayback();
    if (mode === "manual") {
      addManualPoint(point);
      return;
    }

    if (generatedPoints.length > 0 || sweepCorners.length >= 4) {
      status.textContent = "เลือกครบแล้ว · กด ย้อนจุดล่าสุด หรือ เริ่มใหม่ หากต้องการเปลี่ยนกรอบ";
      return;
    }
    if (sweepCorners.some((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) < minimumCornerSpacing)) {
      status.textContent = "จุดนี้ใกล้มุมที่เลือกไว้เกินไป · เลือกมุมที่แยกจากกันอีกเล็กน้อย";
      return;
    }
    sweepCorners.push(point);
    render();
  });

  manualButton.addEventListener("click", () => {
    stopPlayback();
    mode = "manual";
    currentStep = 0;
    render();
  });
  sweepButton.addEventListener("click", () => {
    stopPlayback();
    mode = "sweep";
    currentStep = 0;
    render();
  });
  generateButton.addEventListener("click", generateSweep);
  addButton.addEventListener("click", addKeyboardExamplePoint);
  undoButton.addEventListener("click", () => {
    stopPlayback();
    currentStep = 0;
    if (mode === "manual") {
      manualPoints.pop();
    } else if (generatedPoints.length > 0) {
      generatedPoints = [];
    } else {
      sweepCorners.pop();
    }
    render();
  });
  resetButton.addEventListener("click", () => {
    stopPlayback();
    manualPoints = [];
    sweepCorners = [];
    generatedPoints = [];
    currentStep = 0;
    render();
  });
  range.addEventListener("input", () => {
    stopPlayback();
    updateStep(range.value, currentPoints());
  });
  playButton.addEventListener("click", () => {
    const points = currentPoints();
    if (points.length < 2) return;
    if (timer !== null) {
      stopPlayback();
      return;
    }
    if (currentStep >= points.length) updateStep(0, points);
    playButton.textContent = "พักเส้นทาง";
    playButton.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => {
      const next = Number(range.value) + 1;
      updateStep(next, points);
      if (next >= points.length) stopPlayback();
    }, 600);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
  });

  render();
})();
