import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "comfyui-chime";
const MAX_VOLUME = 2.0;
const MAX_MASTER_GAIN = 1.5;
const CUSTOM_SOUND_PREFIX = "custom:";
const TOAST_DURATION_MS = 3200;
const DEFAULT_CUSTOM_PLACEHOLDER = "Used only when sound is set to custom";
const CUSTOM_INPUT_PLACEHOLDER = "glass-tap.wav from sounds/ or /absolute/path/to/ding.wav";
const SOURCE_HINT_BUILT_IN = "Built-in: chime";
const SOURCE_HINT_CUSTOM_EMPTY = "Enter a filename from sounds/ or an absolute path";
const BUILT_IN_SOUNDS = new Set([
    "alert",
    "beacon",
    "bell",
    "bloom",
    "chime",
    "glass",
    "knock",
    "pulse",
    "retro",
    "rise",
    "settle",
    "soft",
    "tada",
    "unlock",
    "victory",
]);
const DEFAULT_PLAYBACK_MODE = "interrupt";
const DEFAULT_TONE_CHARACTER = "default";
const DEFAULT_WAVEFORM = "auto";
const DEFAULT_SYNTH_PRESET = "(unsaved)";
const MIN_PITCH_SHIFT = -36;
const MAX_PITCH_SHIFT = 36;
const MAX_COOLDOWN_MS = 60000;
const MIN_SYNTH_ROOT_PITCH = 65.41;
const MAX_SYNTH_ROOT_PITCH = 2093.0;
const MAX_SYNTH_NOTE_COUNT = 32;
const MAX_SYNTH_DURATION_MS = 4000;
const MAX_SYNTH_STEP_MS = 2000;
const MAX_SYNTH_ATTACK_MS = 2000;
const MAX_SYNTH_DECAY_MS = 2000;
const MAX_SYNTH_RELEASE_MS = 4000;
const DEFAULT_SYNTH_WAVEFORM = "triangle";
const DEFAULT_SYNTH_PATTERN = "major";
const PLAYBACK_MODES = new Set(["interrupt", "overlap", "queue"]);
const TONE_CHARACTERS = new Set(["default", "warm", "bright", "hollow"]);
const WAVEFORMS = new Set(["auto", "sine", "triangle", "square", "sawtooth"]);
const SYNTH_WAVEFORMS = new Set(["sine", "triangle", "square", "sawtooth"]);
const SYNTH_PATTERNS = new Set(["single", "double", "up", "down", "major", "minor", "fifth"]);
const SYNTH_PRESET_STORAGE_KEY = "comfyui-chime.synth-presets.v1";
const SOUND_DURATIONS_MS = {
    alert: 520,
    beacon: 980,
    bell: 920,
    bloom: 1150,
    chime: 900,
    glass: 740,
    knock: 430,
    pulse: 760,
    retro: 680,
    rise: 880,
    settle: 860,
    soft: 720,
    tada: 820,
    unlock: 540,
    victory: 1120,
};
const INFO_WIDGET_HEIGHT = 46;
const INFO_WIDGET_PADDING_X = 12;
const INFO_WIDGET_PADDING_Y = 8;
const INFO_WIDGET_LINE_HEIGHT = 14;
const INFO_WIDGET_MAX_LINES = 2;

let audioContext = null;
let toastElement = null;
let toastTimer = null;
let playbackQueue = Promise.resolve();
let playbackQueueRevision = 0;
const lastPlaybackAtByNode = new Map();
const activeCustomSounds = new Set();
const activeSynthSounds = new Set();

function logCustomSoundFailure(stage, { label = "", url = "", sourceKind = "", error = null, detail = "" } = {}) {
    const parts = [`[ComfyUI-Chime] Custom sound failure during ${stage}.`];
    if (label) {
        parts.push(`label=${label}`);
    }
    if (url) {
        parts.push(`url=${url}`);
    }
    if (sourceKind) {
        parts.push(`source_kind=${sourceKind}`);
    }
    if (detail) {
        parts.push(`detail=${detail}`);
    }
    if (error) {
        console.warn(parts.join(" "), error);
        return;
    }
    console.warn(parts.join(" "));
}

function showToast(message, tone = "warning") {
    if (!message) {
        return;
    }

    if (!toastElement) {
        toastElement = document.createElement("div");
        toastElement.style.position = "fixed";
        toastElement.style.right = "16px";
        toastElement.style.bottom = "16px";
        toastElement.style.zIndex = "99999";
        toastElement.style.maxWidth = "360px";
        toastElement.style.padding = "10px 12px";
        toastElement.style.borderRadius = "10px";
        toastElement.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.25)";
        toastElement.style.fontSize = "13px";
        toastElement.style.lineHeight = "1.4";
        toastElement.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
        toastElement.style.opacity = "0";
        toastElement.style.transform = "translateY(8px)";
        toastElement.style.transition = "opacity 120ms ease, transform 120ms ease";
        toastElement.style.pointerEvents = "none";
        document.body.appendChild(toastElement);
    }

    const palettes = {
        info: {
            background: "rgba(26, 56, 95, 0.96)",
            border: "1px solid rgba(117, 174, 255, 0.45)",
            color: "#f3f8ff",
        },
        warning: {
            background: "rgba(87, 57, 12, 0.96)",
            border: "1px solid rgba(255, 209, 102, 0.45)",
            color: "#fff8e6",
        },
    };
    const palette = palettes[tone] || palettes.warning;

    toastElement.textContent = message;
    toastElement.style.background = palette.background;
    toastElement.style.border = palette.border;
    toastElement.style.color = palette.color;
    toastElement.style.opacity = "1";
    toastElement.style.transform = "translateY(0)";

    if (toastTimer) {
        window.clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
        if (!toastElement) {
            return;
        }
        toastElement.style.opacity = "0";
        toastElement.style.transform = "translateY(8px)";
    }, TOAST_DURATION_MS);
}

function getAudioErrorMessage(label, error) {
    const safeLabel = label ? `“${label}”` : "This custom sound";
    const mediaError = error?.target?.error;

    if (typeof MediaError !== "undefined" && mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        return `${safeLabel} resolved, but this environment could not decode it. Try .wav or .mp3.`;
    }
    if (typeof MediaError !== "undefined" && mediaError?.code === MediaError.MEDIA_ERR_NETWORK) {
        return `${safeLabel} could not be loaded cleanly. Try previewing again or switch to .wav or .mp3.`;
    }

    return `${safeLabel} resolved, but it could not play here. Try .wav or .mp3.`;
}

function getAudioFailureStage(error) {
    const mediaError = error?.target?.error;
    if (typeof MediaError !== "undefined" && mediaError?.code === MediaError.MEDIA_ERR_NETWORK) {
        return "fetch";
    }
    if (
        typeof MediaError !== "undefined" &&
        (mediaError?.code === MediaError.MEDIA_ERR_DECODE || mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)
    ) {
        return "decode";
    }
    if (error?.name === "NotAllowedError") {
        return "playback";
    }
    return "load";
}

