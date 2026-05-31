# ComfyUI-Chime Roadmap

Current roadmap for small features, polish passes, and maintenance work.

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

## Next

- [x] Add lightweight runtime logging for custom sound failures
  Notes: shipped with concise failure-only backend/frontend logging for resolve, fetch, decode, and playback paths when practical.
- [x] Add a small manual verification checklist for release/polish passes
  Notes: documented in README with built-in playback, discovered repo-local file, manual repo-local file, absolute-path custom file, preview, cooldown, playback modes, and failure feedback checks.
- [x] Improve custom sound path UX without reintroducing unstable layout behavior
  Notes: shipped as placeholder and source-hint copy improvements only, with no added widget/layout complexity.

## Later

- [ ] Add a couple of additional built-in synth presets only if they fill real gaps by ear
  Notes: avoid bloating the built-in list just to add variety.
- [x] Consider a tiny release/polish pass on naming consistency in UI copy and toasts
  Notes: shipped as copy-only cleanup for repo-local file, absolute-path, and custom-sound wording across toasts and warnings.
- [x] Add optional diagnostic detail for custom-sound troubleshooting
  Notes: shipped as dev-facing logging detail for discovered repo-local, manual repo-local, and absolute-path custom sound cases.

## Notes

- Keep compatibility with ComfyUI Web and ComfyUI Desktop in mind.
- Treat browser/runtime audio quirks as product concerns, not just implementation details.
- Prefer small, surgical wins over broad UI experimentation.
