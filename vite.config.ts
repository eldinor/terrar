import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const packageEntries = {
  main: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
  builder: fileURLToPath(new URL("./src/builder.ts", import.meta.url)),
  "builder-node": fileURLToPath(new URL("./src/builder-node.ts", import.meta.url)),
  "builder-cli": fileURLToPath(new URL("./src/builder-cli.ts", import.meta.url)),
  babylon: fileURLToPath(new URL("./src/babylon.ts", import.meta.url)),
  builderCli: fileURLToPath(
    new URL("./src/builder/terrainExportCli.ts", import.meta.url)
  )
};

const packageEntryFileNames: Record<string, string> = {
  main: "main",
  builder: "builder",
  "builder-node": "builder-node",
  "builder-cli": "builder-cli",
  babylon: "babylon",
  builderCli: "builder/terrainExportCli"
};

export default defineConfig(({ mode }) => {
  const isPackageBuild = mode === "package";

  return {
    plugins: [react()],
    publicDir: isPackageBuild ? false : "public",
    build: isPackageBuild
      ? {
          emptyOutDir: true,
          lib: {
            entry: packageEntries,
            formats: ["es"],
            fileName: (_, entryName) => `${packageEntryFileNames[entryName]}.js`
          },
          rollupOptions: {
            external: [
              /^@babylonjs\//,
              /^node:/,
              "react",
              "react-dom",
              "react/jsx-runtime"
            ]
          }
        }
      : {
          outDir: "dist-demo"
        },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    },
    preview: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    },
    worker: {
      format: "es"
    }
  };
});
