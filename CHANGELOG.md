# Changelog

All notable changes to the Drift extension are documented here.

## [0.7.2] - 2026-09-13

### Changed
- The repository is now [pallaprolus/drift](https://github.com/pallaprolus/drift); the old `drift-vscode` URL redirects. Drift is one engine with three surfaces: the VS Code extension, the `drift-docs` command-line runner, and the GitHub Action.
- The CLI is published to npm as `drift-docs` (via npm Trusted Publishing, no stored token), so `npx drift-docs` works without referencing the repository. Workflows use `pallaprolus/drift@v0`.
- README reorganized by surface.

## [0.7.1] - 2026-09-13

### Fixed
- GitHub Action: quoted values in the `args` input (for example `--exclude "**/test/**"`) are now parsed with shell quoting instead of being passed through literally, so excludes work as written.
- Releases now also move a floating `v0` tag, so workflows can use `pallaprolus/drift-vscode@v0` and pick up fixes automatically.

## [0.7.0] - 2026-09-13

### Added
- **Problems panel**: findings are published as diagnostics (source `drift`), so they show up in the Problems view, in the editor's error navigation, and to other tools. Disable with `drift.showInProblems`.
- **Ignore markers**: put `drift-ignore` on the line above a doc block (or inside it) to skip that pair, `drift-ignore-file` near the top of a file to skip the file, and `<!-- drift-ignore -->` above a fenced block in Markdown.
- **Command-line runner and GitHub Action**: `drift-check` runs the same parsers and analyzers outside the editor, prints text, Markdown, HTML, or JSON, honors `.gitignore` and reviewed items in `.drift/state.json`, and exits non-zero on drift. The `pallaprolus/drift-vscode` action wraps it for CI with a job summary.

### Fixed
- Items marked as reviewed are now remembered across sessions: a reviewed pair stays hidden until its code changes.
- Removed a leftover simulated telemetry ping and the disabled feedback prompt; the extension makes no network calls except the AI checks you trigger.

### Changed
- Description-only comments with no `@param` tags now produce a single low-severity "parameters are not documented" note instead of one medium issue per parameter, which used to stack up to "critical" for ordinary summary comments.
- Internal: parsers and analyzers no longer depend on the VS Code API, which is what makes the CLI possible.

## [0.6.2] - 2026-09-13

### Fixed
- Marketplace version and installs badges now use vsmarketplacebadges.dev; shields.io retired its Marketplace badges. Added a rating badge.

## [0.6.1] - 2026-09-12

Marketplace listing improvements, no functional changes.

### Changed
- Listed under Programming Languages, Linters, and AI (previously Linters only).
- Tags now include the supported languages and doc formats so searches like "python docstring" or "typescript jsdoc" find Drift.
- Added Marketplace, Open VSX, test-status, and license badges; gallery banner; Free pricing label.
- Releases are automated: a version bump on `main` publishes to the Marketplace and Open VSX and creates the GitHub release.

## [0.6.0] - 2026-09-07

This release completes the original roadmap.

### Added
- **README code block sync**: fenced code blocks in `README.md` and `docs/**/*.md` are checked against real code for renamed symbols, stale example signatures, wrong argument counts, and functions that no longer exist. Configure with `drift.scanMarkdown` and `drift.markdownPatterns`.
- **Git change tracking**: uses `git blame` and the working-tree diff to flag uncommitted code edits whose docs were not touched, and documentation that is older than the code by more than `drift.git.staleDays`. Toggle with `drift.git.enabled`.
- **AI semantic checks** (on demand): an **AI Check** CodeLens and two commands ask a model whether the documentation still describes the code. Works with the VS Code Language Model API (e.g. GitHub Copilot) or the Anthropic API via `Drift: Set Anthropic API Key`. Configure with `drift.ai.provider` and `drift.ai.model`. Nothing is ever sent automatically.
- **Export reports**: `Drift: Export Report` writes Markdown, self-contained HTML, or JSON. Also available from the dashboard toolbar.
- CodeLens now appears for Go, Rust, and Java files.
- `npm run test:unit` for the fast unit test suite.

### Changed
- Minimum VS Code version is now 1.90 (required for the Language Model API).
- Default `drift.supportedLanguages` now lists every language Drift can parse.
- Runtime dependencies are bundled with esbuild, so the extension package no longer ships `node_modules`.

### Fixed
- Lint errors across the codebase; the build now runs lint as part of `npm test`.

## [0.5.1] - 2025-12-12
- Handle multi-line signatures correctly.

## [0.5.0] - 2025-12-11
- Add NumPy docstring support.

## [0.4.0] - 2025-12-10
- Quick Fixes for missing and stale parameters.

## [0.3.0] - 2025-12-09
- Add Go, Rust, and Java support.

## [0.2.0] - 2025-12-02
- Initial release.
