# Thymer Cadence

Thymer Cadence turns a standard `Daily Notes` journal into a cadence system with optional weekly, monthly, quarterly, and yearly notes. One global plugin, `Cadence Control`, handles setup, collection adoption or creation, runtime repair, and shared workspace settings.

Built for [Thymer](https://thymer.com/) with the [Thymer Plugin SDK](https://github.com/thymerapp/thymer-plugin-sdk).

## What It Does

- Upgrades the chosen `Daily Notes` journal in place
- Adds compact `W##`, month, quarter, and year links to the Daily Notes top nav
- Extends the Daily Notes top calendar popup with period jumps and week links
- Supports optional `Weekly Notes`, `Monthly Notes`, `Quarterly Notes`, and `Yearly Notes`
- Creates a new period collection or adopts an existing one from one settings panel
- Repairs managed plugin code, collection fields, and views from one command
- Uses hidden `period_start` and `period_key` metadata for chronological ordering
- Drives a native `Upcoming` task section on period pages, scoped to the open record and carrying overdue tasks forward

## Commands

- `Cadence: Settings`
- `Cadence: Repair Workspace`

## Requirements

- A Thymer workspace with plugin editing access
- One journal collection to use as `Daily Notes`

## Setup in Thymer

1. Open Thymer and go to `Plugins`.
2. Create or open the global plugin `Cadence Control`.
3. Paste `cadence-control/plugin.json` into **Configuration**.
4. Paste `cadence-control/plugin.js` into **Custom Code**.
5. Save the plugin.
6. Open Command Palette and run `Cadence: Settings`.
7. Pick your `Daily Notes` journal collection.
8. Turn weekly, monthly, quarterly, or yearly notes on or off.
9. For each period type that is on, choose an existing collection or create a new one.
10. Click `Save & Repair`.

`Cadence Control` manages the runtime code for `daily-note/` and `periodic-notes/`. End users do not install those runtime files by hand.

## How Cadence Works

- `Cadence Control` stores the shared workspace config and provisions managed collections
- `Daily Notes` keeps Thymer's journal flow and adds cadence links to the top nav and top date popup
- Period note collections share one runtime with period-specific `plugin.json` variants
- Period collections keep `period_start` and `period_key` hidden from the normal UI
- Period views sort by `period_key` in descending order
- Title formats use a small Moment-style token subset

## Title Format Tokens

- `GGGG`, `YYYY`, `YY`
- `M`, `MM`, `MMM`, `MMMM`
- `Q`
- `W`, `WW`
- Square brackets for literal text, such as `GGGG-[W]WW`

Examples:

- Weekly: `GGGG-[W]WW` -> `2026-W12`
- Monthly: `MMM YYYY` -> `Mar 2026`
- Quarterly: `YYYY-[Q]Q` -> `2026-Q1`
- Yearly: `YYYY` -> `2026`

## Repository Layout

- `cadence-control/` - global setup and repair plugin
- `daily-note/` - Daily Notes runtime source
- `periodic-notes/` - shared runtime source for weekly, monthly, quarterly, and yearly notes
- `scripts/build-control-plugin.mjs` - bundles the runtime sources into `cadence-control/plugin.js`
- `tasks/` - project notes from active development sessions

## Development

1. Edit `cadence-control/plugin.template.js` for control-plane logic and the settings panel.
2. Edit `daily-note/plugin.js`, `daily-note/plugin.css`, and `daily-note/plugin.json` for Daily Notes runtime work.
3. Edit `periodic-notes/plugin.js`, `periodic-notes/plugin.css`, and the `periodic-notes/plugin.*.json` files for period-note runtime work.
4. Rebuild the installable global plugin:

```bash
node scripts/build-control-plugin.mjs
```

5. Check the generated bundle when needed:

```bash
node --check cadence-control/plugin.js
```

## Contributing

- Open an issue or discussion for larger product or UX changes.
- Keep the settings panel native to Thymer: lean on `form-field-group`, `form-field`, `form-field-row`, `text-details`, and native `form-input` controls.
- Rebuild `cadence-control/plugin.js` before opening a pull request.
- Keep `README.md` current when setup, commands, or runtime behavior changes.

## License

No license file is present in this repo today.
