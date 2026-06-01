from __future__ import annotations

import logging
import mimetypes
import secrets
import time
from collections import OrderedDict
from pathlib import Path

from aiohttp import web
from server import PromptServer


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


ANY_TYPE = AnyType("*")

PACKAGE_DIR = Path(__file__).resolve().parent
SOUNDS_DIR = PACKAGE_DIR / "sounds"
SOUND_CHOICES = [
    "chime",
    "bell",
    "soft",
    "alert",
    "pulse",
    "rise",
    "glass",
    "retro",
    "bloom",
    "knock",
    "settle",
    "beacon",
]
CUSTOM_SOUND_OPTION = "custom"
PLAYBACK_MODE_CHOICES = ["interrupt", "overlap", "queue"]
TONE_CHARACTER_CHOICES = ["default", "warm", "bright", "hollow"]
WAVEFORM_CHOICES = ["auto", "sine", "triangle", "square", "sawtooth"]
SYNTH_WAVEFORM_CHOICES = ["sine", "triangle", "square", "sawtooth"]
SYNTH_PATTERN_CHOICES = ["single", "double", "up", "down", "major", "minor", "fifth"]
SUPPORTED_SOUND_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm", ".aiff", ".aif"}
CUSTOM_SOUND_TOKEN_TTL_SECONDS = 60 * 30
MAX_CUSTOM_SOUND_TOKENS = 256
CUSTOM_SOUND_TOKENS = OrderedDict()
LOGGER = logging.getLogger("comfyui_chime")


def get_custom_sound_choices():
    if not SOUNDS_DIR.exists():
        return []

    choices = []
    for path in sorted(SOUNDS_DIR.iterdir()):
        if path.is_file() and path.suffix.lower() in SUPPORTED_SOUND_EXTENSIONS:
            choices.append(f"custom:{path.name}")

    return choices


def get_sound_choices():
    custom_choices = get_custom_sound_choices()
    if custom_choices:
        return SOUND_CHOICES + [CUSTOM_SOUND_OPTION] + custom_choices

    return SOUND_CHOICES + [CUSTOM_SOUND_OPTION]


def is_supported_sound_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_SOUND_EXTENSIONS


def build_repo_sound_url(filename: str) -> str:
    return f"/comfyui-chime/sounds/{filename}"


def get_custom_sound_source_kind(sound: str | None, custom_sound: str | None) -> str | None:
    sound = (sound or "").strip()
    custom_sound = (custom_sound or "").strip()

    if sound.startswith("custom:"):
        return "discovered_repo"

    if sound != CUSTOM_SOUND_OPTION or not custom_sound:
        return None

    custom_path = Path(custom_sound).expanduser()
    if custom_path.is_absolute():
        return "absolute_path"

    return "manual_repo"


def get_display_name_for_custom_sound(custom_sound: str | None) -> str | None:
    custom_sound = (custom_sound or "").strip()
    if not custom_sound:
        return None

    custom_path = Path(custom_sound).expanduser()
    if custom_path.is_absolute():
        return custom_path.name or str(custom_path)

    return Path(custom_sound).name or custom_sound


def prune_custom_sound_tokens(now: float | None = None) -> None:
    current_time = time.monotonic() if now is None else now
    expired_tokens = [
        token
        for token, entry in CUSTOM_SOUND_TOKENS.items()
        if entry["expires_at"] <= current_time
    ]
    for token in expired_tokens:
        CUSTOM_SOUND_TOKENS.pop(token, None)

    while len(CUSTOM_SOUND_TOKENS) > MAX_CUSTOM_SOUND_TOKENS:
        CUSTOM_SOUND_TOKENS.popitem(last=False)


def resolve_repo_sound_path(filename: str | None) -> Path | None:
    filename = (filename or "").strip()
    if not filename:
        return None

    resolved = (SOUNDS_DIR / filename).resolve()
    if SOUNDS_DIR.resolve() not in resolved.parents:
        return None
    if not is_supported_sound_file(resolved):
        return None
    return resolved


