# Journal Notes for Thymer

Working repo for extending Thymer's native `Daily Note` into a broader periodic notes flow.

Current direction:

- Keep `Daily Note` as a real journal plugin by extending `JournalCorePlugin`.
- Add compact native-style shortcuts for the matching week, month, and year records on daily pages.
- Use normal collections for `Weekly Notes`, `Monthly Notes`, and `Yearly Notes`.
- Use ISO weeks with Monday start.

Compact nav labels:

- Week: `W11`
- Month: `Mar`
- Year: `2026`

Target UI:

- Daily Note page: existing native top nav row above the title, extending `Daily Note / < Today >` with `W11`, `Mar`, and `2026` buttons for the matching period records.
- Weekly page: native collection row with the collection name, the active view button, and compact period nav (example while the current week is open: `Weekly Notes / < W11 >`).
- Monthly page: native collection row with compact month nav (example: `Monthly Notes / < Mar >`).
- Yearly page: native collection row with compact year nav (example: `Yearly Notes / < 2026 >`).

Current behavior:

- Daily buttons open or create the matching week, month, and year records for the viewed day.
- Period pages use left and right buttons relative to the open record.
- The center button follows Thymer's native `Today` pattern: it jumps to the current real-world week, month, or year, so on an older or future period page it may differ from the page title.

Repo layout:

- `daily-note/` - local working copy of the existing Daily Note journal plugin
- `periodic-notes/` - reusable collection plugin for weekly, monthly, and yearly collections

Status:

- Repo scaffolded
- Architecture decisions captured
- Production logic not implemented yet
