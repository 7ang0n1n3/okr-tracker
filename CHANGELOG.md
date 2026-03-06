# Changelog

All notable changes to OKR Tracker are documented here.

---

## [2.0.6] - 2026-03-06

### Changed (refactor)
- Extracted `getKRProgress(kr)` helper — replaces repeated `Math.min(100, Math.round(...))` expression used across rendering, snapshots, and export
- Extracted `isKRComplete(kr)` to module-level — replaces inline logic that was defined inside a template literal IIFE
- Merged `toggleKRCompleted` and `toggleCompletedObjectives` into a single `toggleCollapsible(btn)` function
- `renderObjectives` now does a single pass to split active/completed objectives, caching the progress value and passing it into `renderObjectiveCard` — eliminates double `calculateProgress` calls
- `renderObjectiveCard` KR split replaced with a single-pass loop — eliminates two redundant `.filter()` calls
- Removed IIFE from inside template literal in `renderObjectiveCard`; KR split logic moved before the `return`

---

## [2.0.5] - 2026-03-06

### Added
- **Completed status for Key Results**: New "Completed" option in the KR status dropdown (indigo badge and border)
- **KR completed accordion**: Within each objective card, KRs that are completed (status set to Completed, or progress at 100%) are moved to a collapsed accordion section at the bottom of the key results list
- **Locked controls for completed KRs**: Check-in, increase/decrease, and slider controls are disabled for completed KRs to prevent accidental edits; edit and delete remain available
- **Completed Objectives accordion**: Objectives that reach 100% progress are moved to a collapsed "Completed Objectives" section at the bottom of the page

### Fixed
- Target date and check-in date color warnings are no longer applied to KRs that are at 100% progress

---

## [2.0.4] - prior release

Initial tracked version.
