import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "comfyui-chime";
const MAX_MASTER_GAIN = 0.75;
const CUSTOM_SOUND_PREFIX = "custom:";
const TOAST_DURATION_MS = 3200;
const DEFAULT_CUSTOM_PLACEHOLDER = "Optional when using a built-in sound";
const CUSTOM_INPUT_PLACEHOLDER = "sounds/ding.mp3 or /absolute/path/to/ding.wav";
const CUSTOM_HELP_INACTIVE = "Using a built-in sound. Select custom to enter a file path.";
const CUSTOM_HELP_ACTIVE = "Custom sound: use a filename from sounds/ or an absolute local path.";
const CUSTOM_HELP_DISCOVERED = "This dropdown entry points to a file already discovered in sounds/.";
const SOURCE_HINT_BUILT_IN = "Resolved source: built-in synth";
const SOURCE_HINT_CUSTOM_EMPTY = "Resolved source: waiting for a custom file path";
const BUILT_IN_SOUNDS = new Set([
    "alert",
    "bell",
    "bloom",
    "soft",
    "sparkle",
    "success",
    "chime",
    "mellow",
    "pulse",
    "rise",
    "glass",
    "retro",
]);
const DEFAULT_PLAYBACK_MODE = "interrupt";
const DEFAULT_TONE_CHARACTER = "default";
const DEFAULT_WAVEFORM = "auto";
const MIN_PITCH_SHIFT = -36;
const MAX_PITCH_SHIFT = 36;
const MAX_COOLDOWN_MS = 60000;
const PLAYBACK_MODES = new Set(["interrupt", "overlap", "queue"]);
const TONE_CHARACTERS = new Set(["default", "warm", "bright", "hollow"]);
const WAVEFORMS = new Set(["auto", "sine", "triangle", "square", "sawtooth"]);
const SOUND_DURATIONS_MS = {
    alert: 520,
    bell: 920,
    bloom: 1150,
    soft: 720,
    sparkle: 820,
    success: 620,
    chime: 900,
    mellow: 980,
    pulse: 760,
    rise: 880,
    glass: 740,
    retro: 680,
};

let audioContext = null;
let toastElement = null;
let toastTimer = null;
let playbackQueue = Promise.resolve();
let playbackQueueRevision = 0;
const lastPlaybackAtByNode = new Map();
const activeCustomSounds = new Set();
const activeSynthSounds = new Set();

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

function normalizePlaybackMode(value) {
    return PLAYBACK_MODES.has(value) ? value : DEFAULT_PLAYBACK_MODE;
}

function normalizeToneCharacter(value) {
    return TONE_CHARACTERS.has(value) ? value : DEFAULT_TONE_CHARACTER;
}

function normalizeWaveform(value) {
    return WAVEFORMS.has(value) ? value : DEFAULT_WAVEFORM;
}