function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        return null;
    }

    if (!audioContext) {
        audioContext = new AudioContextClass();
    }

    return audioContext;
}

async function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) {
        showToast("Web Audio is not available in this ComfyUI environment.", "warning");
        return;
    }

    if (ctx.state === "suspended") {
        try {
            await ctx.resume();
        } catch (error) {
            console.warn("[ComfyUI-Chime] Failed to resume audio context.", error);
            showToast("Audio is still blocked. Click anywhere in ComfyUI once, then try again.", "warning");
        }
    }
}

function scheduleTone(ctx, destination, when, frequency, duration, type, gainValue) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0001), when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    oscillator.connect(gain);
    gain.connect(destination);

    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
    return { oscillator, gain };
}

function getPitchMultiplier(pitchShift) {
    const semitones = Math.max(MIN_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, Number(pitchShift) || 0));
    return Math.pow(2, semitones / 12);
}

function normalizePitchShift(value) {
    return Math.max(MIN_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, Number(value) || 0));
}

function normalizeCooldownMs(value) {
    return Math.max(0, Math.min(MAX_COOLDOWN_MS, Math.round(Number(value) || 0)));
}

function normalizeVolume(value) {
    return Math.max(0, Math.min(MAX_VOLUME, Number(value) || 0));
}

function normalizePlaybackMode(value) {
    return PLAYBACK_MODES.has(value) ? value : DEFAULT_PLAYBACK_MODE;
}

function normalizeToneCharacter(value) {
    return TONE_CHARACTERS.has(value) ? value : DEFAULT_TONE_CHARACTER;
}

function normalizeWaveform(value) {
    return WAVEFORMS.has(value) ? value : DEFAULT_WAVEFORM;
}

function normalizeSynthWaveform(value) {
    return SYNTH_WAVEFORMS.has(value) ? value : DEFAULT_SYNTH_WAVEFORM;
}

function normalizeSynthPattern(value) {
    return SYNTH_PATTERNS.has(value) ? value : DEFAULT_SYNTH_PATTERN;
}

function normalizeSynthRootPitch(value) {
    return Math.max(MIN_SYNTH_ROOT_PITCH, Math.min(MAX_SYNTH_ROOT_PITCH, Number(value) || 0));
}

function normalizeSynthNoteCount(value) {
    return Math.max(1, Math.min(MAX_SYNTH_NOTE_COUNT, Math.round(Number(value) || 0)));
}

function normalizeSynthDurationMs(value) {
    return Math.max(20, Math.min(MAX_SYNTH_DURATION_MS, Math.round(Number(value) || 0)));
}

function normalizeSynthStepMs(value) {
    return Math.max(40, Math.min(MAX_SYNTH_STEP_MS, Math.round(Number(value) || 0)));
}

function normalizeSynthAttackMs(value) {
    return Math.max(0, Math.min(MAX_SYNTH_ATTACK_MS, Math.round(Number(value) || 0)));
}

function normalizeSynthDecayMs(value) {
    return Math.max(0, Math.min(MAX_SYNTH_DECAY_MS, Math.round(Number(value) || 0)));
}

function normalizeSynthReleaseMs(value) {
    return Math.max(10, Math.min(MAX_SYNTH_RELEASE_MS, Math.round(Number(value) || 0)));
}

