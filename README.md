# ComfyUI-Chime

Receiver-only ComfyUI custom node that plays a frontend sound when execution reaches the node.

## Features

- Receiver-only `Chime` node
- No outputs and no passthrough
- No global notifications
- No TTS
- Frontend audio playback driven by a Python-emitted event
- Node-level `Preview sound` button for faster tuning
- In-app feedback when audio is blocked or a custom sound cannot be resolved
- Node-level resolved-source hint so the selected sound path is easier to verify
- Lightweight failure-only logging for custom sound resolve, fetch, decode, and playback issues
- Intended to work in current ComfyUI Web and ComfyUI Desktop

## Node

- Display name: `Chime`
- Python class: `ChimeNode`
- Category: `utils/notifications`

### Inputs

- `trigger`: wildcard input used only to make the node executable in a graph
- `enabled`: enable or disable playback
- `sound`: built-in sound choice or `custom`
- `custom_sound`: filename from `sounds/` or an absolute local file path when `sound` is set to `custom`
- `volume`: float from `0.0` to `1.0`
- `pitch_shift`: semitone shift for built-in synthesized sounds from `-36.0` to `36.0`
- `tone_character`: built-in synth voicing: `default`, `warm`, `bright`, or `hollow`
- `waveform`: built-in oscillator override: `auto`, `sine`, `triangle`, `square`, or `sawtooth`
- `cooldown_ms`: minimum time in milliseconds before the same node will play again
- `playback_mode`: choose how repeated triggers behave: `interrupt`, `overlap`, or `queue`

When `sound` is set to a built-in option, the node keeps `custom_sound` as an optional field. When `sound` is set to `custom`, the node UI shows more explicit guidance for repo-local filenames and absolute local paths.

The node also shows a read-only resolved-source hint so you can tell whether the current selection will use a built-in synth voice, a repo-local file from `sounds/`, or an absolute local file path.

### Playback Modes

- `interrupt`: stop the current chime and play the newest one immediately
- `overlap`: let multiple chimes play at the same time
- `queue`: wait for the current chime to finish before playing the next one

### Built-In Sound Modifiers

- `pitch_shift` only affects the built-in synthesized sounds
- `tone_character` changes the built-in timbre without affecting custom audio files
- `waveform` can force a specific oscillator shape across the built-in sounds
- Custom sound files ignore both controls and play as-is

### Built-In Sounds

The built-in bank now includes 12 synthesized sounds:

- `chime`
- `bell`
- `soft`
- `success`
- `alert`
- `sparkle`
- `mellow`
- `pulse`
- `rise`
- `glass`
- `retro`
- `bloom`

### Cooldown

- `cooldown_ms=0` means no suppression
- When set above `0`, repeated executions of the same node inside that window are ignored
- Cooldown applies to execution-triggered playback, not the `Preview sound` button

### Previewing Sounds

Use the node's `Preview sound` button to hear the currently selected sound without running the whole workflow.

- Built-in sounds preview immediately
- Custom previews support both repo-local files in `sounds/` and absolute local paths
- If browser audio is still locked, the frontend will prompt you to click once in ComfyUI and try again

### Custom Sounds

Drop audio files into `sounds/` and restart or refresh ComfyUI. Supported extensions:

- `.mp3`
- `.wav`
- `.ogg`
- `.m4a`
- `.aac`
- `.flac`
- `.webm`
- `.aiff`
- `.aif`

This repo now ships with a small ready-to-use starter pack in `sounds/`:

- `glass-tap.wav`: short bright confirmation tap
- `soft-pop.wav`: soft low pop for subtle workflow checkpoints
- `mellow-bloom.wav`: longer gentle swell for more noticeable completions
- `arcade-ping.wav`: snappier retro-style ping

These files are intended as portable baseline examples, and they should also appear as discovered `custom:...` dropdown entries after ComfyUI reloads the node.

### Format Notes

These extensions are accepted by the node, but actual playback depends on the browser engine used by ComfyUI Web or ComfyUI Desktop.

#### Safest choices

- `.wav`: best general compatibility and the safest default for custom sounds
- `.mp3`: broadly supported and a good size/compatibility tradeoff
- `.ogg`: usually works well in Chromium-based environments, but is a little less universal than `wav` or `mp3`

#### Usually fine, but more platform-dependent

- `.m4a` / `.aac`: often work well, especially on Apple platforms, but support can vary by browser/runtime
- `.flac`: may work, but browser support is less predictable than `wav` or `mp3`
- `.webm`: support depends on the audio codec inside the container, so one `.webm` may work while another does not
- `.aiff` / `.aif`: may work in some environments, but they are not as reliable as `wav` or `mp3`, even on macOS, because playback still depends on browser/runtime codec support

