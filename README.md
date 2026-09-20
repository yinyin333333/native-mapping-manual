# Native Mapping configuration manual

An English static manual for Native Mapping, with twelve chapters, explanatory diagrams, reference tables, eight worked example pages and twelve complete TOML examples. It includes map selection, repeatable Level regeneration and whole-group replacement, recipe modifiers, density and stats, auras, supplemental Treasure Classes, HUD setup and TCP/IP behavior. There are no simulators or configuration controls.

## Local preview

Run `npm run dev`, then open <http://127.0.0.1:4173/native-mapping-manual/>. The preview listens only on loopback. No package installation or site build is required. `index.html` also opens directly, and all assets use relative paths.

## Files and sources

`index.html` explains the plugin, its objects and lifecycle, feature details, installation and configuration before introducing the examples. `guides/` contains eight supporting worked examples. `assets/style.css` supplies responsive and print layouts. `assets/app.js` adds syntax highlighting, copy feedback, current-chapter navigation and disclosure handling. All prose and examples remain available without JavaScript.

The twelve files in `examples/` are teaching configurations, not shipped defaults. Each requires the matching effective game data described in the manual. Displayed excerpts identify their complete download context.

Content is grounded in the plugin's source: `FEATURES_AND_USAGE_KO.md`, the modder guides, runtime configuration parser, map resolver, display builder, native runtime and progression code, CMake settings and supplied HUD layouts. Source parsing proves accepted configuration and deterministic resolution; it does not prove gameplay or TCP/IP execution.

## Checks

- `npm test`: document links, local assets, privacy and preview access boundaries.
- `npm run test:browser`: rendering at desktop and mobile widths, keyboard disclosures, anchors, exact copying, no-script reading and external-resource checks, using an isolated Chromium profile.
- `npm run verify:source -- --source <source-root>`: compiles the original `mapping_core` into this manual's ignored `.test-output/` directory, then parses all twelve complete files and all seven context-merged excerpts. The first file's resolved map and HUD text are also checked. Requires CMake, Visual Studio 2022 C++20/x64, Python 3.11+ and an existing toml++ checkout; use `--toml <checkout>` if necessary.

Reports and screenshots are kept under `.test-output/`, which the preview server does not serve. The verifier records source hashes before and after its checks. No plugin installation, deployment or game launch is performed by these commands.

## Installation and data examples

The installation chapter includes effective-data ID lookup, complete CubeMain field assignments, variant-specific HUD merge instructions and a first-run procedure. The effects chapter explains parameterized stat layers with a context-checked single-skill example.

`examples/cubemain-mapping-rows.tsv` contains a reference-schema header and two insertion rows, not a replacement game table. `examples/hud-standard-node.json` and `examples/hud-hd-node.json` are single child objects to merge into the matching layouts, not complete layouts. The source verifier checks both JSON objects against the plugin’s source layouts and the displayed snippets. Game files are not modified by these examples or checks.

## Regeneration build

The current behavior is based on the reset source tree’s `evidence/RESET_IMPLEMENTATION.md` and `evidence/reset-build.json`; those implementation records take precedence over historical analysis or stale passages in older guides. The web manual retains its version-free presentation. Host and Join must both use the same regeneration-capable build and matching configuration/data; old protocol peers are not compatible. TOML keys and values are unchanged.

Current plugin outputs are `out-reset/bin/NativeMapping.dll` and `out-reset/package`. Do not select copied older output folders. Run the source verifier with `--source <reset-source-root>`; it builds only the configuration checker under `.test-output/native-reset`.

The implementation receipt records Release x64, 3/3 related CTest checks and artifact validation. After that receipt, the user reported successful level regeneration in a gameplay test. This is a bounded user observation, not verification of every Level, Host/Join combination, or quest/event reset. This manual update does not run or deploy the plugin.