function normalizeSustainLevel(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeSynthVolumeTrim(value) {
    return normalizeVolume(value);
}

function describeResolvedSource(soundValue, customSoundValue) {
    if (typeof soundValue === "string" && soundValue.startsWith(CUSTOM_SOUND_PREFIX)) {
        const filename = soundValue.slice(CUSTOM_SOUND_PREFIX.length);
        return filename ? `Discovered repo file: sounds/${filename}` : SOURCE_HINT_CUSTOM_EMPTY;
    }

    if (soundValue === "custom") {
        const customValue = String(customSoundValue || "").trim();
        if (!customValue) {
            return SOURCE_HINT_CUSTOM_EMPTY;
        }

        if (customValue.startsWith("/")) {
            const filename = customValue.split("/").filter(Boolean).pop() || customValue;
            return `Absolute file: ${filename}`;
        }

        return `Repo file: sounds/${customValue}`;
    }

    if (BUILT_IN_SOUNDS.has(String(soundValue || ""))) {
        return `Built-in synth: ${soundValue}`;
    }

    return SOURCE_HINT_BUILT_IN;
}

function wrapInfoText(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) {
        return [""];
    }

    const lines = [];
    let currentLine = words[0];

    for (const word of words.slice(1)) {
        const candidate = `${currentLine} ${word}`;
        if (ctx.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
            continue;
        }
        lines.push(currentLine);
        currentLine = word;
    }

    lines.push(currentLine);
    return lines;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function createInfoWidget(name, label, initialValue) {
    return {
        type: "custom",
        name,
        label,
        value: initialValue,
        lastWidth: 240,
        options: {
            serialize: false,
        },
        computeSize(width) {
            const safeWidth = width || this.lastWidth || 240;
            this.lastWidth = safeWidth;
            if (this.hidden) {
                return [safeWidth, 0];
            }
            return [safeWidth, INFO_WIDGET_HEIGHT];
        },
        draw(ctx, node, width, y, height) {
            if (this.hidden) {
                return;
            }
            const safeWidth = Math.max(120, width || node?.size?.[0] || 240);
            this.lastWidth = safeWidth;
            const safeHeight = Math.max(INFO_WIDGET_HEIGHT, height || INFO_WIDGET_HEIGHT);
            const left = 10;
            const top = y;
            const innerWidth = safeWidth - left * 2;
            const innerHeight = safeHeight - 4;
            const textWidth = Math.max(40, innerWidth - INFO_WIDGET_PADDING_X * 2);

            ctx.save();
            ctx.fillStyle = "rgba(28, 28, 28, 0.92)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, left, top, innerWidth, innerHeight, 14);
            ctx.fill();
            ctx.stroke();

            ctx.font = "12px sans-serif";
            ctx.fillStyle = "rgba(218, 218, 218, 0.88)";
            ctx.fillText(label, left + INFO_WIDGET_PADDING_X, top + INFO_WIDGET_PADDING_Y + 10);

            ctx.font = "13px sans-serif";
            ctx.fillStyle = "rgba(245, 245, 245, 0.96)";
            const lines = wrapInfoText(ctx, this.value, textWidth);
            const visibleLines = lines.slice(0, INFO_WIDGET_MAX_LINES);
            visibleLines.forEach((line, index) => {
                const textY =
                    top + INFO_WIDGET_PADDING_Y + 24 + index * INFO_WIDGET_LINE_HEIGHT;
                ctx.fillText(line, left + INFO_WIDGET_PADDING_X, textY);
            });
            ctx.restore();
        },
    };
}

function getCharacterConfig(toneCharacter) {
    switch (toneCharacter) {
        case "warm":
            return { primaryType: "sine", accentType: "triangle", gainMultiplier: 0.92 };
        case "bright":
            return { primaryType: "triangle", accentType: "sine", gainMultiplier: 1.08 };
        case "hollow":
            return { primaryType: "square", accentType: "triangle", gainMultiplier: 0.82 };
        case "default":
        default:
            return { primaryType: "triangle", accentType: "sine", gainMultiplier: 1.0 };
    }
}

function resolveWaveTypes(toneCharacter, waveform) {
    const character = getCharacterConfig(toneCharacter);
    if (waveform && waveform !== DEFAULT_WAVEFORM) {
        return {
            primaryType: waveform,
            accentType: waveform,
            gainMultiplier: character.gainMultiplier,
        };
    }

    return character;
}

function finalizePlaybackEntry(entry, collection) {
    if (!entry || entry.finished) {
        return;
    }

    entry.finished = true;
    collection.delete(entry);
    if (typeof entry.resolve === "function") {
        entry.resolve();
    }
}

function stopActiveCustomSounds() {
    for (const entry of [...activeCustomSounds]) {
        try {
            entry.audio.pause();
            entry.audio.currentTime = 0;
            entry.audio.src = "";
        } catch (error) {
            console.warn("[ComfyUI-Chime] Failed to stop custom sound cleanly.", error);
        }
        try {
            entry.sourceNode?.disconnect();
        } catch (error) {
            // Ignore disconnect errors.
        }
        try {
            entry.gainNode?.disconnect();
        } catch (error) {
            // Ignore disconnect errors.
        }
        finalizePlaybackEntry(entry, activeCustomSounds);
    }
}

function stopActiveSynthSounds() {
    for (const entry of [...activeSynthSounds]) {
        if (entry.timeoutId) {
            window.clearTimeout(entry.timeoutId);
        }
        for (const tone of entry.tones) {
            try {
                tone.oscillator.stop();
            } catch (error) {
                // Ignore stop errors from already-finished oscillators.
            }
            try {
                tone.oscillator.disconnect();
            } catch (error) {
                // Ignore disconnect errors.
            }
            try {
                tone.gain.disconnect();
            } catch (error) {
                // Ignore disconnect errors.
            }
        }
        finalizePlaybackEntry(entry, activeSynthSounds);
    }
}

function stopActivePlayback() {
    stopActiveCustomSounds();
    stopActiveSynthSounds();
}

function queuePlayback(task) {
    const revision = playbackQueueRevision;
    playbackQueue = playbackQueue
        .catch(() => {})
        .then(() => {
            if (revision !== playbackQueueRevision) {
                return;
            }
            return task();
        });
    return playbackQueue;
}

function playPattern(
    sound,
    volume = 0.5,
    pitchShift = 0,
    toneCharacter = DEFAULT_TONE_CHARACTER,
    waveform = DEFAULT_WAVEFORM
) {
    const ctx = getAudioContext();
    if (!ctx) {
        console.warn("[ComfyUI-Chime] Web Audio API is not available in this environment.");
        showToast("Web Audio is not available in this ComfyUI environment.", "warning");
        return Promise.resolve();
    }

    const master = ctx.createGain();
    const clampedVolume = normalizeVolume(volume);
    master.gain.value = clampedVolume * MAX_MASTER_GAIN;
    master.connect(ctx.destination);

    const now = ctx.currentTime + 0.01;
    const tones = [];
    const durationMs = SOUND_DURATIONS_MS[sound] || SOUND_DURATIONS_MS.chime;
    const pitchMultiplier = getPitchMultiplier(pitchShift);
    const character = resolveWaveTypes(toneCharacter, waveform);
    const primaryType = character.primaryType;
    const accentType = character.accentType;
    const gainMultiplier = character.gainMultiplier;

    switch (sound) {
        case "alert":
            tones.push(scheduleTone(ctx, master, now, 740 * pitchMultiplier, 0.08, accentType, 0.75 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.1, 523.25 * pitchMultiplier, 0.16, primaryType, 0.48 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.22, 740 * pitchMultiplier, 0.2, accentType, 0.42 * gainMultiplier));
            break;
        case "beacon":
            tones.push(scheduleTone(ctx, master, now, 659.25 * pitchMultiplier, 0.14, accentType, 0.28 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.26, 659.25 * pitchMultiplier, 0.18, accentType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.6, 987.77 * pitchMultiplier, 0.24, primaryType, 0.22 * gainMultiplier));
            break;
        case "bell":
            tones.push(scheduleTone(ctx, master, now, 880 * pitchMultiplier, 0.9, accentType, 0.9 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.02, 1320 * pitchMultiplier, 0.7, primaryType, 0.4 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.04, 1760 * pitchMultiplier, 0.5, accentType, 0.15 * gainMultiplier));
            break;
        case "bloom":
            tones.push(scheduleTone(ctx, master, now, 392 * pitchMultiplier, 0.24, primaryType, 0.34 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.16, 523.25 * pitchMultiplier, 0.34, accentType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.36, 659.25 * pitchMultiplier, 0.48, primaryType, 0.28 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.62, 783.99 * pitchMultiplier, 0.42, accentType, 0.24 * gainMultiplier));
            break;
        case "knock":
            tones.push(scheduleTone(ctx, master, now, 196 * pitchMultiplier, 0.07, primaryType, 0.58 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.04, 130.81 * pitchMultiplier, 0.1, accentType, 0.18 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.16, 220 * pitchMultiplier, 0.08, primaryType, 0.46 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.2, 146.83 * pitchMultiplier, 0.12, accentType, 0.16 * gainMultiplier));
            break;
        case "soft":
            tones.push(scheduleTone(ctx, master, now, 523.25 * pitchMultiplier, 0.18, accentType, 0.35 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.14, 659.25 * pitchMultiplier, 0.25, accentType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.28, 783.99 * pitchMultiplier, 0.4, primaryType, 0.28 * gainMultiplier));
            break;
        case "pulse":
            tones.push(scheduleTone(ctx, master, now, 220 * pitchMultiplier, 0.1, primaryType, 0.46 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.16, 220 * pitchMultiplier, 0.1, primaryType, 0.4 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.32, 329.63 * pitchMultiplier, 0.12, accentType, 0.34 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.5, 220 * pitchMultiplier, 0.16, primaryType, 0.3 * gainMultiplier));
            break;
        case "rise":
            tones.push(scheduleTone(ctx, master, now, 440 * pitchMultiplier, 0.12, primaryType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.12, 554.37 * pitchMultiplier, 0.14, accentType, 0.32 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.26, 659.25 * pitchMultiplier, 0.18, primaryType, 0.34 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.44, 880 * pitchMultiplier, 0.32, accentType, 0.3 * gainMultiplier));
            break;
        case "settle":
            tones.push(scheduleTone(ctx, master, now, 659.25 * pitchMultiplier, 0.16, accentType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.16, 523.25 * pitchMultiplier, 0.2, primaryType, 0.28 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.34, 392 * pitchMultiplier, 0.34, accentType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.54, 293.66 * pitchMultiplier, 0.24, primaryType, 0.18 * gainMultiplier));
            break;
        case "tada":
            tones.push(scheduleTone(ctx, master, now, 523.25 * pitchMultiplier, 0.08, primaryType, 0.34 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.1, 523.25 * pitchMultiplier, 0.08, accentType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.24, 783.99 * pitchMultiplier, 0.18, primaryType, 0.4 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.5, 1046.5 * pitchMultiplier, 0.3, accentType, 0.34 * gainMultiplier));
            break;
        case "unlock":
            tones.push(scheduleTone(ctx, master, now, 587.33 * pitchMultiplier, 0.07, primaryType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.07, 466.16 * pitchMultiplier, 0.08, accentType, 0.18 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.18, 739.99 * pitchMultiplier, 0.12, primaryType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.36, 987.77 * pitchMultiplier, 0.16, accentType, 0.22 * gainMultiplier));
            break;
        case "victory":
            tones.push(scheduleTone(ctx, master, now, 392 * pitchMultiplier, 0.12, primaryType, 0.26 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.16, 587.33 * pitchMultiplier, 0.14, accentType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.34, 493.88 * pitchMultiplier, 0.12, primaryType, 0.22 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.52, 783.99 * pitchMultiplier, 0.18, accentType, 0.32 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.78, 1174.66 * pitchMultiplier, 0.28, primaryType, 0.28 * gainMultiplier));
            break;
        case "glass":
            tones.push(scheduleTone(ctx, master, now, 1046.5 * pitchMultiplier, 0.14, accentType, 0.4 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.04, 1396.91 * pitchMultiplier, 0.28, primaryType, 0.22 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.18, 1760 * pitchMultiplier, 0.22, accentType, 0.14 * gainMultiplier));
            break;
        case "retro":
            tones.push(scheduleTone(ctx, master, now, 261.63 * pitchMultiplier, 0.09, primaryType, 0.4 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.11, 329.63 * pitchMultiplier, 0.09, primaryType, 0.38 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.22, 392 * pitchMultiplier, 0.09, primaryType, 0.36 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.36, 523.25 * pitchMultiplier, 0.18, accentType, 0.3 * gainMultiplier));
            break;
        case "chime":
        default:
            tones.push(scheduleTone(ctx, master, now, 587.33 * pitchMultiplier, 0.16, primaryType, 0.55 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.12, 783.99 * pitchMultiplier, 0.2, primaryType, 0.45 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.28, 1174.66 * pitchMultiplier, 0.55, accentType, 0.3 * gainMultiplier));
            break;
    }

    return new Promise((resolve) => {
        const entry = {
            tones,
            resolve,
            finished: false,
            timeoutId: null,
        };
        activeSynthSounds.add(entry);
        entry.timeoutId = window.setTimeout(() => {
            try {
                master.disconnect();
            } catch (error) {
                // Ignore disconnect errors when the audio graph is already gone.
            }
            finalizePlaybackEntry(entry, activeSynthSounds);
        }, durationMs);
    });
}

function getSynthPatternSteps(pattern) {
    switch (pattern) {
        case "single":
            return [0];
        case "double":
            return [0, 7];
        case "up":
            return [0, 4, 7, 12];
        case "down":
            return [12, 7, 4, 0];
        case "minor":
            return [0, 3, 7, 10];
        case "fifth":
            return [0, 7, 12];
        case "major":
        default:
            return [0, 4, 7, 11];
    }
}

function buildSynthSequence(pattern, noteCount) {
    const motif = getSynthPatternSteps(pattern);
    const totalNotes = normalizeSynthNoteCount(noteCount);
    const sequence = [];

    for (let index = 0; index < totalNotes; index += 1) {
        sequence.push(motif[index % motif.length]);
    }

    return sequence;
}

function scheduleSynthTone(ctx, destination, when, frequency, durationSeconds, waveform, peakGain, envelope) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const attackSeconds = Math.max(0, envelope.attackMs / 1000);
    const decaySeconds = Math.max(0, envelope.decayMs / 1000);
    const releaseSeconds = Math.max(0.01, envelope.releaseMs / 1000);
    const sustainLevel = Math.max(0, Math.min(1, envelope.sustainLevel));
    const peak = Math.max(0.0001, peakGain);
    const sustainGain = Math.max(0.0001, peak * sustainLevel);
    const noteEnd = when + Math.max(0.02, durationSeconds);
    const attackEnd = when + attackSeconds;
    const decayEnd = Math.min(noteEnd, attackEnd + decaySeconds);
    const releaseStart = Math.max(decayEnd, noteEnd - releaseSeconds);

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, when);

    gain.gain.setValueAtTime(0.0001, when);
    if (attackSeconds <= 0) {
        gain.gain.setValueAtTime(peak, when);
    } else {
        gain.gain.linearRampToValueAtTime(peak, attackEnd);
    }
    if (decaySeconds <= 0) {
        gain.gain.setValueAtTime(sustainGain, attackEnd);
    } else {
        gain.gain.linearRampToValueAtTime(sustainGain, decayEnd);
    }
    gain.gain.setValueAtTime(sustainGain, releaseStart);
    gain.gain.linearRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(noteEnd + 0.02);

    return { oscillator, gain };
}

