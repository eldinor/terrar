import {
  DEFAULT_DEMO_RENDER_POLICY,
  createTerrainDemo,
} from "./demo/createTerrainDemo";
import { initializeDemoBridge } from "./demo/demoBridge";
import { createDemoShell } from "./demo/demoShell";

export * from "./demo/demoBridge";

const { canvas, headerActions, headerTrailingActions, footer, leftPanel, featurePanel } = createDemoShell();
const demo = createTerrainDemo(canvas, {}, {}, {
  renderPolicy: DEFAULT_DEMO_RENDER_POLICY,
});

initializeDemoBridge({
  demo,
  headerActions,
  headerTrailingActions,
  footer,
  panel: leftPanel,
  featurePanel,
});
