import { createTerrainDemo } from "./demo/createTerrainDemo";
import { initializeDemoBridge } from "./demo/demoBridge";
import { createDemoShell } from "./demo/demoShell";

export * from "./demo/demoBridge";

const { canvas, leftPanel, featurePanel } = createDemoShell();
const demo = createTerrainDemo(canvas);

initializeDemoBridge({
  demo,
  panel: leftPanel,
  featurePanel,
});