function playSynthConfig(config) {
    const ctx = getAudioContext();
    if (!ctx) {
        console.warn("[ComfyUI-Chime] Web Audio API is not available in this environment.");
        showToast("Web Audio is not available in this ComfyUI environment.", "warning");
        return Promise.resolve();
    }

    const waveform = normalizeSynthWaveform(config?.waveform);
    const rootPitch = normalizeSynthRootPitch(config?.root_pitch);
    const stepMs = normalizeSynthStepMs(config?.step_ms);
    const noteMs = normalizeSynthDurationMs(config?.note_ms);
    const envelope = {
        attackMs: normalizeSynthAttackMs(config?.attack_ms),
        decayMs: normalizeSynthDecayMs(config?.decay_ms),
        sustainLevel: normalizeSustainLevel(config?.sustain_level),
        releaseMs: normalizeSynthReleaseMs(config?.release_ms),
    };
    const volumeTrim = normalizeSynthVolumeTrim(config?.volume_trim);
    const pattern = normalizeSynthPattern(config?.pattern);
    const steps = buildSynthSequence(pattern, config?.note_count);
    const master = ctx.createGain();
    const now = ctx.currentTime + 0.01;
    const tones = [];
    const stepSeconds = stepMs / 1000;
    const noteSeconds = noteMs / 1000;
    const peakGain = Math.max(0.0001, volumeTrim * 0.45);

    master.gain.value = Math.min(volumeTrim * 1.15, MAX_MASTER_GAIN);
    master.connect(ctx.destination);

    for (let index = 0; index < steps.length; index += 1) {
        const semitoneOffset = steps[index];
        const frequency = rootPitch * Math.pow(2, semitoneOffset / 12);
        const startTime = now + index * stepSeconds;
        tones.push(
            scheduleSynthTone(
                ctx,
                master,
                startTime,
                frequency,
                noteSeconds,
                waveform,
                peakGain,
                envelope
            )
        );
    }

    const totalDurationMs = Math.max(1, Math.round((steps.length - 1) * stepMs + noteMs));

    return new Promise((resolve) => {
        const entry = {
            tones,
            resolve,
            finished: false,
            timeoutId: null,
        };
        activeSynthSounds.add(entry);
        entry.timeoutId = window.setTimeout(() => {
            try {
                master.disconnect();
            } catch (error) {
                // Ignore disconnect errors when the audio graph is already gone.
            }
            finalizePlaybackEntry(entry, activeSynthSounds);
        }, totalDurationMs + 50);
    });
}

