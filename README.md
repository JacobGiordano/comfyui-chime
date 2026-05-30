# ComfyUI-Chime

Receiver-only ComfyUI custom node that plays a frontend sound when execution reaches the node.

## Features

- Receiver-only `Chime` node
- No outputs and no passthrough
- No global notifications
- No TTS
- Frontend audio playback driven by a Python-emitted event
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

#### Good to know

- Using a filename from `sounds/` is still the most portable option.
- Using an absolute local path is convenient, but it is machine-specific and may not work the same way if you move the workflow to another computer or OS.
- For repo-local filenames, a restart or refresh helps the dropdown discover new files.
- For absolute local paths entered into `custom_sound`, dropdown discovery is not required because the backend resolves the file at execution time.

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
