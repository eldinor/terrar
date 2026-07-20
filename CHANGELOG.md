# Changelog

Notable changes to `terrar` are documented here.

## [0.2.0] - 2026-07-20 (alpha)

### Added

- Browser Terrain Editor Mode with an `E` shortcut and dedicated editor controls.
- Live circular-brush Raise, Lower, and Smooth sculpting with radius, strength, and hardness controls.
- Persistent brush and rectangle selections with Add, Subtract, Select All, Clear, and Apply operations.
- Terrain edit undo/redo with one sculpt drag, selection application, or whole-world smoothing operation stored as one command.
- Public `TerrainEditSession` API with stroke lifecycle, selection operations, edited-terrain access, subscriptions, and up to 100 sparse history patches.
- Terrain-following brush cursor and translucent cyan selection visualization.
- Dedicated editor navigation: right-drag orbit, middle-drag pan, and wheel zoom.
- `World Smoothing` panel under World Features with strength, pass count, optional automatic feature refresh, and a `Smooth World` action.
- `Refresh World Features` action for regenerating rivers, lakes/water, resources, POIs, roads, and foliage from edited elevations.
- Worker-based edited-terrain refresh that preserves authored heights and rejects stale refresh results.
- Terrain Editor Mode user guide covering controls, refresh requirements, rebuild behavior, and exports.

### Changed

- Sculpting updates only affected chunks and adjacent seam-normal chunks instead of rebuilding the complete terrain during a drag.
- All LOD meshes, bounds, normals, and the shared terrain material update after terrain edits.
- Terrain material invalidation now occurs after completed strokes, selection applications, undo, redo, and whole-world smoothing.
- Feature-refresh status is based on the authoritative edit revision and current World Features configuration.
- World-feature refresh now uses current POI, road, density, spacing, river, and foliage settings and restores enabled feature visibility after the terrain swap.
- Terrain-bundle and heightmap browser exports use edited terrain and wait for pending synchronization.
- The Editor Mode header displays the package version followed by `alpha`.

### Fixed

- React `Maximum update depth exceeded` failures caused by publishing a snapshot synchronously for every sculpt stamp.
- Rapid sculpt re-entry before the previous stroke commit completed.
- Terrain camera input conflicts that previously rotated or panned instead of editing.
- Missing editor picks caused by the Babylon `Ray` side-effect module not being imported.
- Grass and terrain textures appearing as flat brown material after local height updates.
- Brown stitching along chunk borders caused by recomputing visible surface normals together with skirt geometry.
- Selection overlay remaining visible after switching from Select to Sculpt workflow.
- Empty roads and settlements after smoothing when refresh used stale feature flags or preserved disabled visibility.
- Refresh-pending status remaining visible after a successful world-feature update.
