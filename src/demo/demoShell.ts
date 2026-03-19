export interface DemoShell {
  readonly canvas: HTMLCanvasElement;
  readonly headerActions: HTMLDivElement;
  readonly footer: HTMLDivElement;
  readonly leftPanel: HTMLDivElement;
  readonly featurePanel: HTMLDivElement;
}

export function createDemoShell(): DemoShell {
  const mount = document.getElementById("app");

  if (!mount) {
    throw new Error("Missing #app mount element.");
  }

  const shell = document.createElement("div");
  shell.className = "demo-shell";
  mount.appendChild(shell);

  const header = document.createElement("div");
  header.className = "demo-shell-header";
  header.appendChild(createBrandLockup());

  const headerActions = document.createElement("div");
  headerActions.className = "demo-shell-header-actions";
  header.appendChild(headerActions);

  shell.appendChild(header);

  const viewport = document.createElement("div");
  viewport.className = "demo-shell-viewport";
  shell.appendChild(viewport);

  const canvas = document.createElement("canvas");
  canvas.id = "terrain-canvas";
  canvas.className = "demo-viewport-canvas";
  viewport.appendChild(canvas);

  const footer = document.createElement("div");
  footer.className = "demo-shell-footer";
  shell.appendChild(footer);

  const leftPanel = document.createElement("div");
  applyPanelStyles(leftPanel, "left");
  document.body.appendChild(leftPanel);

  const featurePanel = document.createElement("div");
  applyPanelStyles(featurePanel, "right");
  document.body.appendChild(featurePanel);

  return {
    canvas,
    headerActions,
    footer,
    leftPanel,
    featurePanel,
  };
}

export function createLeftPanelMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-left-panel";
  return wrap;
}

export function createFeaturePanelMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-feature-panel";
  return wrap;
}

export function createFooterMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-footer-status";
  return wrap;
}

export function createHeaderActionsMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-header-actions";
  return wrap;
}

function applyPanelStyles(panel: HTMLDivElement, side: "left" | "right"): void {
  panel.className = `demo-panel demo-panel-${side}`;
  panel.style.position = "fixed";
  panel.style.top = "var(--editor-header-height, 40px)";
  panel.style[side] = "0";
  panel.style.width = side === "left" ? "320px" : "280px";
  panel.style.bottom = "var(--editor-footer-height, 28px)";
  panel.style.maxHeight = "none";
  panel.style.overflowY = "auto";
  panel.style.overflowX = "hidden";
  panel.style.padding = "12px 8px";
  panel.style.zIndex = "10";
  panel.style.userSelect = "none";
  panel.style.boxSizing = "border-box";
}

function createBrandLockup(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "demo-brand-wrap";

  const brand = document.createElement("div");
  brand.className = "demo-brand";

  const iconSlot = document.createElement("div");
  iconSlot.className = "demo-brand-current";
  iconSlot.appendChild(createTerrarIcon());
  brand.appendChild(iconSlot);

  const label = document.createElement("span");
  label.className = "demo-brand-name";

  const initial = document.createElement("span");
  initial.className = "demo-brand-name-initial";
  initial.textContent = "T";
  label.appendChild(initial);

  const suffix = document.createElement("span");
  suffix.className = "demo-brand-name-suffix";
  suffix.textContent = "ERRAR";
  label.appendChild(suffix);

  brand.appendChild(label);

  wrap.appendChild(brand);

  return wrap;
}

function createTerrarIcon(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "demo-brand-icon");

  const frame = document.createElementNS(namespace, "rect");
  frame.setAttribute("x", "3");
  frame.setAttribute("y", "3");
  frame.setAttribute("width", "18");
  frame.setAttribute("height", "18");
  frame.setAttribute("rx", "2");
  frame.setAttribute("fill", "#101419");
  frame.setAttribute("stroke", "#2f3a44");
  frame.setAttribute("stroke-width", "1");
  svg.appendChild(frame);

  appendMonogramVariant(svg, namespace);

  return svg;
}

function appendMonogramVariant(svg: SVGSVGElement, namespace: string): void {
  const monogram = document.createElementNS(namespace, "path");
  monogram.setAttribute(
    "d",
    "M8 6 H16 V8 H13.2 V10.2 H17 V12 H12.8 V15 H10.3 V12 H7 V10.2 H10.8 V8 H8 Z",
  );
  monogram.setAttribute("fill", "#d8e4ef");
  svg.appendChild(monogram);

  const strata = document.createElementNS(namespace, "path");
  strata.setAttribute("d", "M7 16.95 C8.8 16.25 10.1 16.15 11.9 16.55 C13.8 17.05 15.1 17.05 17 16.45");
  strata.setAttribute("fill", "none");
  strata.setAttribute("stroke", "#5b748a");
  strata.setAttribute("stroke-width", "1.1");
  strata.setAttribute("stroke-linecap", "square");
  strata.setAttribute("stroke-linejoin", "miter");
  svg.appendChild(strata);

  const accentBase = document.createElementNS(namespace, "path");
  accentBase.setAttribute("d", "M7.2 18.05 C8.9 17.45 10.2 17.35 11.9 17.75 C13.7 18.15 15 18.15 16.8 17.55");
  accentBase.setAttribute("fill", "none");
  accentBase.setAttribute("stroke", "#64b5f6");
  accentBase.setAttribute("stroke-width", "1");
  accentBase.setAttribute("stroke-linecap", "square");
  accentBase.setAttribute("stroke-linejoin", "miter");
  svg.appendChild(accentBase);
}
