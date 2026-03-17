# Thymer Cadence

Thymer Cadence upgrades a user's Daily Notes journal into a configurable cadence system with optional weekly, monthly, quarterly, and yearly note collections.

## What ships now

- `cadence-control/` - the global setup + orchestration plugin that users install first
- `daily-note/` - the runtime journal plugin that upgrades the selected Daily Notes collection
- `periodic-notes/` - the shared runtime for weekly, monthly, quarterly, and yearly collections
- `scripts/build-control-plugin.mjs` - generates the installable `cadence-control/plugin.js` bundle from the runtime source files

## User-facing rollout model

- Users install `Cadence Control` as a global plugin.
- On first load, Cadence prompts them to choose their Daily Notes journal collection.
- Weekly, monthly, quarterly, and yearly notes can be enabled independently from the settings panel.
- Each period type can adopt an existing collection or create a new managed collection.
- Cadence provisions the selected collections, adds required metadata fields, upgrades the Daily Notes popup, and keeps runtime plugin code in sync from shared workspace settings.

## Runtime behavior

- Daily Notes keeps the native journal experience and extends the top nav and native calendar popup.
- Weekly / Monthly / Quarterly / Yearly collections use the shared periodic runtime with a native-feeling popup calendar.
- Period collections also drive the native Thymer Related section with due-task queries scoped to the open record's timeframe, carrying overdue tasks forward.
- Disabled period types are hidden from the Daily Notes nav and rendered as non-clickable in cadence popups.
- Cadence always keeps hidden backend metadata for ordering:
  - `period_start`
  - `period_key`

## Limited title format support

Cadence supports a limited Moment-style subset for note titles:

- `GGGG`, `YYYY`, `YY`
- `M`, `MM`, `MMM`, `MMMM`
- `W`, `WW`
- literals in square brackets, e.g. `GGGG-[W]WW`

Examples:

- Weekly: `GGGG-[W]WW` -> `2026-W12`
- Monthly: `MMM YYYY` -> `Mar 2026`
- Quarterly: `YYYY-[Q]Q` -> `2026-Q1`
- Yearly: `YYYY` -> `2026`

## Development notes

- Edit the runtime sources in `daily-note/` and `periodic-notes/`.
- Edit the control-plane source in `cadence-control/plugin.template.js`.
- Rebuild the installable control plugin with:

```bash
node scripts/build-control-plugin.mjs
```

- The generated installable artifact lives at `cadence-control/plugin.js`.
