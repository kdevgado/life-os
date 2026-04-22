import React from "react";

type SoundDef = {
  id: string;
  label: string;
  iconLight: string;
  iconDark: string;
  src: string;
};

const SOUND_DEFS: SoundDef[] = [
  {
    id: "rain",
    label: "Rain",
    iconLight: "/icons/black/sounds.png",
    iconDark: "/icons/white/sounds.png",
    src: "/audio/gentle-rain.mp3",
  },
  {
    id: "cafe",
    label: "Cafe",
    iconLight: "/icons/black/sounds.png",
    iconDark: "/icons/white/sounds.png",
    src: "/audio/cafe.mp3",
  },
  {
    id: "fireplace",
    label: "Fireplace",
    iconLight: "/icons/black/sounds.png",
    iconDark: "/icons/white/sounds.png",
    src: "/audio/fireplace.mp3",
  },
];

const SOUND_EMOJIS: Record<string, string> = {
  rain: "🌧️",
  cafe: "☕",
  fireplace: "🔥",
};

const MASTER_VOLUME_KEY = "lifeos_sound_master_volume";
const WALLPAPER_VOLUME_KEY = "lifeos_wallpaper_volume";
const SOUND_VOLUMES_KEY = "lifeos_sound_volumes";
const YOUTUBE_LINK_KEY = "lifeos_youtube_link";

