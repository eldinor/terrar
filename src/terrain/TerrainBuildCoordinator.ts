import { TerrainConfig } from "./TerrainConfig";
import {
  BuildWorldRequest,
  WorldBuildWorkerResponse
} from "./TerrainBuildMessages";
import { buildSerializedWorldData } from "./TerrainWorldBuild";
import { BuiltTerrain } from "../builder";
import { builtTerrainFromSerializedData } from "../builder/buildTerrain";

export class TerrainBuildCoordinator {
  private readonly worker: Worker | null;
  private readonly preferSharedSnapshot: boolean;
  private readonly pending = new Map<
    number,
    {
      config: TerrainConfig;
      resolve: (value: BuiltTerrain) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  constructor(preferSharedSnapshot = false) {
    this.preferSharedSnapshot = preferSharedSnapshot;
    if (typeof Worker === "undefined") {
      this.worker = null;
      return;
    }

    this.worker = new Worker(
      new URL("./workers/worldBuildWorker.ts", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = (event: MessageEvent<WorldBuildWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
    this.worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || "World build worker failed."));
    };
  }

  async buildTerrain(
    config: TerrainConfig,
    buildVersion: number
  ): Promise<BuiltTerrain> {
    if (!this.worker) {
      return builtTerrainFromSerializedData(
        config,
        buildSerializedWorldData(config, this.preferSharedSnapshot)
      );
    }

    const request: BuildWorldRequest = {
      type: "buildWorld",
      buildVersion,
      config,
      preferSharedSnapshot: this.preferSharedSnapshot
    };

    return new Promise<BuiltTerrain>((resolve, reject) => {
      this.pending.set(buildVersion, { config, resolve, reject });
      this.worker!.postMessage(request);
    });
  }

  dispose(): void {
    this.rejectAll(new Error("World build coordinator disposed."));
    this.worker?.terminate();
  }

  private handleWorkerMessage(message: WorldBuildWorkerResponse): void {
    const pending = this.pending.get(message.buildVersion);
    if (!pending) {
      return;
    }

    this.pending.delete(message.buildVersion);
    if (message.type === "worldBuildError") {
      pending.reject(new Error(message.message));
      return;
    }

    pending.resolve(builtTerrainFromSerializedData(pending.config, message.data));
  }

  private rejectAll(error: Error): void {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }
}
