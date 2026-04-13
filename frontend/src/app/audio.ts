export interface AudioSettings {
  bgm: number;
  card: number;
  victory: number;
}

type AudioChannel = keyof AudioSettings;

const AUDIO_SETTINGS_STORAGE_KEY = "aipot_audio_settings";
export const AUDIO_SETTINGS_UPDATED_EVENT = "aipot:audio-settings-updated";

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  bgm: 40,
  card: 100,
  victory: 100,
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function clampVolume(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSettings(raw?: Partial<AudioSettings> | null): AudioSettings {
  const base = raw ?? {};
  return {
    bgm: clampVolume(base.bgm, DEFAULT_AUDIO_SETTINGS.bgm),
    card: clampVolume(base.card, DEFAULT_AUDIO_SETTINGS.card),
    victory: clampVolume(base.victory, DEFAULT_AUDIO_SETTINGS.victory),
  };
}

export function getAudioSettings(): AudioSettings {
  if (!canUseStorage()) {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_AUDIO_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function setAudioSettings(next: Partial<AudioSettings>) {
  const merged = normalizeSettings({
    ...getAudioSettings(),
    ...next,
  });

  if (canUseStorage()) {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(AUDIO_SETTINGS_UPDATED_EVENT));
  }

  audioManager.applySettings(merged);
  return merged;
}

class AudioManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmEnabled = false;
  private initialized = false;
  private unlocked = false;
  private latestSettings: AudioSettings = getAudioSettings();

  private unlockPlayback() {
    if (this.unlocked) return;
    this.ensureBgmAudio();
    if (!this.bgmAudio) return;

    const restoreTime = this.bgmAudio.currentTime;
    const restoreVolume = this.bgmAudio.volume;
    this.bgmAudio.volume = 0;

    void this.bgmAudio.play().then(() => {
      if (!this.bgmAudio) return;
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = restoreTime;
      this.bgmAudio.volume = restoreVolume;
      this.unlocked = true;
      this.syncBgm();
    }).catch(() => {
      if (!this.bgmAudio) return;
      this.bgmAudio.volume = restoreVolume;
    });
  }

  private ensureInit() {
    if (typeof window === "undefined" || this.initialized) return;
    this.initialized = true;

    const sync = () => {
      this.latestSettings = getAudioSettings();
      this.syncBgm();
    };

    window.addEventListener(AUDIO_SETTINGS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    window.addEventListener("pointerdown", () => this.unlockPlayback(), { passive: true });
    window.addEventListener("keydown", () => this.unlockPlayback());
    document.addEventListener("visibilitychange", () => this.syncBgm());
  }

  private ensureBgmAudio() {
    if (this.bgmAudio || typeof window === "undefined") return;

    const audio = new Audio("/sound/bgm.mp3");
    audio.loop = true;
    audio.preload = "auto";
    this.bgmAudio = audio;
  }

  setBgmEnabled(enabled: boolean) {
    this.ensureInit();
    this.ensureBgmAudio();
    this.bgmEnabled = enabled;
    this.syncBgm();
  }

  applySettings(settings?: AudioSettings) {
    this.ensureInit();
    this.ensureBgmAudio();
    if (settings) {
      this.latestSettings = normalizeSettings(settings);
    } else {
      this.latestSettings = getAudioSettings();
    }
    this.syncBgm();
  }

  private syncBgm() {
    if (!this.bgmAudio) return;

    const volume = this.latestSettings.bgm / 100;
    this.bgmAudio.volume = volume;

    if (!this.bgmEnabled || document.hidden || volume <= 0) {
      this.bgmAudio.pause();
      return;
    }

    void this.bgmAudio.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    });
  }

  private playEffect(fileName: string, channel: AudioChannel) {
    this.ensureInit();
    const settings = getAudioSettings();
    const volume = settings[channel] / 100;
    if (volume <= 0) return;

    const effect = new Audio(`/sound/${fileName}`);
    effect.preload = "auto";
    effect.volume = volume;
    void effect.play().catch(() => {
      // Ignore blocked playback attempts.
    });
  }

  playCardPlace() {
    this.playEffect("card-place.ogg", "card");
  }

  playCardSlide() {
    this.playEffect("card-slide.ogg", "card");
  }

  playVictory() {
    this.playEffect("victory.mp3", "victory");
  }
}

export const audioManager = new AudioManager();
