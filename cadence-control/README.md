# Cadence Control

Global Thymer plugin that installs and manages the Cadence runtime across a user's workspace.

## Responsibilities

- ask the user which journal collection is their Daily Notes collection
- let the user enable or disable weekly, monthly, and yearly note collections independently
- let the user adopt an existing collection or create a new one for each enabled period type
- provision or repair required metadata fields and runtime plugin code
- keep the Daily Notes and periodic runtime plugins in sync from one shared workspace config

## Source of truth

- Edit `plugin.template.js` for the control-plane logic.
- Edit `../daily-note/*` and `../periodic-notes/*` for the runtime plugins.
- Rebuild `plugin.js` with `node ../scripts/build-control-plugin.mjs`.

## Installable artifact

- `plugin.js` is generated and intended for installation into Thymer.
- `plugin.json` is the config shell for the global plugin.