function getCustomSoundUrl(sound) {
    const filename = sound.slice(CUSTOM_SOUND_PREFIX.length);
    return `/comfyui-chime/sounds/${encodeURIComponent(filename)}`;
}

async function playCustomSound(url, volume = 0.5, label = "", sourceKind = "") {
    const clampedVolume = normalizeVolume(volume);
    const audio = new Audio(url);
    audio.volume = 1;
    audio.preload = "auto";
    const ctx = getAudioContext();
    let sourceNode = null;
    let gainNode = null;

    if (ctx) {
        sourceNode = ctx.createMediaElementSource(audio);
        gainNode = ctx.createGain();
        gainNode.gain.value = clampedVolume;
        sourceNode.connect(gainNode);
        gainNode.connect(ctx.destination);
    } else {
        audio.volume = Math.min(clampedVolume, 1);
    }

    return new Promise((resolve) => {
        const entry = {
            audio,
            sourceNode,
            gainNode,
            resolve,
            finished: false,
        };
        activeCustomSounds.add(entry);

        const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
            try {
                sourceNode?.disconnect();
            } catch (error) {
                // Ignore disconnect errors.
            }
            try {
                gainNode?.disconnect();
            } catch (error) {
                // Ignore disconnect errors.
            }
            finalizePlaybackEntry(entry, activeCustomSounds);
        };

        audio.onended = cleanup;
        audio.onerror = (error) => {
            const stage = getAudioFailureStage(error);
            logCustomSoundFailure(stage, {
                label,
                url,
                sourceKind,
                error,
                detail: "media element reported an error",
            });
            showToast(getAudioErrorMessage(label, error), "warning");
            cleanup();
        };

        audio.play().catch((error) => {
            logCustomSoundFailure("playback", {
                label,
                url,
                sourceKind,
                error,
                detail: error?.message || "audio.play() rejected",
            });
            showToast(getAudioErrorMessage(label, error), "warning");
            cleanup();
        });
    });
}

function getNodeWidgetValue(node, name, fallback = null) {
    const widget = node?.widgets?.find((entry) => entry?.name === name);
    return widget ? widget.value : fallback;
}

function getNodeWidget(node, name) {
    return node?.widgets?.find((entry) => entry?.name === name) ?? null;
}

function isInputConnected(node, inputName) {
    const input = node?.inputs?.find((entry) => entry?.name === inputName);
    if (!input) {
        return false;
    }
    if (Array.isArray(input.links)) {
        return input.links.length > 0;
    }
    return input.link != null;
}

function isChimeSynthNode(node) {
    if (!node) {
        return false;
    }

    const candidates = [
        node.type,
        node.comfyClass,
        node.constructor?.comfyClass,
        node.title,
    ]
        .filter(Boolean)
        .map((value) => String(value));

    if (candidates.some((value) => value === "ChimeSynthNode" || value === "Chime Synth")) {
        return true;
    }

    return (
        getNodeWidget(node, "root_pitch") &&
        getNodeWidget(node, "pattern") &&
        getNodeWidget(node, "note_count") &&
        getNodeWidget(node, "volume_trim")
    );
}

function getGraphLinkById(graph, linkId) {
    if (!graph || linkId == null) {
        return null;
    }

    const links = graph.links;
    if (!links) {
        return null;
    }

    if (typeof links.get === "function") {
        return links.get(linkId) ?? links.get(String(linkId)) ?? null;
    }

    return links[linkId] ?? links[String(linkId)] ?? null;
}

function getGraphNodeById(graph, nodeId) {
    if (!graph || nodeId == null) {
        return null;
    }

    if (typeof graph.getNodeById === "function") {
        const resolved = graph.getNodeById(nodeId) ?? graph.getNodeById(String(nodeId));
        if (resolved) {
            return resolved;
        }
    }

    return graph._nodes_by_id?.[nodeId] ?? graph._nodes_by_id?.[String(nodeId)] ?? null;
}

function getConnectedSynthInfo(node) {
    const input = node?.inputs?.find((entry) => entry?.name === "synth_config");
    const linkId = Array.isArray(input?.links) ? input.links[0] : input?.link;
    if (linkId == null) {
        return null;
    }

    const graph = app?.graph;
    const link = getGraphLinkById(graph, linkId);
    const originId = link?.origin_id;
    if (originId == null) {
        return null;
    }

    const originNode = getGraphNodeById(graph, originId);
    if (!isChimeSynthNode(originNode)) {
        return null;
    }

    normalizeSynthNodeWidgets(originNode);
    const config = buildSynthConfigFromNode(originNode);
    const label =
        String(config?.preset_name || "").trim() ||
        String(getNodeWidgetValue(originNode, "saved_preset", "") || "").trim() ||
        "Connected synth sound";

    return {
        config,
        label,
    };
}

function resolveConnectedSynthConfig(node) {
    return getConnectedSynthInfo(node)?.config ?? null;
}

function readSynthPresetStore() {
    try {
        const raw = window.localStorage.getItem(SYNTH_PRESET_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        console.warn("[ComfyUI-Chime] Failed to read synth presets from localStorage.", error);
        return {};
    }
}

function writeSynthPresetStore(store) {
    try {
        window.localStorage.setItem(SYNTH_PRESET_STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
        console.warn("[ComfyUI-Chime] Failed to write synth presets to localStorage.", error);
        showToast("Could not save synth preset in this browser session.", "warning");
    }
}

function listSynthPresetNames() {
    return Object.keys(readSynthPresetStore()).sort((left, right) => left.localeCompare(right));
}

function buildSynthConfigFromNode(node) {
    return {
        version: 1,
        preset_name: String(getNodeWidgetValue(node, "preset_name", "Custom Synth") || "").trim() || "Custom Synth",
        saved_preset: String(getNodeWidgetValue(node, "saved_preset", DEFAULT_SYNTH_PRESET) || DEFAULT_SYNTH_PRESET),
        waveform: normalizeSynthWaveform(String(getNodeWidgetValue(node, "waveform", DEFAULT_SYNTH_WAVEFORM) || "")),
        root_pitch: normalizeSynthRootPitch(getNodeWidgetValue(node, "root_pitch", 587.33)),
        pattern: normalizeSynthPattern(String(getNodeWidgetValue(node, "pattern", DEFAULT_SYNTH_PATTERN) || "")),
        note_count: normalizeSynthNoteCount(getNodeWidgetValue(node, "note_count", 4)),
        step_ms: normalizeSynthStepMs(getNodeWidgetValue(node, "step_ms", 140)),
        note_ms: normalizeSynthDurationMs(getNodeWidgetValue(node, "note_ms", 220)),
        attack_ms: normalizeSynthAttackMs(getNodeWidgetValue(node, "attack_ms", 10)),
        decay_ms: normalizeSynthDecayMs(getNodeWidgetValue(node, "decay_ms", 80)),
        sustain_level: normalizeSustainLevel(getNodeWidgetValue(node, "sustain_level", 0.45)),
        release_ms: normalizeSynthReleaseMs(getNodeWidgetValue(node, "release_ms", 240)),
        volume_trim: normalizeSynthVolumeTrim(getNodeWidgetValue(node, "volume_trim", 0.75)),
    };
}

function setWidgetValue(widget, value) {
    if (!widget) {
        return;
    }
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value);
    }
}

