export interface DemoShell {
  readonly canvas: HTMLCanvasElement;
  readonly leftPanel: HTMLDivElement;
  readonly featurePanel: HTMLDivElement;
}

export function createDemoShell(): DemoShell {
  const mount = document.getElementById("app");

  if (!mount) {
    throw new Error("Missing #app mount element.");
  }

  const canvas = document.createElement("canvas");
  canvas.id = "terrain-canvas";
  mount.appendChild(canvas);

  const leftPanel = document.createElement("div");
  applyPanelStyles(leftPanel, "left");
  document.body.appendChild(leftPanel);

  const featurePanel = document.createElement("div");
  applyPanelStyles(featurePanel, "right");
  document.body.appendChild(featurePanel);

  return {
    canvas,
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

function applyPanelStyles(panel: HTMLDivElement, side: "left" | "right"): void {
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style[side] = "16px";
  panel.style.width = side === "left" ? "320px" : "280px";
  panel.style.maxHeight = "calc(100vh - 88px)";
  panel.style.overflowY = "auto";
  panel.style.overflowX = "hidden";
  panel.style.padding = "12px";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
  panel.style.borderRadius = "12px";
  panel.style.background = "rgba(6, 10, 15, 0.78)";
  panel.style.color = "#f4edc9";
  panel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
  panel.style.zIndex = "10";
  panel.style.userSelect = "none";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.boxSizing = "border-box";
}