def resolve_discovered_sound_url(sound: str | None) -> str | None:
    sound = (sound or "").strip()
    if not sound.startswith("custom:"):
        return None

    filename = sound.split("custom:", 1)[1]
    resolved = resolve_repo_sound_path(filename)
    if resolved is None:
        return None
    return build_repo_sound_url(resolved.name)


def resolve_preview_sound_url(custom_sound: str | None) -> str | None:
    custom_sound = (custom_sound or "").strip()
    if not custom_sound:
        return None

    custom_path = Path(custom_sound).expanduser()
    if custom_path.is_absolute():
        resolved = custom_path.resolve()
        if is_supported_sound_file(resolved):
            return register_external_sound(resolved)
        return None

    resolved = resolve_repo_sound_path(custom_sound)
    if resolved is not None:
        return build_repo_sound_url(resolved.name)

    return None


def register_external_sound(path: Path) -> str:
    prune_custom_sound_tokens()
    token = secrets.token_urlsafe(16)
    CUSTOM_SOUND_TOKENS[token] = {
        "path": path,
        "expires_at": time.monotonic() + CUSTOM_SOUND_TOKEN_TTL_SECONDS,
    }
    return f"/comfyui-chime/custom-sound/{token}"


def resolve_custom_sound_url(custom_sound: str | None) -> str | None:
    custom_sound = (custom_sound or "").strip()
    if not custom_sound:
        return None

    custom_path = Path(custom_sound).expanduser()
    if custom_path.is_absolute():
        resolved = custom_path.resolve()
        if is_supported_sound_file(resolved):
            return register_external_sound(resolved)
        return None

    resolved = resolve_repo_sound_path(custom_sound)
    if resolved is not None:
        return build_repo_sound_url(resolved.name)

    return None


def get_unresolved_discovered_sound_message(sound: str | None) -> str:
    sound = (sound or "").strip()
    filename = sound.split("custom:", 1)[1] if sound.startswith("custom:") else ""

    if not filename:
        return "The selected discovered repo-local sound is missing its filename."

    resolved = (SOUNDS_DIR / filename).resolve()
    if SOUNDS_DIR.resolve() not in resolved.parents:
        return "The selected discovered repo-local sound is no longer valid."
    if not resolved.exists():
        return f"The selected discovered repo-local sound was not found in sounds/: {filename}"
    if resolved.suffix.lower() not in SUPPORTED_SOUND_EXTENSIONS:
        return (
            "The selected discovered repo-local sound uses an unsupported extension. "
            "Try .wav or .mp3 for the best compatibility."
        )
    return "The selected discovered repo-local sound could not be resolved."


def get_unresolved_custom_sound_message(custom_sound: str | None) -> str:
    custom_sound = (custom_sound or "").strip()
    if not custom_sound:
        return "Custom sound is selected, but no file was provided."

    custom_path = Path(custom_sound).expanduser()
    if custom_path.is_absolute():
        resolved = custom_path.resolve()
        if not resolved.exists():
            return f"Custom sound was not found: {resolved}"
        if resolved.suffix.lower() not in SUPPORTED_SOUND_EXTENSIONS:
            return (
                "Custom sound uses an unsupported extension. "
                "Try .wav or .mp3 for the best compatibility."
            )
        return "Custom sound could not be used from the provided absolute path."

    resolved = (SOUNDS_DIR / custom_sound).resolve()
    if SOUNDS_DIR.resolve() not in resolved.parents:
        return "Custom sound must stay inside sounds/ when using a repo-local filename."
    if not resolved.exists():
        return f"Custom sound was not found in sounds/: {custom_sound}"
    if resolved.suffix.lower() not in SUPPORTED_SOUND_EXTENSIONS:
        return (
            "Custom sound in sounds/ uses an unsupported extension. "
            "Try .wav or .mp3 for the best compatibility."
        )
    return "Custom sound could not be resolved."


