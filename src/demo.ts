import { createTerrainDemo } from "./demo/createTerrainDemo";
import { initializeDemoBridge } from "./demo/demoBridge";
import { createDemoShell } from "./demo/demoShell";

export * from "./demo/demoBridge";

const { canvas, headerActions, footer, leftPanel, featurePanel } = createDemoShell();
const demo = createTerrainDemo(canvas);

initializeDemoBridge({
  demo,
  headerActions,
  footer,
  panel: leftPanel,
  featurePanel,
});
