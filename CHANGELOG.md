# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-30

### Added

- `getChartUrl` / `getChart`: resolve a chart to its current PDF on aim.naviair.dk by file name, display title
  (`EKCH RNP RWY 22R – 2`), `{ icao, chart }`, or an old/stale NAVIAIR URL.
- `getAerodromeCharts`: all current AD 2 / AD 3 charts for an aerodrome or heliport.
- `searchCharts`: free-text search, same as the aim.naviair.dk search box.
- `publication` option to choose between AIP Danmark, VFR Flight Guide, AIP Færøerne, AIP Grønland, AIC A/B and DQR.
- Picks the version in effect when NAVIAIR lists several (AIRAC changeover), based on `publishAt`/`unpublishAt`.
- `NaviairClient` with configurable base URL, `fetch`, cache TTL and clock; `crawl()` to walk the whole tree.
- Bundled `catalogue` snapshot of all chart names and folders (1,228 charts, 186 folders).
- `naviair-charts/server`: `createHandler` / `startServer` redirect server with permanent links
  (`/charts/EKCH/ADC` → 302 to the current PDF).
- `naviair-charts` CLI: `url`, `info`, `aerodrome`, `search`, `serve`.

[0.1.0]: https://github.com/bjerrecs/naviair-charts/releases/tag/v0.1.0
