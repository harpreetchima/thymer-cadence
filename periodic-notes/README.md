# Thymer Cadence Periodic Notes

Reusable Thymer collection runtime for the optional weekly, monthly, quarterly, and yearly collections managed by `Cadence Control`.

- `Weekly Notes`
- `Monthly Notes`
- `Quarterly Notes`
- `Yearly Notes`

Each collection will use the same `plugin.js` with a different `plugin.json` variant.

Planned behavior:

- Weekly pages show compact nav like `Weekly Notes / < W11 >`
- Monthly pages show compact nav like `Monthly Notes / < Mar >`
- Yearly pages show compact nav like `Yearly Notes / < 2026 >`
- Navigation appears only on those specific period pages
- Weeks use ISO week numbering with Monday start
- Left and right buttons move relative to the open period record
- The center button stays tied to the current real-world period
- `Period Start` is auto-populated on create
- `Period Key` is stored as hidden sort metadata for chronological ordering across views
- `Period End` is not included yet

Current scaffold:

- `plugin.js` - shared collection runtime entry point
- `plugin.css` - popup/calendar styling for the periodic runtime
- `plugin.weekly.json` - weekly collection config
- `plugin.monthly.json` - monthly collection config
- `plugin.quarterly.json` - quarterly collection config
- `plugin.yearly.json` - yearly collection config
