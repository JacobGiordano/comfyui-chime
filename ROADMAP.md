# ComfyUI-Chime Roadmap

Living checklist for UX improvements, small features, and maintenance work.

## How To Use This

- Mark items complete as we ship them.
- Reword, reorder, split, or delete items as priorities change.
- Keep `README.md` focused on current behavior and use this file for forward-looking work.

## Now

- [x] Add a node-level preview button so users can audition sounds without running the whole workflow
- [x] Add clearer in-app feedback for blocked audio and unresolved custom sounds
- [x] Raise the built-in synth loudness ceiling so max volume feels more usable

## Next

- [x] Improve custom sound discoverability in the node UI
  Notes: make repo-local options and absolute-path support more obvious when `sound=custom`.
- [x] Add optional overlap behavior for repeated triggers
  Notes: likely modes are interrupt, queue, or allow overlap.
- [x] Add a short troubleshooting pass for runtime differences between ComfyUI Web and ComfyUI Desktop
  Notes: focus on audio unlock, codec support, and custom file behavior.

## Later

- [x] Add a `cooldown_ms` input to suppress repeated chimes in bursty graphs
- [x] Add built-in sound modifiers such as pitch or playback character for synthesized tones
- [x] Bundle a few polished default sound files in `sounds/` as ready-to-use examples
- [x] Expose a clearer “resolved source” hint for the selected sound
  Notes: built-in synth, repo-local file, or tokenized absolute-path route.

## Technical UX Debt

- [x] Add lifecycle cleanup for `CUSTOM_SOUND_TOKENS` so stale absolute-path tokens do not accumulate forever
- [x] Document tokenized absolute-path behavior a bit more clearly
- [ ] Improve failure messaging around unsupported-but-present audio files

## Notes

- Preserve receiver-only behavior unless we intentionally decide otherwise.
- Keep changes compatible with both ComfyUI Web and ComfyUI Desktop where practical.
- Prefer small, surgical UX wins over broad refactors.
