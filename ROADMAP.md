# ComfyUI-Chime Roadmap

Current roadmap for small features, polish passes, and maintenance work.

## Timeline Markers

- 2026-06-01: `ComfyUI-Chime` is being marked as `v1.0.0`, with the separate `Chime Synth` helper flow, lean receiver-only `Chime` behavior, docs, and example workflow considered release-ready.
- 2026-05-31: roadmap focus shifted from incremental `Chime` node polish toward a separate `Chime Synth` helper node for user-designed synth presets, while keeping built-ins separate and `Chime` lean.

## How To Use This

- Check items off as they ship.
- If an item is completed, update `README.md` in the same pass when behavior or usage changes.
- Prefer committing each checked-off roadmap item immediately after it lands.
- Preserve the receiver-only `Chime` node shape unless we intentionally decide otherwise.

## Current State

- Receiver-only `Chime` node is working
- Built-in synth bank, preview button, cooldown, playback modes, and synth modifiers are shipped
- Repo-local starter sound pack is shipped in `sounds/`
- Custom absolute-path playback uses temporary tokenized routes with cleanup
- Custom sound failure messaging is more specific than before
- Manual verification checklist is documented for release/polish passes
- Custom sound path UX now has clearer placeholder/source copy without changing layout behavior
- UI copy and toast wording are now more consistent around repo-local files, absolute paths, and custom sound errors
- Troubleshooting logs now include custom sound source-kind detail when practical
- Built-in synth options were culled for clearer differentiation, with new presets added to cover low percussive, descending, and neutral signal gaps
- The next synth-design direction is a separate `Chime Synth` helper node rather than expanding the main `Chime` node UI
- `Chime Synth` Phase 1 is now shipped as a separate helper node with synth-shaping controls, preview, and browser-local preset save/delete, while `Chime` remains unchanged in output behavior
- Built-in sounds now include a few more clearly notification-oriented and celebratory choices, including `tada`, `victory`, and `unlock`

## Next

- [x] Add lightweight runtime logging for custom sound failures
  Notes: shipped with concise failure-only backend/frontend logging for resolve, fetch, decode, and playback paths when practical.
- [x] Add a small manual verification checklist for release/polish passes
  Notes: documented in README with built-in playback, discovered repo-local file, manual repo-local file, absolute-path custom file, preview, cooldown, playback modes, and failure feedback checks.
- [x] Improve custom sound path UX without reintroducing unstable layout behavior
  Notes: shipped as placeholder and source-hint copy improvements only, with no added widget/layout complexity.
- [x] Add a separate `Chime Synth` helper node for saved user-designed synth presets
  Notes: Phase 1 shipped with waveform, root pitch, pattern, timing, ADSR, volume trim, preview, and browser-local preset save/delete, while leaving built-ins separate and `Chime` lean.
- [x] Let `Chime` consume an optional synth config input from `Chime Synth`
  Notes: shipped with explicit optional `synth_config` input on `Chime`; custom file playback still takes precedence over synth config playback.

## Later

- [x] Add a couple of additional built-in synth presets only if they fill real gaps by ear
  Notes: shipped alongside a cull of overly similar built-ins; added more distinct low percussive, descending, neutral, celebratory, and notification-style presets instead of expanding the list blindly.
- [x] Consider a tiny release/polish pass on naming consistency in UI copy and toasts
  Notes: shipped as copy-only cleanup for repo-local file, absolute-path, and custom-sound wording across toasts and warnings.
- [x] Add optional diagnostic detail for custom-sound troubleshooting
  Notes: shipped as dev-facing logging detail for discovered repo-local, manual repo-local, and absolute-path custom sound cases.

## Notes

- Keep compatibility with ComfyUI Web and ComfyUI Desktop in mind.
- Treat browser/runtime audio quirks as product concerns, not just implementation details.
- Prefer small, surgical wins over broad UI experimentation.