#### Gotchas

- File extension acceptance is not the same as guaranteed playback. The browser/runtime still has to decode the file successfully.
- ComfyUI Desktop and ComfyUI Web may behave slightly differently depending on the embedded browser engine and OS media support.
- If a file does not play, convert it to `.wav` or `.mp3` first. That is the best fallback path.
- Very large files may start a little slower than short notification sounds.
- `.webm`, `.m4a`, and sometimes `.aac` can be container/codec-sensitive, so two files with the same extension may not behave the same way.
- `.aiff` and `.aif` are accepted by the node, but they may still fail to play in some ComfyUI environments. If you hit that, convert the file to `wav` or `mp3`.
- After adding new files to `sounds/`, restart or refresh ComfyUI so the node sees them.

You can use custom sounds in either of two ways:

- Set `sound` to `custom` and enter either:
- a filename like `ding.mp3` from `sounds/`
- or an absolute local path like `/System/Library/Sounds/Hero.aiff`
- Or, if files are present when ComfyUI loads the node, they may also appear directly in the `sound` dropdown as `custom:filename.ext`

If a previously discovered dropdown entry points to a file that has since been removed or renamed, the node now reports that more clearly instead of silently acting like the selection is still valid.

#### Good to know

- Using a filename from `sounds/` is still the most portable option.
- Using an absolute local path is convenient, but it is machine-specific and may not work the same way if you move the workflow to another computer or OS.
- For repo-local filenames, a restart or refresh helps the dropdown discover new files.
- For absolute local paths entered into `custom_sound`, dropdown discovery is not required because the backend resolves the file at execution time.
- Absolute local paths are exposed to the frontend through temporary tokenized routes instead of sending the raw filesystem path directly.
- Those temporary absolute-path tokens now expire automatically after a short idle window, and the backend also caps how many are kept around in a long-running session.

## Layout

```text
comfyui-chime/
├── __init__.py
├── nodes.py
├── sounds/
└── web/
    └── chime.js
```

## Install

Clone or copy this folder into your ComfyUI `custom_nodes` directory, then restart ComfyUI.

## Notes

The backend emits a `comfyui-chime.play` event through `PromptServer`, and the frontend extension uses the Web Audio API to synthesize a few built-in notification sounds without requiring external audio files.

## Troubleshooting

### Node runs, but no sound plays

- Click once anywhere in ComfyUI, then try again. Some Web and Desktop environments block audio until the page receives user interaction.
- Use `Preview sound` on the node after clicking once. If preview works but graph execution does not, the issue is more likely workflow placement or trigger timing than audio support.
- Built-in synthesized sounds are the simplest baseline check. If built-ins work and a custom file does not, the problem is probably file format or file path related.

### ComfyUI Web vs ComfyUI Desktop

- Both environments should work, but they may differ slightly because playback still depends on the browser engine and OS media support underneath.
- Audio unlock behavior can feel different between environments. One may allow playback sooner while the other still needs an explicit click or keypress first.
- Custom file decode support can differ a bit between environments even when the extension is accepted by the node.
- If you want the safest cross-environment path, test with a built-in sound first, then a short `wav`, then a short `mp3`.

### Custom sound does not resolve

- For repo-local files, make sure the file is inside `sounds/`.
- After adding a new repo-local file, refresh or restart ComfyUI so the dropdown can discover it.
- For absolute local paths, confirm the path exists on the current machine and points to a supported audio file.
- Absolute paths are convenient, but they are machine-specific. A workflow that works on one system may not resolve the same path on another.

### Custom sound resolves, but still does not play

- Convert the file to `wav` or `mp3` first. That is the best fallback for compatibility.
- Keep test files short while debugging. Very large files may start later and can make playback issues harder to distinguish from latency.
- If `wav` and `mp3` work but another format does not, treat that as a runtime codec limitation rather than a node failure.
- When a custom file resolves but still cannot decode or play in the current environment, the node now tries to name that specific file in the in-app warning instead of only showing a generic playback failure.
- Custom sound failures now also emit concise runtime logs so resolve, fetch, decode, and playback issues are easier to tell apart during debugging.

### Repeated triggers behave unexpectedly

- `interrupt` stops the current sound and starts the newest one immediately.
- `overlap` allows multiple sounds to stack, which can feel much louder or busier in fast workflows.
- `queue` waits for earlier sounds to finish, so rapid triggers may produce delayed playback by design.
- If you are not sure whether timing is the issue, switch to `interrupt` first while debugging.
