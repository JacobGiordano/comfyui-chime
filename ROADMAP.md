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

## Next

- [x] Add lightweight runtime logging for custom sound failures
  Notes: shipped with concise failure-only backend/frontend logging for resolve, fetch, decode, and playback paths when practical.
- [x] Add a small manual verification checklist for release/polish passes
  Notes: documented in README with built-in playback, discovered repo-local file, manual repo-local file, absolute-path custom file, preview, cooldown, playback modes, and failure feedback checks.
- [ ] Improve custom sound path UX without reintroducing unstable layout behavior
  Notes: prefer tiny copy/placeholder wins over more custom widget complexity.

## Later

- [ ] Add a couple of additional built-in synth presets only if they fill real gaps by ear
  Notes: avoid bloating the built-in list just to add variety.
- [ ] Consider a tiny release/polish pass on naming consistency in UI copy and toasts
  Notes: keep it subtle; avoid broad refactors.
- [ ] Add optional diagnostic detail for custom-sound troubleshooting
  Notes: this could stay dev-facing if user-facing UI would get noisy.

## Notes

- Keep compatibility with ComfyUI Web and ComfyUI Desktop in mind.
- Treat browser/runtime audio quirks as product concerns, not just implementation details.
- Prefer small, surgical wins over broad UI experimentation.
