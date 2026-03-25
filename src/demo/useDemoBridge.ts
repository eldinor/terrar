import { useEffect, useState, useSyncExternalStore } from "react";
import type { DemoBridge, DemoSnapshot } from "./demoBridge";

const EMPTY_SNAPSHOT: DemoSnapshot = {
  activePanelTab: "runtime",
  featurePanelMount: null,
  featurePanelState: null,
  featureStatusText: "",
  footerMount: null,
  headerActionsMount: null,
  headerTrailingActionsMount: null,
  hudText: "",
  leftPanelMount: null,
  materialTabState: null,
  presetOptions: [],
  runtimeTabState: null,
  worldTabState: null,
};

const subscribeNoop = (): (() => void) => () => {};

export function useDemoBridge(): {
  readonly bridge: DemoBridge | null;
  readonly snapshot: DemoSnapshot;
} {
  const [bridge, setBridge] = useState<DemoBridge | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("../demo").then((module) => {
      if (cancelled) {
        return;
      }

      setBridge(module as DemoBridge);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useSyncExternalStore(
    bridge ? bridge.subscribe : subscribeNoop,
    bridge ? bridge.getSnapshot : () => EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  );

  return {
    bridge,
    snapshot,
  };
}
