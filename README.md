# ComfyUI-Chime

Receiver-only ComfyUI custom node that plays a frontend sound when execution reaches the node.

## Disclosure

This project was developed with substantial help from OpenAI Codex. The code, docs, and iteration work in this repository were heavily AI-assisted rather than written entirely by hand.

## Features

- Receiver-only `Chime` node
- Separate `Chime Synth` helper node for user-designed synth configs
- No outputs and no passthrough
- No global notifications
- No TTS
- Frontend audio playback driven by a Python-emitted event
- Node-level `Preview sound` button for faster tuning
- `Chime Synth` preview plus browser-local preset save/delete
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
- `volume`: float from `0.0` to `2.0`
- `cooldown_ms`: minimum time in milliseconds before the same node will play again
- `playback_mode`: choose how repeated triggers behave: `interrupt`, `overlap`, or `queue`

### Optional Inputs

- `synth_config`: optional `CHIME_SYNTH_CONFIG` input from `Chime Synth`

When `sound` is set to a built-in option, the node keeps `custom_sound` as an optional field. When `sound` is set to `custom`, the node UI shows more explicit guidance for repo-local filenames and absolute local paths.

The node also shows a read-only resolved-source hint so you can tell whether the current selection will use a built-in sound, a discovered repo-local file from `sounds/`, a manually entered repo-local filename, or an absolute local file path. When `synth_config` is connected, that hint also names the connected saved synth sound or custom synth sound, and when a custom file is selected at the same time it makes that precedence explicit too.

When `synth_config` is connected, `Chime` will use that synth design at execution time after checking for a resolvable custom file. The playback order is:

- valid custom file
- connected `synth_config`
- existing built-in `sound`

### Common Setups

#### 1. Simple built-in chime

- Add `Chime` wherever you want a notification to fire in the workflow
- Leave `synth_config` disconnected
- Pick a built-in `sound`
- Use `Preview sound` to audition it

#### 2. Custom file playback

- Add `Chime`
- Set `sound=custom`
- Enter either a repo-local filename from `sounds/` or an absolute local path in `custom_sound`
- Use `Preview sound` to confirm the file resolves in your current ComfyUI environment

#### 3. Synth-designed chime

- Add `Chime Synth`
- Design or randomize the synth sound, then optionally save it as a preset
- Connect `Chime Synth.synth_config` to `Chime.synth_config`
- Leave `Chime` focused on receiver behavior: choose a built-in fallback sound if you want one, and use `sound=custom` only when you actually want custom-file precedence
- Use `Preview synth` on `Chime Synth` to audition the synth sound directly, or `Preview sound` on `Chime` to verify the connected receiver path
- Use `Chime Synth.speed` if you want that synth sound to play faster or slower

### Example Workflow

An importable starter layout is included at [examples/chime-setup-examples.json](/Users/jacobgiordano/Documents/_coding/comfyui-custom-nodes/comfyui-chime/examples/chime-setup-examples.json).

- It includes one standalone `Chime` using a built-in sound
- It includes one `Chime Synth -> Chime.synth_config` pairing
- It is meant as a setup reference, so you still need to connect each `Chime.trigger` input into your own runnable workflow at the point where you want the notification to fire

## Helper Node

- Display name: `Chime Synth`
- Python class: `ChimeSynthNode`
- Category: `utils/notifications`
- Output: `CHIME_SYNTH_CONFIG`

`Chime Synth` is the separate Phase 1 helper node for designing user presets without adding more controls to the receiver-only `Chime` node.

### Inputs

- `preset_name`: label used for the generated config and for saving/loading presets
- `saved_preset`: browser-local preset slot selector
- `waveform`: oscillator shape: `sine`, `triangle`, `square`, or `sawtooth`
- `root_pitch`: base frequency in Hz
- `pattern`: melodic shape: `single`, `double`, `up`, `down`, `major`, `minor`, or `fifth`
- `note_count`: how many notes to emit before the phrase ends; the selected pattern repeats as needed
- `speed`: playback speed for that synth sound from `0.25` to `3.0`
- `step_ms`: time between note starts
- `note_ms`: note duration
- `attack_ms`: envelope attack time
- `decay_ms`: envelope decay time
- `sustain_level`: sustain gain from `0.0` to `1.0`
- `release_ms`: envelope release time
- `volume_trim`: synth output trim from `0.0` to `2.0`

### Presets And Preview

- `Preview synth` plays the current `Chime Synth` settings directly in the frontend
- `Randomize synth` generates a new synth sound inside restrained musical ranges without auto-playing it
- `Save preset` stores the current synth design in browser-local storage for later reuse in the same ComfyUI environment, and asks before overwriting an existing preset with the same name
- `Delete preset` removes the selected saved preset from browser-local storage, with a confirmation prompt first
- Saving or deleting a preset updates the preset dropdown across other `Chime Synth` nodes in the same workflow
- Saved presets are currently UI-local convenience data for that ComfyUI environment

### Playback Modes

- `interrupt`: stop the current chime and play the newest one immediately
- `overlap`: let multiple chimes play at the same time
- `queue`: wait for the current chime to finish before playing the next one

