# Native Mapping configuration manual

An English static manual for Native Mapping, with thirteen chapters, explanatory diagrams, reference tables, eleven worked example pages and sixteen complete TOML examples. It includes map selection, repeatable Level regeneration and whole-group replacement, recipe modifiers, per-Level monster pools, random SuperUniques, density and stats, auras, supplemental Treasure Classes, HUD setup and TCP/IP behavior. There are no simulators or configuration controls.

## Local preview

Run `npm run dev`, then open <http://127.0.0.1:4173/native-mapping-manual/>. The preview listens only on loopback. No package installation or site build is required. `index.html` also opens directly, and all assets use relative paths.

## Manual files

`index.html` explains the plugin, its objects and lifecycle, feature details, installation and configuration before introducing the examples. `guides/` contains eleven supporting worked examples. `assets/style.css` supplies responsive and print layouts. `assets/app.js` adds syntax highlighting, copy feedback, current-chapter navigation and disclosure handling. All prose and examples remain available without JavaScript.

The sixteen TOML files in `examples/` are teaching configurations, not shipped defaults. Each requires the matching effective game data described in the manual. Displayed excerpts identify their complete download context.

## Checks

- `npm test`: document links, local assets, privacy and preview access boundaries.
- `npm run test:browser`: rendering at desktop and mobile widths, keyboard disclosures, anchors, exact copying, no-script reading and external-resource checks, using an isolated Chromium profile.

Reports and screenshots are kept under `.test-output/`, which the preview server does not serve.

## Installation and data examples

The installation chapter includes effective-data ID lookup, complete CubeMain field assignments, plugin HUD installation, appearance settings for PC and controller, and a first-run procedure. The effects chapter explains parameterized stat layers with a single-skill example.

`examples/cubemain-mapping-rows.tsv` contains a reference-schema header and two insertion rows, not a replacement game table. `examples/hud-standard-node.json` and `examples/hud-hd-node.json` show the complete standard and HD HUD files supplied in `d2rl-native-mapping.mpq`.

## Current feature coverage

The monster chapter walks mod authors through editing an existing group, replacing pools, adding a boss without changing ordinary monsters, setting its chance, and running the map again. `map-monsters.toml` provides a complete Level 39 example with `zombie1` and `Frozenstein` at 100%.

The expanded examples include a full 25-group / 83-trait pool, five regions with distinct trait pools, and an isolated player All Skills check. Each has a guide and a matching complete download. The full pool preserves its reference configuration; it is not a guarantee that every listed stat affects every monster.
