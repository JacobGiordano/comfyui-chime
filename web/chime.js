import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "comfyui-chime";
const MAX_MASTER_GAIN = 0.45;
const CUSTOM_SOUND_PREFIX = "custom:";

let audioContext = null;
let htmlAudio = null;

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
        return;
    }

    if (ctx.state === "suspended") {
        try {
            await ctx.resume();
        } catch (error) {
            console.warn("[ComfyUI-Chime] Failed to resume audio context.", error);
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
}

function playPattern(sound, volume = 0.5) {
    const ctx = getAudioContext();
    if (!ctx) {
        console.warn("[ComfyUI-Chime] Web Audio API is not available in this environment.");
        return;
    }

    const master = ctx.createGain();
    const clampedVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    master.gain.value = clampedVolume * MAX_MASTER_GAIN;
    master.connect(ctx.destination);

    const now = ctx.currentTime + 0.01;

    switch (sound) {
        case "bell":
            scheduleTone(ctx, master, now, 880, 0.9, "sine", 0.9);
            scheduleTone(ctx, master, now + 0.02, 1320, 0.7, "triangle", 0.4);
            scheduleTone(ctx, master, now + 0.04, 1760, 0.5, "sine", 0.15);
            break;
        case "soft":
            scheduleTone(ctx, master, now, 523.25, 0.18, "sine", 0.35);
            scheduleTone(ctx, master, now + 0.14, 659.25, 0.25, "sine", 0.3);
            scheduleTone(ctx, master, now + 0.28, 783.99, 0.4, "triangle", 0.28);
            break;
        case "success":
            scheduleTone(ctx, master, now, 659.25, 0.12, "triangle", 0.5);
            scheduleTone(ctx, master, now + 0.12, 783.99, 0.12, "triangle", 0.45);
            scheduleTone(ctx, master, now + 0.24, 987.77, 0.3, "triangle", 0.4);
            break;
        case "chime":
        default:
            scheduleTone(ctx, master, now, 587.33, 0.16, "triangle", 0.55);
            scheduleTone(ctx, master, now + 0.12, 783.99, 0.2, "triangle", 0.45);
            scheduleTone(ctx, master, now + 0.28, 1174.66, 0.55, "sine", 0.3);
            break;
    }
}

function getCustomSoundUrl(sound) {
    const filename = sound.slice(CUSTOM_SOUND_PREFIX.length);
    return `/comfyui-chime/sounds/${encodeURIComponent(filename)}`;
}

async function playCustomSound(url, volume = 0.5) {
    const clampedVolume = Math.max(0, Math.min(1, Number(volume) || 0));

    if (htmlAudio) {
        htmlAudio.pause();
        htmlAudio = null;
    }

    const audio = new Audio(url);
    audio.volume = clampedVolume;
    audio.preload = "auto";
    htmlAudio = audio;

    try {
        await audio.play();
    } catch (error) {
        console.warn("[ComfyUI-Chime] Failed to play custom sound.", error);
    }
}

["pointerdown", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, unlockAudio, { passive: true });
});

api.addEventListener("comfyui-chime.play", async (event) => {
    await unlockAudio();
    const detail = event?.detail ?? {};
    if (typeof detail.custom_sound_url === "string" && detail.custom_sound_url.length > 0) {
        await playCustomSound(detail.custom_sound_url, detail.volume);
        return;
    }

    if (detail.sound === "custom") {
        console.warn("[ComfyUI-Chime] Custom sound selected, but no valid sound file was resolved.");
        return;
    }

    if (typeof detail.sound === "string" && detail.sound.startsWith(CUSTOM_SOUND_PREFIX)) {
        await playCustomSound(getCustomSoundUrl(detail.sound), detail.volume);
        return;
    }

    playPattern(detail.sound, detail.volume);
});

app.registerExtension({
    name: EXTENSION_NAME,
});
