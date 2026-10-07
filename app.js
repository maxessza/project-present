(function () {
  "use strict";
  const slides = Array.isArray(window.presentationSlides) ? window.presentationSlides : [];
  const root = document.getElementById("slides");
  const counter = document.getElementById("counter");
  const progress = document.getElementById("progressBar");
  const dialog = document.getElementById("imageDialog");
  const dialogImage = document.getElementById("dialogImage");
  const dialogCaption = document.getElementById("dialogCaption");
  let current = 0;

  if (!slides.length) {
    const help = root.querySelector(".fallback-help");
    if (help) help.textContent = "Slide data is missing. Upload slides-data.js beside index.html, then reload the page.";
    return;
  }
  root.replaceChildren();

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = text;
    return item;
  }
  function add(parent, tag, className, text) {
    const item = element(tag, className, text);
    parent.appendChild(item);
    return item;
  }
  function addEyebrow(slide, data) { add(slide, "p", "eyebrow", data.eyebrow || ""); }
  function addFooter(slide, text) {
    if (!text) return;
    const footer = add(slide, "div", "bottomline");
    add(footer, "span", "", text);
    add(footer, "span", "", "SMART WATER BOAT · 2026");
  }
  function addTitle(slide, title) { return add(slide, "h2", "", title); }

  function renderCover(data) {
    const slide = element("section", "slide dark cover");
    const copy = add(slide, "div", "cover-copy");
    add(copy, "p", "eyebrow", data.eyebrow);
    const h1 = add(copy, "h1");
    const marker = "Smart Water Surface Boat";
    const at = data.title.indexOf(marker);
    if (at >= 0) {
      h1.appendChild(document.createTextNode(data.title.slice(0, at)));
      h1.appendChild(element("span", "", marker));
      h1.appendChild(document.createTextNode(data.title.slice(at + marker.length)));
    } else h1.textContent = data.title;
    add(copy, "p", "cover-subtitle", data.subtitle);
    const authors = add(copy, "div", "authors");
    data.authors.forEach(function (name, index) {
      const person = add(authors, "div");
      add(person, "span", "", index === 0 ? "Project authors" : " ");
      person.appendChild(document.createTextNode(name));
    });
    add(copy, "p", "cover-meta", data.meta);
    const art = add(slide, "div", "cover-art");
    const image = add(art, "img");
    image.src = data.image;
    image.alt = data.alt || "";
    add(art, "span", "vertical-label", "Surface water / autonomous monitoring");
    return slide;
  }

  function renderStory(data) {
    const slide = element("section", "slide");
    addEyebrow(slide, data);
    const layout = add(slide, "div", "story-layout");
    const main = add(layout, "div");
    addTitle(main, data.title);
    add(main, "p", "lead", data.lead);
    const side = add(layout, "div", "story-side");
    add(side, "h3", "", data.sideTitle);
    add(side, "p", "", data.sideText);
    if (data.sideItemsLabel) add(side, "p", "side-label", data.sideItemsLabel);
    if (data.sideItemsStyle === "list") {
      const list = add(side, "ul", "side-list");
      (data.sideItems || []).forEach(function (item) { add(list, "li", "", item); });
    } else {
      const parameters = add(side, "div", "parameter-line");
      (data.sideItems || []).forEach(function (item) { add(parameters, "span", "", item); });
    }
    addFooter(slide, data.footer);
    return slide;
  }

  function renderFlow(data) {
    const slide = element("section", "slide");
    addEyebrow(slide, data);
    addTitle(slide, data.title);
    const grid = add(slide, "div", "flow-grid");
    data.steps.forEach(function (step) {
      const node = add(grid, "div", "flow-step");
      add(node, "div", "step-label", step.label);
      add(node, "h3", "", step.title);
      add(node, "p", "", step.text);
    });
    const foot = add(slide, "div", "flow-foot");
    add(foot, "p", "", data.note);
    add(foot, "div", "stack", data.stack);
    addFooter(slide, data.footer);
    return slide;
  }

  function renderCode(data) {
    const slide = element("section", "slide");
    addEyebrow(slide, data);
    addTitle(slide, data.title);
    const layout = add(slide, "div", "code-layout");
    const notes = add(layout, "div", "code-insights");
    add(notes, "p", "code-lead", data.lead);
    if (Array.isArray(data.facts) && data.facts.length) {
      const list = add(notes, "ul", "fact-list");
      data.facts.forEach(function (fact) { add(list, "li", "", fact); });
    }
    add(notes, "p", "source-tag", data.source);
    const card = add(layout, "div", "code-wrap");
    const window = add(card, "div", "code-card");
    const bar = add(window, "div", "code-bar");
    const dots = add(bar, "span", "code-dots");
    for (let i = 0; i < 3; i++) add(dots, "i");
    add(bar, "span", "", data.codeLabel || "source excerpt");
    const pre = add(window, "pre");
    add(pre, "code", "", data.code);
    add(card, "p", "code-note", data.note || "");
    addFooter(slide, data.footer);
    return slide;
  }

  function openImage(data) {
    dialogImage.src = data.image;
    dialogImage.alt = data.alt || data.caption || "Project diagram";
    dialogCaption.textContent = data.caption || "Project diagram";
    dialog.showModal();
  }

  function renderDiagram(data) {
    const slide = element("section", "slide diagram-slide");
    addEyebrow(slide, data);
    const head = add(slide, "div", "diagram-head");
    addTitle(head, data.title);
    add(head, "p", "", data.lead);
    const frame = add(slide, "div", "diagram-frame");
    const image = add(frame, "img");
    image.src = data.image;
    image.alt = data.alt || "";
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.title = "Open full-size image";
    image.addEventListener("click", function () { openImage(data); });
    image.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") openImage(data);
    });
    const caption = add(slide, "div", "diagram-caption");
    add(caption, "span", "", data.caption || "");
    const button = add(caption, "button", "image-open", "Open full size ↗");
    button.type = "button";
    button.addEventListener("click", function () { openImage(data); });
    addFooter(slide, data.footer);
    return slide;
  }

  function renderPhases(data) {
    const slide = element("section", "slide");
    addEyebrow(slide, data);
    addTitle(slide, data.title);
    const phases = add(slide, "div", "phases");
    data.phases.forEach(function (phase) {
      const item = add(phases, "div", "phase");
      add(item, "div", "phase-label", phase.label);
      add(item, "h3", "", phase.title);
      add(item, "p", "", phase.text);
    });
    const tools = add(slide, "div", "phase-tools");
    add(tools, "p", "", data.note);
    const button = add(tools, "button", "outline-button", "View full activity diagram ↗");
    button.type = "button";
    button.addEventListener("click", function () { openImage(data); });
    addFooter(slide, data.footer);
    return slide;
  }

  function renderClosing(data) {
    const slide = element("section", "slide");
    addEyebrow(slide, data);
    const layout = add(slide, "div", "closing-layout");
    const left = add(layout, "div");
    addTitle(left, "Operating conditions shape monitoring quality");
    const list = add(left, "ul", "limit-list");
    data.limitations.forEach(function (item) { add(list, "li", "", item); });
    const right = add(layout, "div", "closing-copy");
    addTitle(right, data.title);
    add(right, "p", "", data.summary);
    add(right, "p", "", data.future);
    add(right, "p", "source-note", data.source);
    addFooter(slide, data.footer);
    return slide;
  }

  const renderers = {cover:renderCover,story:renderStory,flow:renderFlow,code:renderCode,diagram:renderDiagram,phases:renderPhases,closing:renderClosing};
  slides.forEach(function (data, index) {
    const renderer = renderers[data.type];
    if (!renderer) return;
    const slide = renderer(data);
    slide.dataset.index = String(index + 1);
    slide.setAttribute("aria-label", "Slide " + (index + 1) + " of " + slides.length);
    slide.setAttribute("aria-hidden", index === 0 ? "false" : "true");
    slide.hidden = index !== 0;
    root.appendChild(slide);
  });

  const slideElements = Array.from(root.querySelectorAll(".slide"));
  function show(next) {
    current = Math.max(0, Math.min(slideElements.length - 1, next));
    slideElements.forEach(function (slide, index) {
      const active = index === current;
      slide.hidden = !active;
      slide.setAttribute("aria-hidden", String(!active));
    });
    counter.textContent = String(current + 1).padStart(2, "0") + " / " + String(slideElements.length).padStart(2, "0");
    progress.style.width = ((current + 1) / slideElements.length * 100) + "%";
    document.title = String(current + 1).padStart(2, "0") + " · Smart Water Surface Boat";
  }
  document.getElementById("prev").addEventListener("click", function () { show(current - 1); });
  document.getElementById("next").addEventListener("click", function () { show(current + 1); });
  document.getElementById("closeDialog").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  document.addEventListener("keydown", function (event) {
    if (dialog.open) { if (event.key === "Escape") dialog.close(); return; }
    if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); show(current + 1); }
    if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); show(current - 1); }
    if (event.key === "Home") show(0);
    if (event.key === "End") show(slideElements.length - 1);
    if (event.key.toLowerCase() === "f") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    }
  });
  let touchX = null;
  document.getElementById("stage").addEventListener("touchstart", function (event) { touchX = event.changedTouches[0].clientX; }, {passive:true});
  document.getElementById("stage").addEventListener("touchend", function (event) {
    if (touchX === null) return;
    const delta = event.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 60) show(current + (delta < 0 ? 1 : -1));
    touchX = null;
  }, {passive:true});
  show(0);
})();
