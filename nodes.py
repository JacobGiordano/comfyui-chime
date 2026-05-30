from __future__ import annotations

import mimetypes
import secrets
from pathlib import Path

from aiohttp import web
from server import PromptServer


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


ANY_TYPE = AnyType("*")

PACKAGE_DIR = Path(__file__).resolve().parent
SOUNDS_DIR = PACKAGE_DIR / "sounds"
SOUND_CHOICES = ["chime", "bell", "soft", "success"]
CUSTOM_SOUND_OPTION = "custom"
SUPPORTED_SOUND_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm", ".aiff", ".aif"}
CUSTOM_SOUND_TOKENS = {}


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


def register_external_sound(path: Path) -> str:
    token = secrets.token_urlsafe(16)
    CUSTOM_SOUND_TOKENS[token] = path
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

    resolved = (SOUNDS_DIR / custom_sound).resolve()
    if SOUNDS_DIR.resolve() in resolved.parents and is_supported_sound_file(resolved):
        return build_repo_sound_url(resolved.name)

    return None


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
    token = request.match_info["token"]
    sound_path = CUSTOM_SOUND_TOKENS.get(token)

    if sound_path is None:
        raise web.HTTPNotFound()

    sound_path = sound_path.resolve()
    if not is_supported_sound_file(sound_path):
        raise web.HTTPNotFound()

    content_type, _ = mimetypes.guess_type(sound_path.name)
    return web.FileResponse(sound_path, headers={"Content-Type": content_type or "application/octet-stream"})


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
                "volume": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.05}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "utils/notifications"

    def execute(self, trigger, enabled, sound, custom_sound, volume, unique_id=None):
        if enabled:
            selected_sound = sound
            custom_sound_url = None

            if isinstance(sound, str) and sound.startswith("custom:"):
                filename = sound.split("custom:", 1)[1]
                custom_sound_url = build_repo_sound_url(filename)
            elif sound == CUSTOM_SOUND_OPTION:
                custom_sound_url = resolve_custom_sound_url(custom_sound)

            PromptServer.instance.send_sync(
                "comfyui-chime.play",
                {
                    "node_id": unique_id,
                    "sound": selected_sound,
                    "custom_sound_url": custom_sound_url,
                    "volume": float(volume),
                },
            )

        return ()


NODE_CLASS_MAPPINGS = {
    "ChimeNode": ChimeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ChimeNode": "Chime",
}