function clampVolume(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function readNumber(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampVolume(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function readVolumes() {
  if (typeof window === "undefined") return {} as Record<string, number>;

  try {
    const raw = window.localStorage.getItem(SOUND_VOLUMES_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        clampVolume(Number(value)),
      ]),
    );
  } catch {
    return {};
  }
}

function readText(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;

  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function SoundsPanel() {
  const [theme, setTheme] = React.useState<"duna" | "nebula">(() => {
    if (typeof document === "undefined") return "duna";
    return document.documentElement.getAttribute("data-theme") === "nebula"
      ? "nebula"
      : "duna";
  });

  const [masterVolume, setMasterVolume] = React.useState<number>(() =>
    readNumber(MASTER_VOLUME_KEY, 1),
  );
  const [wallpaperVolume, setWallpaperVolume] = React.useState<number>(() =>
    readNumber(WALLPAPER_VOLUME_KEY, 0.5),
  );
  const [youtubeUrl, setYoutubeUrl] = React.useState<string>(() =>
    readText(YOUTUBE_LINK_KEY),
  );
  const [soundVolumes, setSoundVolumes] = React.useState<
    Record<string, number>
  >(() => {
    const saved = readVolumes();
    const withDefaults: Record<string, number> = {};

    for (const sound of SOUND_DEFS) {
      withDefaults[sound.id] = clampVolume(saved[sound.id] ?? 0);
    }

    return withDefaults;
  });

  const audioRefs = React.useRef<Record<string, HTMLAudioElement | null>>({});

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    const syncTheme = () => {
      setTheme(
        root.getAttribute("data-theme") === "nebula" ? "nebula" : "duna",
      );
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume));
  }, [masterVolume]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WALLPAPER_VOLUME_KEY, String(wallpaperVolume));
    window.dispatchEvent(new Event("lifeos:wallpaper-audio"));
  }, [wallpaperVolume]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(YOUTUBE_LINK_KEY, youtubeUrl);
  }, [youtubeUrl]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SOUND_VOLUMES_KEY,
      JSON.stringify(soundVolumes),
    );
  }, [soundVolumes]);

  React.useEffect(() => {
    for (const sound of SOUND_DEFS) {
      const audio = audioRefs.current[sound.id];
      if (!audio) continue;

      const localVolume = clampVolume(soundVolumes[sound.id] ?? 0);
      const finalVolume = clampVolume(localVolume * masterVolume);

      audio.volume = finalVolume;

      if (localVolume > 0) {
        void audio.play().catch(() => {
          // Ignore autoplay restrictions until user interacts.
        });
      } else {
        audio.pause();
      }
    }
  }, [masterVolume, soundVolumes]);

  const updateSoundVolume = React.useCallback((id: string, value: number) => {
    setSoundVolumes((prev) => ({
      ...prev,
      [id]: clampVolume(value),
    }));
  }, []);

  const toggleMute = (id: string) => {
    setSoundVolumes((prev) => {
      const current = prev[id] ?? 0;

      return {
        ...prev,
        [id]: current > 0 ? 0 : 0.5, // restore to 50% when unmuting
      };
    });
  };

  return (
    <div className="lo-sounds">
      <section className="lo-sounds__section">
        <div className="lo-sounds__section-head">
          <div>
            <div className="lo-sounds__title">Master Volume</div>
            <div className="lo-sounds__hint">
              Controls all ambient sound sliders together
            </div>
          </div>
          <div className="lo-sounds__value">
            {Math.round(masterVolume * 100)}%
          </div>
        </div>

        <input
          className="lo-sounds__slider lo-sounds__slider--master"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={masterVolume}
          onChange={(e) => setMasterVolume(clampVolume(Number(e.target.value)))}
          aria-label="Master volume"
        />
      </section>

      <section className="lo-sounds__section">
        <div className="lo-sounds__section-head">
          <div>
            <div className="lo-sounds__title">Wallpaper Audio</div>
            <div className="lo-sounds__hint">
              Adjust the video wallpaper volume
            </div>
          </div>
          <div className="lo-sounds__value">
            {wallpaperVolume <= 0
              ? "Muted"
              : `${Math.round(wallpaperVolume * 100)}%`}
          </div>
        </div>

        <input
          className="lo-sounds__slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={wallpaperVolume}
          onChange={(e) =>
            setWallpaperVolume(clampVolume(Number(e.target.value)))
          }
          aria-label="Wallpaper audio volume"
        />
      </section>

      <section className="lo-sounds__section">
        <div className="lo-sounds__section-head">
          <div>
            <div className="lo-sounds__title">YouTube Link</div>
            <div className="lo-sounds__hint">
              Save a music or ambience link for quick access
            </div>
          </div>
        </div>

        <input
          className="lo-sounds__input"
          type="url"
          value={youtubeUrl}
          placeholder="Paste YouTube link..."
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />

        {youtubeUrl.trim() ? (
          <a
            className="lo-sounds__link"
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open YouTube link
          </a>
        ) : null}
      </section>

      <section className="lo-sounds__section">
        <div className="lo-sounds__section-head">
          <div>
            <div className="lo-sounds__title">Ambiance</div>
          </div>
        </div>

        <div className="lo-sounds__list">
          {SOUND_DEFS.map((sound) => {
            const localVolume = clampVolume(soundVolumes[sound.id] ?? 0);
            const iconSrc =
              theme === "nebula" ? sound.iconDark : sound.iconLight;

            return (
              <div key={sound.id} className="lo-sounds__item">
                <audio
                  ref={(node) => {
                    audioRefs.current[sound.id] = node;
                  }}
                  loop
                  preload="none"
                  src={sound.src}
                />

                <div className="lo-sounds__item-top">
                  <div className="lo-sounds__item-meta">
                    <span className="lo-sounds__icon" aria-hidden="true">
                      <span className="lo-sounds__emoji">
                        {SOUND_EMOJIS[sound.id] ?? "🎧"}
                      </span>
                    </span>

                    <div className="lo-sounds__item-copy">
                      <div className="lo-sounds__label">{sound.label}</div>
                      <div className="lo-sounds__hint">
                        {localVolume <= 0
                          ? "Off"
                          : `${Math.round(localVolume * 100)}%`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lo-sounds__slider-row">
                  <button
                    type="button"
                    className="lo-sounds__mute-btn"
                    onClick={() => toggleMute(sound.id)}
                    aria-label={
                      localVolume > 0
                        ? `Mute ${sound.label}`
                        : `Unmute ${sound.label}`
                    }
                  >
                    {localVolume > 0 ? "🔊" : "🔇"}
                  </button>

                  <input
                    className="lo-sounds__slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={localVolume}
                    onChange={(e) =>
                      updateSoundVolume(sound.id, Number(e.target.value))
                    }
                    aria-label={`${sound.label} volume`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