function randomChoice(values) {
    return values[Math.floor(Math.random() * values.length)];
}

function randomInt(min, max, step = 1) {
    const safeStep = Math.max(1, step);
    const totalSteps = Math.floor((max - min) / safeStep);
    return min + Math.floor(Math.random() * (totalSteps + 1)) * safeStep;
}

function randomFloat(min, max, step = 0.01) {
    const totalSteps = Math.floor((max - min) / step);
    const raw = min + Math.floor(Math.random() * (totalSteps + 1)) * step;
    return Number(raw.toFixed(4));
}

function randomizeSynthNode(node) {
    setWidgetValue(getNodeWidget(node, "waveform"), randomChoice(["sine", "triangle", "square", "sawtooth"]));
    setWidgetValue(getNodeWidget(node, "pattern"), randomChoice(["single", "double", "up", "down", "major", "minor", "fifth"]));
    setWidgetValue(getNodeWidget(node, "note_count"), randomInt(2, 12, 1));
    setWidgetValue(getNodeWidget(node, "root_pitch"), randomFloat(196.0, 987.77, 0.01));
    setWidgetValue(getNodeWidget(node, "step_ms"), randomInt(80, 280, 10));
    setWidgetValue(getNodeWidget(node, "note_ms"), randomInt(120, 420, 10));
    setWidgetValue(getNodeWidget(node, "attack_ms"), randomInt(0, 80, 5));
    setWidgetValue(getNodeWidget(node, "decay_ms"), randomInt(40, 220, 5));
    setWidgetValue(getNodeWidget(node, "sustain_level"), randomFloat(0.2, 0.75, 0.01));
    setWidgetValue(getNodeWidget(node, "release_ms"), randomInt(120, 420, 10));
    setWidgetValue(getNodeWidget(node, "volume_trim"), randomFloat(0.35, 1.1, 0.05));

    normalizeSynthNodeWidgets(node);
    if (typeof node.setDirtyCanvas === "function") {
        node.setDirtyCanvas(true, true);
    }
}

function normalizeNodeWidgets(node) {
    const cooldownWidget = getNodeWidget(node, "cooldown_ms");
    if (cooldownWidget) {
        cooldownWidget.value = normalizeCooldownMs(cooldownWidget.value);
    }

    const playbackModeWidget = getNodeWidget(node, "playback_mode");
    if (playbackModeWidget) {
        playbackModeWidget.value = normalizePlaybackMode(String(playbackModeWidget.value || ""));
    }
}

function normalizeSynthNodeWidgets(node) {
    const waveformWidget = getNodeWidget(node, "waveform");
    if (waveformWidget) {
        waveformWidget.value = normalizeSynthWaveform(String(waveformWidget.value || ""));
    }

    const patternWidget = getNodeWidget(node, "pattern");
    if (patternWidget) {
        patternWidget.value = normalizeSynthPattern(String(patternWidget.value || ""));
    }

    const rootPitchWidget = getNodeWidget(node, "root_pitch");
    if (rootPitchWidget) {
        rootPitchWidget.value = normalizeSynthRootPitch(rootPitchWidget.value);
    }

    const noteCountWidget = getNodeWidget(node, "note_count");
    if (noteCountWidget) {
        noteCountWidget.value = normalizeSynthNoteCount(noteCountWidget.value);
    }

    const stepWidget = getNodeWidget(node, "step_ms");
    if (stepWidget) {
        stepWidget.value = normalizeSynthStepMs(stepWidget.value);
    }

    const noteWidget = getNodeWidget(node, "note_ms");
    if (noteWidget) {
        noteWidget.value = normalizeSynthDurationMs(noteWidget.value);
    }

    const attackWidget = getNodeWidget(node, "attack_ms");
    if (attackWidget) {
        attackWidget.value = normalizeSynthAttackMs(attackWidget.value);
    }

    const decayWidget = getNodeWidget(node, "decay_ms");
    if (decayWidget) {
        decayWidget.value = normalizeSynthDecayMs(decayWidget.value);
    }

    const sustainWidget = getNodeWidget(node, "sustain_level");
    if (sustainWidget) {
        sustainWidget.value = normalizeSustainLevel(sustainWidget.value);
    }

    const releaseWidget = getNodeWidget(node, "release_ms");
    if (releaseWidget) {
        releaseWidget.value = normalizeSynthReleaseMs(releaseWidget.value);
    }

    const volumeWidget = getNodeWidget(node, "volume_trim");
    if (volumeWidget) {
        volumeWidget.value = normalizeSynthVolumeTrim(volumeWidget.value);
    }
}

function updateCustomSoundUi(node) {
    const soundWidget = getNodeWidget(node, "sound");
    const customSoundWidget = getNodeWidget(node, "custom_sound");
    const sourceHintWidget = getNodeWidget(node, "resolved_sound_source");

    if (!soundWidget || !customSoundWidget || !sourceHintWidget) {
        return;
    }

    const soundValue = String(soundWidget.value || "");
    const connectedSynthInfo = getConnectedSynthInfo(node);
    const synthConfigConnected = Boolean(connectedSynthInfo?.config);
    const isManualCustom = soundValue === "custom";

    customSoundWidget.options = customSoundWidget.options || {};
    customSoundWidget.options.placeholder = isManualCustom ? CUSTOM_INPUT_PLACEHOLDER : DEFAULT_CUSTOM_PLACEHOLDER;
    customSoundWidget.disabled = !isManualCustom;

    if (typeof customSoundWidget.computeSize === "function") {
        customSoundWidget.size = customSoundWidget.computeSize();
    }

    const customValue = String(customSoundWidget.value || "").trim();
    const hasDiscoveredCustom = soundValue.startsWith(CUSTOM_SOUND_PREFIX);
    const hasManualCustom = soundValue === "custom" && customValue.length > 0;

    if (synthConfigConnected && hasDiscoveredCustom) {
        sourceHintWidget.value = `Custom file is active instead of the connected synth sound: ${soundValue.slice(CUSTOM_SOUND_PREFIX.length)}`;
    } else if (synthConfigConnected && hasManualCustom) {
        sourceHintWidget.value = `Custom file is active instead of the connected synth sound: ${customValue}`;
    } else if (synthConfigConnected && soundValue === "custom" && !customValue) {
        sourceHintWidget.value = `Connected synth sound: ${connectedSynthInfo.label}`;
    } else if (synthConfigConnected) {
        sourceHintWidget.value = `Connected synth sound is active: ${connectedSynthInfo.label}`;
    } else {
        sourceHintWidget.value = describeResolvedSource(soundValue, customSoundWidget.value);
    }
    sourceHintWidget.hidden = false;

    const nodeWidth = node?.size?.[0] || 240;
    if (typeof sourceHintWidget.computeSize === "function") {
        sourceHintWidget.size = sourceHintWidget.computeSize(nodeWidth);
    }

    if (typeof node.setDirtyCanvas === "function") {
        node.setDirtyCanvas(true, true);
    }
}