function describeResolvedSource(soundValue, customSoundValue) {
    if (typeof soundValue === "string" && soundValue.startsWith(CUSTOM_SOUND_PREFIX)) {
        const filename = soundValue.slice(CUSTOM_SOUND_PREFIX.length);
        return filename ? `Resolved source: repo-local file sounds/${filename}` : SOURCE_HINT_CUSTOM_EMPTY;
    }

    if (soundValue === "custom") {
        const customValue = String(customSoundValue || "").trim();
        if (!customValue) {
            return SOURCE_HINT_CUSTOM_EMPTY;
        }

        if (customValue.startsWith("/")) {
            return `Resolved source: absolute local file ${customValue}`;
        }

        return `Resolved source: repo-local file sounds/${customValue}`;
    }

    if (BUILT_IN_SOUNDS.has(String(soundValue || ""))) {
        return `Resolved source: built-in synth ${soundValue}`;
    }

    return SOURCE_HINT_BUILT_IN;
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
    const clampedVolume = Math.max(0, Math.min(1, Number(volume) || 0));
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
        case "soft":
            tones.push(scheduleTone(ctx, master, now, 523.25 * pitchMultiplier, 0.18, accentType, 0.35 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.14, 659.25 * pitchMultiplier, 0.25, accentType, 0.3 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.28, 783.99 * pitchMultiplier, 0.4, primaryType, 0.28 * gainMultiplier));
            break;
        case "sparkle":
            tones.push(scheduleTone(ctx, master, now, 1174.66 * pitchMultiplier, 0.08, accentType, 0.26 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.07, 1567.98 * pitchMultiplier, 0.08, primaryType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.14, 2093 * pitchMultiplier, 0.12, accentType, 0.2 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.28, 1318.51 * pitchMultiplier, 0.32, primaryType, 0.18 * gainMultiplier));
            break;
        case "success":
            tones.push(scheduleTone(ctx, master, now, 659.25 * pitchMultiplier, 0.12, primaryType, 0.5 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.12, 783.99 * pitchMultiplier, 0.12, primaryType, 0.45 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.24, 987.77 * pitchMultiplier, 0.3, primaryType, 0.4 * gainMultiplier));
            break;
        case "mellow":
            tones.push(scheduleTone(ctx, master, now, 349.23 * pitchMultiplier, 0.28, accentType, 0.28 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.24, 440 * pitchMultiplier, 0.34, primaryType, 0.24 * gainMultiplier));
            tones.push(scheduleTone(ctx, master, now + 0.52, 523.25 * pitchMultiplier, 0.42, accentType, 0.2 * gainMultiplier));
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

function getCustomSoundUrl(sound) {
    const filename = sound.slice(CUSTOM_SOUND_PREFIX.length);
    return `/comfyui-chime/sounds/${encodeURIComponent(filename)}`;
}

async function playCustomSound(url, volume = 0.5) {
    const clampedVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    const audio = new Audio(url);
    audio.volume = clampedVolume;
    audio.preload = "auto";

    return new Promise((resolve) => {
        const entry = {
            audio,
            resolve,
            finished: false,
        };
        activeCustomSounds.add(entry);

        const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
            finalizePlaybackEntry(entry, activeCustomSounds);
        };

        audio.onended = cleanup;
        audio.onerror = cleanup;

        audio.play().catch((error) => {
            console.warn("[ComfyUI-Chime] Failed to play custom sound.", error);
            showToast("Custom sound could not play. If this keeps happening, try wav or mp3.", "warning");
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

function normalizeNodeWidgets(node) {
    const cooldownWidget = getNodeWidget(node, "cooldown_ms");
    if (cooldownWidget) {
        cooldownWidget.value = normalizeCooldownMs(cooldownWidget.value);
    }

    const playbackModeWidget = getNodeWidget(node, "playback_mode");
    if (playbackModeWidget) {
        playbackModeWidget.value = normalizePlaybackMode(String(playbackModeWidget.value || ""));
    }

    const pitchShiftWidget = getNodeWidget(node, "pitch_shift");
    if (pitchShiftWidget) {
        pitchShiftWidget.value = normalizePitchShift(pitchShiftWidget.value);
    }

    const toneCharacterWidget = getNodeWidget(node, "tone_character");
    if (toneCharacterWidget) {
        toneCharacterWidget.value = normalizeToneCharacter(String(toneCharacterWidget.value || ""));
    }

    const waveformWidget = getNodeWidget(node, "waveform");
    if (waveformWidget) {
        waveformWidget.value = normalizeWaveform(String(waveformWidget.value || ""));
    }
}

function updateCustomSoundUi(node) {
    const soundWidget = getNodeWidget(node, "sound");
    const customSoundWidget = getNodeWidget(node, "custom_sound");
    const helperWidget = getNodeWidget(node, "custom_sound_help");
    const sourceHintWidget = getNodeWidget(node, "resolved_sound_source");

    if (!soundWidget || !customSoundWidget || !helperWidget || !sourceHintWidget) {
        return;
    }

    const soundValue = String(soundWidget.value || "");
    const isManualCustom = soundValue === "custom";
    const isDiscoveredCustom = soundValue.startsWith(CUSTOM_SOUND_PREFIX);

    customSoundWidget.options = customSoundWidget.options || {};
    customSoundWidget.options.placeholder = isManualCustom ? CUSTOM_INPUT_PLACEHOLDER : DEFAULT_CUSTOM_PLACEHOLDER;
    customSoundWidget.disabled = !isManualCustom;

    if (typeof customSoundWidget.computeSize === "function") {
        customSoundWidget.size = customSoundWidget.computeSize();
    }

    if (isManualCustom) {
        helperWidget.value = CUSTOM_HELP_ACTIVE;
    } else if (isDiscoveredCustom) {
        helperWidget.value = CUSTOM_HELP_DISCOVERED;
    } else {
        helperWidget.value = CUSTOM_HELP_INACTIVE;
    }
    sourceHintWidget.value = describeResolvedSource(soundValue, customSoundWidget.value);

    if (typeof node.setDirtyCanvas === "function") {
        node.setDirtyCanvas(true, true);
    }
}

async function previewNodeSound(node) {
    await unlockAudio();

    const sound = getNodeWidgetValue(node, "sound", "chime");
    const volume = Number(getNodeWidgetValue(node, "volume", 0.5)) || 0;
    const pitchShift = normalizePitchShift(getNodeWidgetValue(node, "pitch_shift", 0.0));
    const toneCharacter = normalizeToneCharacter(
        String(getNodeWidgetValue(node, "tone_character", DEFAULT_TONE_CHARACTER) || DEFAULT_TONE_CHARACTER)
    );
    const waveform = normalizeWaveform(String(getNodeWidgetValue(node, "waveform", DEFAULT_WAVEFORM) || DEFAULT_WAVEFORM));
    const customSound = String(getNodeWidgetValue(node, "custom_sound", "") || "").trim();
    const playbackMode = normalizePlaybackMode(
        String(getNodeWidgetValue(node, "playback_mode", DEFAULT_PLAYBACK_MODE) || DEFAULT_PLAYBACK_MODE)
    );

    await playSoundRequest({
        sound,
        volume,
        pitchShift,
        toneCharacter,
        waveform,
        playbackMode,
        resolveCustomUrl: () => {
            if (typeof sound === "string" && sound.startsWith(CUSTOM_SOUND_PREFIX)) {
                return getCustomSoundUrl(sound);
            }
            if (sound === "custom") {
                if (!customSound) {
                    showToast("Enter a file in sounds/ or an absolute path before previewing a custom sound.", "warning");
                    return null;
                }
                return `/comfyui-chime/preview?path=${encodeURIComponent(customSound)}`;
            }
            return;
        },
    });
}

async function playSoundRequest({
    sound,
    volume,
    pitchShift,
    toneCharacter,
    waveform,
    playbackMode,
    resolveCustomUrl,
}) {
    const mode = normalizePlaybackMode(typeof playbackMode === "string" ? playbackMode : DEFAULT_PLAYBACK_MODE);
    const executePlayback = async () => {
        const customUrl = resolveCustomUrl();
        if (customUrl) {
            await playCustomSound(customUrl, volume);
            return;
        }

        if (sound === "custom") {
            return;
        }

        await playPattern(sound, volume, pitchShift, toneCharacter, waveform);
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
    const pitchShift = normalizePitchShift(detail.pitch_shift);
    const toneCharacter = normalizeToneCharacter(
        typeof detail.tone_character === "string" ? detail.tone_character : DEFAULT_TONE_CHARACTER
    );
    const waveform = normalizeWaveform(typeof detail.waveform === "string" ? detail.waveform : DEFAULT_WAVEFORM);

    if (typeof detail.error_message === "string" && detail.error_message.length > 0) {
        showToast(detail.error_message, "warning");
    }

    if (shouldSkipForCooldown(detail.node_id, cooldownMs)) {
        return;
    }

    await playSoundRequest({
        sound: detail.sound,
        volume: detail.volume,
        pitchShift,
        toneCharacter,
        waveform,
        playbackMode,
        resolveCustomUrl: () => {
            if (typeof detail.custom_sound_url === "string" && detail.custom_sound_url.length > 0) {
                return detail.custom_sound_url;
            }

            if (detail.sound === "custom") {
                console.warn("[ComfyUI-Chime] Custom sound selected, but no valid sound file was resolved.");
                if (!detail.error_message) {
                    showToast("Custom sound selected, but no valid sound file was resolved.", "warning");
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
        if (nodeData?.name !== "ChimeNode") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            const soundWidget = getNodeWidget(this, "sound");
            const customSoundWidget = getNodeWidget(this, "custom_sound");
            if (customSoundWidget) {
                customSoundWidget.options = customSoundWidget.options || {};
                customSoundWidget.options.placeholder = DEFAULT_CUSTOM_PLACEHOLDER;
            }

            const helperWidget = this.addWidget("text", "custom_sound_help", CUSTOM_HELP_INACTIVE, null, {
                multiline: true,
            });
            if (helperWidget) {
                helperWidget.disabled = true;
            }
            const sourceHintWidget = this.addWidget("text", "resolved_sound_source", SOURCE_HINT_BUILT_IN, null, {
                multiline: true,
            });
            if (sourceHintWidget) {
                sourceHintWidget.disabled = true;
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