def log_custom_sound_failure(
    stage: str,
    *,
    sound: str | None = None,
    custom_sound: str | None = None,
    source_kind: str | None = None,
    detail: str,
) -> None:
    context = []
    if sound:
        context.append(f"sound={sound}")
    if custom_sound:
        context.append(f"custom_sound={custom_sound}")
    if source_kind:
        context.append(f"source_kind={source_kind}")
    context_text = f" ({', '.join(context)})" if context else ""
    LOGGER.warning("custom sound failure [%s]%s: %s", stage, context_text, detail)


@PromptServer.instance.routes.get("/comfyui-chime/sounds/{filename}")
async def get_sound_file(request):
    filename = request.match_info["filename"]
    sound_path = (SOUNDS_DIR / filename).resolve()

    if SOUNDS_DIR.resolve() not in sound_path.parents or not sound_path.is_file():
        raise web.HTTPNotFound()

    content_type, _ = mimetypes.guess_type(sound_path.name)
    return web.FileResponse(sound_path, headers={"Content-Type": content_type or "application/octet-stream"})


@PromptServer.instance.routes.get("/comfyui-chime/custom-sound/{token}")
async def get_external_sound_file(request):
    prune_custom_sound_tokens()
    token = request.match_info["token"]
    entry = CUSTOM_SOUND_TOKENS.get(token)

    if entry is None:
        log_custom_sound_failure("fetch", source_kind="absolute_path", detail="custom sound token was missing or expired")
        raise web.HTTPNotFound()

    entry["expires_at"] = time.monotonic() + CUSTOM_SOUND_TOKEN_TTL_SECONDS
    CUSTOM_SOUND_TOKENS.move_to_end(token)
    sound_path = entry["path"]
    sound_path = sound_path.resolve()
    if not is_supported_sound_file(sound_path):
        CUSTOM_SOUND_TOKENS.pop(token, None)
        log_custom_sound_failure(
            "fetch",
            custom_sound=str(sound_path),
            source_kind="absolute_path",
            detail="resolved absolute-path sound was unavailable",
        )
        raise web.HTTPNotFound()

    content_type, _ = mimetypes.guess_type(sound_path.name)
    return web.FileResponse(sound_path, headers={"Content-Type": content_type or "application/octet-stream"})


@PromptServer.instance.routes.get("/comfyui-chime/preview")
async def preview_sound_file(request):
    custom_sound = request.query.get("path")
    preview_url = resolve_preview_sound_url(custom_sound)
    if preview_url is None:
        log_custom_sound_failure(
            "resolve",
            custom_sound=custom_sound,
            source_kind="absolute_path" if custom_sound and Path(custom_sound).expanduser().is_absolute() else "manual_repo",
            detail="preview route could not resolve custom sound",
        )
        raise web.HTTPNotFound()

    raise web.HTTPFound(preview_url)


class ChimeNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "trigger": (ANY_TYPE, {}),
                "enabled": ("BOOLEAN", {"default": True}),
                "sound": (get_sound_choices(), {"default": "chime"}),
                "custom_sound": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "placeholder": "filename in sounds/, e.g. ding.mp3",
                    },
                ),
                "volume": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 2.0, "step": 0.05}),
                "cooldown_ms": ("INT", {"default": 0, "min": 0, "max": 60000, "step": 50}),
                "playback_mode": (PLAYBACK_MODE_CHOICES, {"default": "interrupt"}),
            },
            "optional": {
                "synth_config": ("CHIME_SYNTH_CONFIG", {}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "utils/notifications"

    def execute(
        self,
        trigger,
        enabled,
        sound,
        custom_sound,
        volume,
        cooldown_ms,
        playback_mode,
        synth_config=None,
        unique_id=None,
    ):
        if enabled:
            selected_sound = sound
            custom_sound_url = None
            custom_sound_label = None
            custom_sound_source_kind = get_custom_sound_source_kind(sound, custom_sound)
            resolved_synth_config = synth_config if isinstance(synth_config, dict) else None
            error_message = None

            if isinstance(sound, str) and sound.startswith("custom:"):
                custom_sound_url = resolve_discovered_sound_url(sound)
                custom_sound_label = sound.split("custom:", 1)[1] or None
                if custom_sound_url is None:
                    error_message = get_unresolved_discovered_sound_message(sound)
                    log_custom_sound_failure(
                        "resolve",
                        sound=sound,
                        source_kind=custom_sound_source_kind,
                        detail=error_message,
                    )
            elif sound == CUSTOM_SOUND_OPTION:
                custom_sound_url = resolve_custom_sound_url(custom_sound)
                custom_sound_label = get_display_name_for_custom_sound(custom_sound)
                if custom_sound_url is None:
                    error_message = get_unresolved_custom_sound_message(custom_sound)
                    log_custom_sound_failure(
                        "resolve",
                        sound=sound,
                        custom_sound=custom_sound,
                        source_kind=custom_sound_source_kind,
                        detail=error_message,
                    )

            PromptServer.instance.send_sync(
                "comfyui-chime.play",
                {
                    "node_id": unique_id,
                    "sound": selected_sound,
                    "custom_sound_url": custom_sound_url,
                    "custom_sound_label": custom_sound_label,
                    "custom_sound_source_kind": custom_sound_source_kind,
                    "synth_config": resolved_synth_config,
                    "volume": float(volume),
                    "cooldown_ms": int(cooldown_ms),
                    "playback_mode": playback_mode,
                    "error_message": error_message,
                },
            )

        return ()


class ChimeSynthNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "preset_name": (
                    "STRING",
                    {
                        "default": "Custom Synth",
                        "multiline": False,
                        "placeholder": "Preset label for preview/save",
                    },
                ),
                "saved_preset": (["(unsaved)"], {"default": "(unsaved)"}),
                "waveform": (SYNTH_WAVEFORM_CHOICES, {"default": "triangle"}),
                "root_pitch": ("FLOAT", {"default": 587.33, "min": 65.41, "max": 2093.0, "step": 0.01}),
                "pattern": (SYNTH_PATTERN_CHOICES, {"default": "major"}),
                "note_count": ("INT", {"default": 4, "min": 1, "max": 32, "step": 1}),
                "step_ms": ("INT", {"default": 140, "min": 40, "max": 2000, "step": 10}),
                "note_ms": ("INT", {"default": 220, "min": 20, "max": 4000, "step": 10}),
                "attack_ms": ("INT", {"default": 10, "min": 0, "max": 2000, "step": 5}),
                "decay_ms": ("INT", {"default": 80, "min": 0, "max": 2000, "step": 5}),
                "sustain_level": ("FLOAT", {"default": 0.45, "min": 0.0, "max": 1.0, "step": 0.01}),
                "release_ms": ("INT", {"default": 240, "min": 10, "max": 4000, "step": 10}),
                "volume_trim": ("FLOAT", {"default": 0.75, "min": 0.0, "max": 2.0, "step": 0.05}),
            }
        }

    RETURN_TYPES = ("CHIME_SYNTH_CONFIG",)
    RETURN_NAMES = ("synth_config",)
    FUNCTION = "build"
    CATEGORY = "utils/notifications"

    def build(
        self,
        preset_name,
        saved_preset,
        waveform,
        root_pitch,
        pattern,
        note_count,
        step_ms,
        note_ms,
        attack_ms,
        decay_ms,
        sustain_level,
        release_ms,
        volume_trim,
    ):
        synth_config = {
            "version": 1,
            "preset_name": str(preset_name).strip() or "Custom Synth",
            "saved_preset": str(saved_preset).strip(),
            "waveform": waveform,
            "root_pitch": float(root_pitch),
            "pattern": pattern,
            "note_count": int(note_count),
            "step_ms": int(step_ms),
            "note_ms": int(note_ms),
            "attack_ms": int(attack_ms),
            "decay_ms": int(decay_ms),
            "sustain_level": float(sustain_level),
            "release_ms": int(release_ms),
            "volume_trim": float(volume_trim),
        }
        return (synth_config,)


NODE_CLASS_MAPPINGS = {
    "ChimeNode": ChimeNode,
    "ChimeSynthNode": ChimeSynthNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ChimeNode": "Chime",
    "ChimeSynthNode": "Chime Synth",
}