function refreshSynthPresetOptions(node, selectedName = null) {
    const presetWidget = getNodeWidget(node, "saved_preset");
    if (!presetWidget) {
        return;
    }

    const names = listSynthPresetNames();
    const values = [DEFAULT_SYNTH_PRESET, ...names];
    presetWidget.options = presetWidget.options || {};
    presetWidget.options.values = values;

    const currentValue = String(selectedName ?? presetWidget.value ?? DEFAULT_SYNTH_PRESET);
    presetWidget.value = values.includes(currentValue) ? currentValue : DEFAULT_SYNTH_PRESET;
}

function loadSynthPresetIntoNode(node, presetName) {
    const presetStore = readSynthPresetStore();
    const preset = presetStore[presetName];
    if (!preset) {
        refreshSynthPresetOptions(node, DEFAULT_SYNTH_PRESET);
        showToast(`Saved synth preset “${presetName}” was not found.`, "warning");
        return;
    }

    setWidgetValue(getNodeWidget(node, "preset_name"), preset.preset_name || presetName);
    setWidgetValue(getNodeWidget(node, "waveform"), normalizeSynthWaveform(preset.waveform));
    setWidgetValue(getNodeWidget(node, "root_pitch"), normalizeSynthRootPitch(preset.root_pitch));
    setWidgetValue(getNodeWidget(node, "pattern"), normalizeSynthPattern(preset.pattern));
    setWidgetValue(getNodeWidget(node, "note_count"), normalizeSynthNoteCount(preset.note_count));
    setWidgetValue(getNodeWidget(node, "step_ms"), normalizeSynthStepMs(preset.step_ms));
    setWidgetValue(getNodeWidget(node, "note_ms"), normalizeSynthDurationMs(preset.note_ms));
    setWidgetValue(getNodeWidget(node, "attack_ms"), normalizeSynthAttackMs(preset.attack_ms));
    setWidgetValue(getNodeWidget(node, "decay_ms"), normalizeSynthDecayMs(preset.decay_ms));
    setWidgetValue(getNodeWidget(node, "sustain_level"), normalizeSustainLevel(preset.sustain_level));
    setWidgetValue(getNodeWidget(node, "release_ms"), normalizeSynthReleaseMs(preset.release_ms));
    setWidgetValue(getNodeWidget(node, "volume_trim"), normalizeSynthVolumeTrim(preset.volume_trim));
    refreshSynthPresetOptions(node, presetName);
    if (typeof node.setDirtyCanvas === "function") {
        node.setDirtyCanvas(true, true);
    }
}

function saveSynthPresetFromNode(node) {
    const config = buildSynthConfigFromNode(node);
    const presetName = config.preset_name.trim();
    if (!presetName) {
        showToast("Enter a preset name before saving this Chime Synth preset.", "warning");
        return;
    }

    const presetStore = readSynthPresetStore();
    presetStore[presetName] = config;
    writeSynthPresetStore(presetStore);
    refreshSynthPresetOptions(node, presetName);
    showToast(`Saved Chime Synth preset “${presetName}”.`, "info");
}

function deleteSynthPresetFromNode(node) {
    const presetWidget = getNodeWidget(node, "saved_preset");
    const presetName = String(presetWidget?.value || "");
    if (!presetName || presetName === DEFAULT_SYNTH_PRESET) {
        showToast("Select a saved Chime Synth preset before deleting it.", "warning");
        return;
    }

    const presetStore = readSynthPresetStore();
    if (!presetStore[presetName]) {
        refreshSynthPresetOptions(node, DEFAULT_SYNTH_PRESET);
        showToast(`Saved synth preset “${presetName}” was already missing.`, "warning");
        return;
    }

    delete presetStore[presetName];
    writeSynthPresetStore(presetStore);
    refreshSynthPresetOptions(node, DEFAULT_SYNTH_PRESET);
    showToast(`Deleted Chime Synth preset “${presetName}”.`, "info");
}

async function previewNodeSound(node) {
    await unlockAudio();

    const sound = getNodeWidgetValue(node, "sound", "chime");
    const volume = Number(getNodeWidgetValue(node, "volume", 0.5)) || 0;
    const synthConfig = resolveConnectedSynthConfig(node);
    const customSound = String(getNodeWidgetValue(node, "custom_sound", "") || "").trim();
    const customSoundSourceKind =
        typeof sound === "string" && sound.startsWith(CUSTOM_SOUND_PREFIX)
            ? "discovered_repo"
            : customSound.startsWith("/")
                ? "absolute_path"
                : customSound
                    ? "manual_repo"
                    : "";
    const playbackMode = normalizePlaybackMode(
        String(getNodeWidgetValue(node, "playback_mode", DEFAULT_PLAYBACK_MODE) || DEFAULT_PLAYBACK_MODE)
    );

    await playSoundRequest({
        sound,
        volume,
        playbackMode,
        synthConfig,
        customSoundLabel:
            typeof sound === "string" && sound.startsWith(CUSTOM_SOUND_PREFIX)
                ? sound.slice(CUSTOM_SOUND_PREFIX.length)
                : customSound,
        customSoundSourceKind,
        resolveCustomUrl: () => {
            if (typeof sound === "string" && sound.startsWith(CUSTOM_SOUND_PREFIX)) {
                return getCustomSoundUrl(sound);
            }
            if (sound === "custom") {
                if (!customSound) {
                    if (!synthConfig) {
                        logCustomSoundFailure("resolve", {
                            sourceKind: "manual_repo",
                            detail: "preview requested without a custom path",
                        });
                        showToast("Enter a repo-local file from sounds/ or an absolute path before previewing a custom sound.", "warning");
                    }
                    return null;
                }
                return `/comfyui-chime/preview?path=${encodeURIComponent(customSound)}`;
            }
            return;
        },
    });
}

