# Changelog

## [1.2.1](https://github.com/chrischall/mcp-connector/compare/v1.2.0...v1.2.1) (2026-07-28)


### Bug Fixes

* a revealed field must be required on the script path too ([#26](https://github.com/chrischall/mcp-connector/issues/26)) ([bebe3e6](https://github.com/chrischall/mcp-connector/commit/bebe3e6473a89a8cf9b0d7085783cb6de857a0d7))
* multi-step logins were unreachable — every field rendered `required` ([#23](https://github.com/chrischall/mcp-connector/issues/23)) ([4eae426](https://github.com/chrischall/mcp-connector/commit/4eae42645bbd1d9cd396bc1fc2a215b92249553b))

## [1.2.0](https://github.com/chrischall/mcp-connector/compare/v1.1.1...v1.2.0) (2026-07-28)


### Features

* preserveFieldsOnError — submit via fetch so a rejection keeps the form ([#19](https://github.com/chrischall/mcp-connector/issues/19)) ([23f633d](https://github.com/chrischall/mcp-connector/commit/23f633d2c377ea69650600877aab53b2f2242219))


### Bug Fixes

* guard focus when a connector declares no fields ([#22](https://github.com/chrischall/mcp-connector/issues/22)) ([9f8101c](https://github.com/chrischall/mcp-connector/commit/9f8101c6cd4318d7076d3b715667397566875558))

## [1.1.1](https://github.com/chrischall/mcp-connector/compare/v1.1.0...v1.1.1) (2026-07-26)


### Bug Fixes

* **deps:** widen the agents peer range to accept 0.19 ([#11](https://github.com/chrischall/mcp-connector/issues/11)) ([4452035](https://github.com/chrischall/mcp-connector/commit/445203589cdfaa68fd7becf7dfcf192827126f85))

## [1.1.0](https://github.com/chrischall/mcp-connector/compare/v1.0.0...v1.1.0) (2026-07-19)


### Features

* support zero-auth connectors for public services ([#7](https://github.com/chrischall/mcp-connector/issues/7)) ([c32432e](https://github.com/chrischall/mcp-connector/commit/c32432e3028c84385efc05a12fc742ce0c01b825))


### Bug Fixes

* **ci:** publish via npm Trusted Publisher instead of an unset token ([#5](https://github.com/chrischall/mcp-connector/issues/5)) ([ea3b054](https://github.com/chrischall/mcp-connector/commit/ea3b054fc35465ba8ede0ace6e7b6ddc89bf719c))

## 1.0.0 (2026-07-19)


### ⚠ BREAKING CHANGES

* require workers-oauth-provider 0.8.x ([#2](https://github.com/chrischall/mcp-connector/issues/2))

### Features

* extract @chrischall/mcp-connector as a standalone package ([10bb543](https://github.com/chrischall/mcp-connector/commit/10bb543f5d23e38474a1584b7d79393d90787e1e))
* require workers-oauth-provider 0.8.x ([#2](https://github.com/chrischall/mcp-connector/issues/2)) ([db6718e](https://github.com/chrischall/mcp-connector/commit/db6718e74e8878cd157e302a818293de28f4e118))
