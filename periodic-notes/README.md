# Periodic Notes

Reusable Thymer collection plugin for three normal collections:

- `Weekly Notes`
- `Monthly Notes`
- `Yearly Notes`

Each collection will use the same `plugin.js` with a different `plugin.json` variant.

Planned behavior:

- Weekly pages show compact nav like `Weekly Notes / < W11 >`
- Monthly pages show compact nav like `Monthly Notes / < Mar >`
- Yearly pages show compact nav like `Yearly Notes / < 2026 >`
- Navigation appears only on those specific period pages
- Weeks use ISO week numbering with Monday start
- Left and right buttons move relative to the open period record
- The center button jumps to the current real-world period, mirroring Thymer's native `Today` button behavior

Current scaffold:

- `plugin.js` - shared collection plugin entry point
- `plugin.css` - optional CSS file
- `plugin.weekly.json` - weekly collection config
- `plugin.monthly.json` - monthly collection config
- `plugin.yearly.json` - yearly collection config