async function previewSynthNode(node) {
    await unlockAudio();
    normalizeSynthNodeWidgets(node);
    await playSynthConfig(buildSynthConfigFromNode(node));
}

async function playSoundRequest({
    sound,
    volume,
    playbackMode,
    synthConfig,
    customSoundLabel,
    customSoundSourceKind,
    resolveCustomUrl,
}) {
    const mode = normalizePlaybackMode(typeof playbackMode === "string" ? playbackMode : DEFAULT_PLAYBACK_MODE);
    const executePlayback = async () => {
        const customUrl = resolveCustomUrl();
        if (customUrl) {
            await playCustomSound(customUrl, volume, customSoundLabel, customSoundSourceKind);
            return;
        }

        if (sound === "custom") {
            if (synthConfig && typeof synthConfig === "object") {
                await playSynthConfig(synthConfig);
            }
            return;
        }

        if (synthConfig && typeof synthConfig === "object") {
            await playSynthConfig(synthConfig);
            return;
        }

        await playPattern(sound, volume);
    };

    if (mode === "interrupt") {
        playbackQueueRevision += 1;
        playbackQueue = Promise.resolve();
        stopActivePlayback();
        await executePlayback();
        return;
    }

    if (mode === "queue") {
        await queuePlayback(executePlayback);
        return;
    }

    await executePlayback();
}

function shouldSkipForCooldown(nodeId, cooldownMs) {
    const cooldown = normalizeCooldownMs(cooldownMs);
    if (cooldown <= 0) {
        return false;
    }

    const key = nodeId == null ? "__global__" : String(nodeId);
    const now = Date.now();
    const lastPlaybackAt = lastPlaybackAtByNode.get(key);
    if (typeof lastPlaybackAt === "number" && now - lastPlaybackAt < cooldown) {
        return true;
    }

    lastPlaybackAtByNode.set(key, now);
    return false;
}

["pointerdown", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, unlockAudio, { passive: true });
});

api.addEventListener("comfyui-chime.play", async (event) => {
    await unlockAudio();
    const detail = event?.detail ?? {};
    const playbackMode = normalizePlaybackMode(
        typeof detail.playback_mode === "string" ? detail.playback_mode : DEFAULT_PLAYBACK_MODE
    );
    const cooldownMs = normalizeCooldownMs(detail.cooldown_ms);

    if (typeof detail.error_message === "string" && detail.error_message.length > 0) {
        showToast(detail.error_message, "warning");
    }

    if (shouldSkipForCooldown(detail.node_id, cooldownMs)) {
        return;
    }

    await playSoundRequest({
        sound: detail.sound,
        volume: detail.volume,
        playbackMode,
        synthConfig:
            detail.synth_config && typeof detail.synth_config === "object" ? detail.synth_config : null,
        customSoundLabel: typeof detail.custom_sound_label === "string" ? detail.custom_sound_label : "",
        customSoundSourceKind:
            typeof detail.custom_sound_source_kind === "string" ? detail.custom_sound_source_kind : "",
        resolveCustomUrl: () => {
            if (typeof detail.custom_sound_url === "string" && detail.custom_sound_url.length > 0) {
                return detail.custom_sound_url;
            }

            if (detail.sound === "custom") {
                logCustomSoundFailure("resolve", {
                    label: typeof detail.custom_sound_label === "string" ? detail.custom_sound_label : "",
                    sourceKind:
                        typeof detail.custom_sound_source_kind === "string" ? detail.custom_sound_source_kind : "",
                    detail: "custom sound is selected, but no valid file was resolved",
                });
                if (!detail.error_message) {
                    showToast("Custom sound is selected, but no valid file was resolved.", "warning");
                }
                return null;
            }

            if (typeof detail.sound === "string" && detail.sound.startsWith(CUSTOM_SOUND_PREFIX)) {
                return getCustomSoundUrl(detail.sound);
            }

            return null;
        },
    });
});

app.registerExtension({
    name: EXTENSION_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "ChimeNode" && nodeData?.name !== "ChimeSynthNode") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            if (nodeData?.name === "ChimeSynthNode") {
                const savedPresetWidget = getNodeWidget(this, "saved_preset");
                if (savedPresetWidget) {
                    savedPresetWidget.options = savedPresetWidget.options || {};
                    savedPresetWidget.options.values = [DEFAULT_SYNTH_PRESET, ...listSynthPresetNames()];
                    const originalCallback = savedPresetWidget.callback;
                    savedPresetWidget.callback = (...args) => {
                        if (typeof originalCallback === "function") {
                            originalCallback.apply(savedPresetWidget, args);
                        }
                        const selectedName = String(savedPresetWidget.value || DEFAULT_SYNTH_PRESET);
                        if (selectedName !== DEFAULT_SYNTH_PRESET) {
                            loadSynthPresetIntoNode(this, selectedName);
                        }
                    };
                }

                this.addWidget("button", "Preview synth", null, () => {
                    previewSynthNode(this);
                });
                this.addWidget("button", "Randomize synth", null, () => {
                    randomizeSynthNode(this);
                });
                this.addWidget("button", "Save preset", null, () => {
                    saveSynthPresetFromNode(this);
                });
                this.addWidget("button", "Delete preset", null, () => {
                    deleteSynthPresetFromNode(this);
                });

                normalizeSynthNodeWidgets(this);
                refreshSynthPresetOptions(this, String(savedPresetWidget?.value || DEFAULT_SYNTH_PRESET));
                return result;
            }

            const soundWidget = getNodeWidget(this, "sound");
            const customSoundWidget = getNodeWidget(this, "custom_sound");
            if (customSoundWidget) {
                customSoundWidget.options = customSoundWidget.options || {};
                customSoundWidget.options.placeholder = DEFAULT_CUSTOM_PLACEHOLDER;
            }

            const sourceHintWidget = createInfoWidget(
                "resolved_sound_source",
                "Source",
                SOURCE_HINT_BUILT_IN
            );
            if (typeof this.addCustomWidget === "function") {
                this.addCustomWidget(sourceHintWidget);
            } else if (Array.isArray(this.widgets)) {
                this.widgets.push(sourceHintWidget);
            }
            this.addWidget("button", "Preview sound", null, () => {
                previewNodeSound(this);
            });

            if (soundWidget) {
                const originalCallback = soundWidget.callback;
                soundWidget.callback = (...args) => {
                    if (typeof originalCallback === "function") {
                        originalCallback.apply(soundWidget, args);
                    }
                    updateCustomSoundUi(this);
                };
            }

            if (customSoundWidget) {
                const originalCallback = customSoundWidget.callback;
                customSoundWidget.callback = (...args) => {
                    if (typeof originalCallback === "function") {
                        originalCallback.apply(customSoundWidget, args);
                    }
                    updateCustomSoundUi(this);
                };
            }

            normalizeNodeWidgets(this);
            updateCustomSoundUi(this);
            return result;
        };
    },
});
