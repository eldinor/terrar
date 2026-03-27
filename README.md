# terrar

Terrain generation, Babylon rendering, and export tooling.

## Package Surfaces

- `terrar/builder`
  - build terrain assets in memory
  - export terrain assets, maps, POIs, and roads
- `terrar/babylon`
  - render a full terrain asset into an existing Babylon scene
- `terrar/builder/node`
  - Node-only folder and zip writers for export bundles
- `terrar/builder/cli`
  - CLI helpers for config-driven terrain export
- `terrar/demo`
  - demo/bootstrap API used by the local demo app

## Core Flow

The main in-repo demo path stays in memory:

```ts
import { buildTerrain } from "terrar/builder";
import { renderTerrainAsset } from "terrar/babylon";

const terrain = buildTerrain({
  seed: "demo",
  worldMin: -512,
  worldMax: 512,
  chunksPerAxis: 8,
  chunkSize: 128,
});

const adapter = renderTerrainAsset(scene, terrain);
adapter.mount();
```

`TerrainAsset` is the canonical full runtime asset contract. The Babylon adapter expects a full terrain asset, not partial map data.

## Builder Exports

`terrar/builder` provides:

- `buildTerrain(...)`
- `buildTerrainFromConfig(...)`
- `resolveBuiltTerrainConfig(...)`
- `serializeTerrainAsset(...)`
- `deserializeTerrainAsset(...)`
- `createTerrainExportBundle(...)`
- `exportTerrainMaps(...)`
- `exportTerrainPoiData(...)`
- `exportTerrainRoadData(...)`

Map export currently includes:

- `heightmap`
- `flowMap`
- `riverMap`
- `lakeMap`
- `sedimentMap`
- `resourceMaps.coal`
- `resourceMaps.iron`
- `resourceMaps.copper`
- `combinedMaps.water`
- `combinedMaps.resources`

## Node Export Writers

Node-only disk writers live under `terrar/builder/node`.

Programmatic folder export:

```ts
import { buildTerrain } from "terrar/builder";
import { exportTerrainAssetToFolder } from "terrar/builder/node";

const terrain = buildTerrain({
  seed: "folder-export",
  worldMin: -128,
  worldMax: 128,
  chunksPerAxis: 4,
  chunkSize: 64,
});

await exportTerrainAssetToFolder(terrain, "./exports/my-terrain");
```

Programmatic zip export:

```ts
import { buildTerrain } from "terrar/builder";
import { exportTerrainAssetToZip } from "terrar/builder/node";

const terrain = buildTerrain({
  seed: "zip-export",
  worldMin: -128,
  worldMax: 128,
  chunksPerAxis: 4,
  chunkSize: 64,
});

await exportTerrainAssetToZip(terrain, "./exports/my-terrain.zip");
```

Folder output layout:

```text
my-terrain/
  manifest.json
  terrain.asset.json
  poi.json
  roads.json
  maps/
    heightmap.png
    flow.png
    river.png
    lake.png
    sediment.png
    resource-coal.png
    resource-iron.png
    resource-copper.png
    water-combined.png
    resources-combined.png
  maps-pgm/
    ...
```

## CLI Export

Build first:

```bash
npm run build
```

Folder export:

```bash
npm run export:terrain -- --config ./terrain.config.json --out ./exports/my-terrain --format folder
```

Zip export:

```bash
npm run export:terrain -- --config ./terrain.config.json --out ./exports/my-terrain.zip --format zip
```

Example config file:

```json
{
  "seed": "export-demo",
  "worldMin": -128,
  "worldMax": 128,
  "chunksPerAxis": 4,
  "chunkSize": 64,
  "features": {
    "poi": true,
    "roads": true
  }
}
```

CLI options:

- `--config <file>` path to a JSON file with `BuiltTerrainConfigOverrides`
- `--out <path>` output folder or zip file path
- `--format <folder|zip>` export format, defaults to `folder`
- `--shared` prefer shared snapshot buffers during generation

## Local Commands

```bash
npm run dev
npm run lint
npm test -- --run
npm run build
npm run docs:api
```

API docs are generated into `docs/typedoc/`.

## Apache Deploy

The build includes `dist/.htaccess` from `public/.htaccess` so Apache serves the demo with:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers are required for `SharedArrayBuffer` support in production. Make sure Apache has `mod_headers` enabled, for example:

```apache
a2enmod headers
systemctl reload apache2
```