### Playback Behavior

- `volume` on `Chime` still applies to built-in sounds and custom audio files
- Built-in sounds on `Chime` play at their intended fixed speed
- `speed` on `Chime Synth` applies anywhere that synth config is used, including receiver-side playback through `Chime`
- Custom audio files keep their original playback speed
- `volume_trim` on `Chime Synth` shapes loudness inside the generated synth sound
- Built-in sound selection on `Chime` stays intentionally simple; deeper synth shaping belongs on `Chime Synth`

### Built-In Sounds

The built-in bank now includes 15 synthesized sounds, aimed at clearer day-to-day notification use cases plus a few more obviously celebratory options:

- `chime`
- `bell`
- `soft`
- `alert`
- `tada`
- `victory`
- `pulse`
- `rise`
- `glass`
- `retro`
- `bloom`
- `knock`
- `settle`
- `beacon`
- `unlock`

Recent culls:

- `success` was removed because it overlapped too closely with `chime`
- `sparkle` was removed because it overlapped too closely with `glass`
- `mellow` was removed because it overlapped too closely with `bloom`

### Cooldown

- `cooldown_ms=0` means no suppression
- When set above `0`, repeated executions of the same node inside that window are ignored
- Cooldown applies to execution-triggered playback, not the `Preview sound` button

### Previewing Sounds

Use the node's `Preview sound` button to hear the currently selected sound without running the whole workflow.

- Built-in sounds preview immediately
- Connected synth previews respect the `speed` saved in that synth config
- Custom previews support both repo-local files in `sounds/` and absolute local paths
- Custom audio files preview at their original speed
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
├── examples/
│   └── chime-setup-examples.json
├── nodes.py
├── sounds/
└── web/
    └── chime.js
```

## Install

Clone or copy this folder into your ComfyUI `custom_nodes` directory, then restart ComfyUI.

## Notes

The backend emits a `comfyui-chime.play` event through `PromptServer`, and the frontend extension uses the Web Audio API to synthesize a few built-in notification sounds without requiring external audio files.

## Manual Verification Checklist

Use this short pass before a release or after a polish change:

1. Confirm the `Chime` node still appears under `utils/notifications`.
2. Confirm `Chime Synth` appears under `utils/notifications`.
3. Preview at least one built-in sound and confirm it plays immediately.
4. Select a discovered repo-local `custom:...` sound from `sounds/` and confirm both preview and execution playback work.
5. Set `sound=custom`, enter a repo-local filename such as `glass-tap.wav`, and confirm preview and execution playback work.
6. Set `sound=custom`, enter a valid absolute local file path, and confirm preview and execution playback work.
7. Turn `cooldown_ms` above `0` and confirm repeated execution of the same node is suppressed inside the cooldown window.
8. Check `interrupt`, `overlap`, and `queue` playback modes with quick repeated triggers so their behavior still matches the descriptions.
9. Connect `Chime Synth.synth_config` into `Chime.synth_config`, then confirm both `Preview synth` and `Preview sound` on the receiver path use the connected synth sound.
10. On `Chime Synth`, preview a custom synth sound, save it, reload it from the dropdown, and delete it again.
11. If a custom sound fails, confirm the toast message is understandable and the runtime log is concise and stage-aware when practical.

## Troubleshooting

### Node runs, but no sound plays

- Click once anywhere in ComfyUI, then try again. Some Web and Desktop environments block audio until the page receives user interaction.
- Use `Preview sound` on the node after clicking once. If preview works but graph execution does not, the issue is more likely workflow placement or trigger timing than audio support.
- Built-in synthesized sounds are the simplest baseline check. If built-ins work and a custom file does not, the problem is probably file format or file path related.
- If you are testing the louder end of the new `volume` range, increase it gradually. Settings above `1.0` are intentionally much stronger now.

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
- Warning copy now uses more consistent terms for repo-local files, absolute paths, and custom sound failures.
- Troubleshooting logs now also include the custom sound source kind when practical, such as discovered repo-local file, manual repo-local file, or absolute path.

### Connected synth path behaves unexpectedly

- Confirm `Chime Synth.synth_config` is connected to `Chime.synth_config`, not to `trigger`.
- Use `Preview synth` on `Chime Synth` first. If that does not sound right, fix the synth sound there before debugging the receiver path.
- Then use `Preview sound` on `Chime`. If the source hint names the connected saved synth sound or custom synth sound, the receiver is seeing the synth input correctly.
- If `Chime` is also pointed at a valid custom file, that custom file still takes precedence over the connected synth by design.
- If you want the connected synth to be the active path, clear the custom file setting or leave `sound` on a built-in fallback instead of a real custom file.

### Repeated triggers behave unexpectedly

- `interrupt` stops the current sound and starts the newest one immediately.
- `overlap` allows multiple sounds to stack, which can feel much louder or busier in fast workflows.
- `queue` waits for earlier sounds to finish, so rapid triggers may produce delayed playback by design.
- If you are not sure whether timing is the issue, switch to `interrupt` first while debugging.
