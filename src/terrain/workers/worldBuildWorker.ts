import {
  BuildWorldSuccessResponse,
  BuildWorldErrorResponse,
  SerializedWorldBuildData,
  WorldBuildWorkerRequest,
  WorldBuildWorkerResponse
} from "../TerrainBuildMessages";
import { buildSerializedWorldData } from "../TerrainWorldBuild";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorldBuildWorkerRequest>) => void) | null;
  postMessage: (
    message: WorldBuildWorkerResponse,
    transfer?: Transferable[]
  ) => void;
};

workerScope.onmessage = (event: MessageEvent<WorldBuildWorkerRequest>) => {
  const message = event.data;
  if (message.type !== "buildWorld") {
    return;
  }

  try {
    const data = buildSerializedWorldData(
      message.config,
      message.preferSharedSnapshot
    );
    const response: BuildWorldSuccessResponse = {
      type: "worldBuilt",
      buildVersion: message.buildVersion,
      data
    };
    workerScope.postMessage(
      response satisfies WorldBuildWorkerResponse,
      collectTransferables(data)
    );
  } catch (error) {
    const response: BuildWorldErrorResponse = {
      type: "worldBuildError",
      buildVersion: message.buildVersion,
      message: error instanceof Error ? error.message : String(error)
    };
    workerScope.postMessage(response satisfies WorldBuildWorkerResponse);
  }
};

function collectTransferables(data: SerializedWorldBuildData): Transferable[] {
  if (data.snapshot.shared) {
    return [];
  }
  return data.snapshot.buffer instanceof ArrayBuffer ? [data.snapshot.buffer] : [];
}

export {};
