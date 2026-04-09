// /src/components/spaces/SpacesPanel.tsx
import React from "react";
import { WALLPAPERS, type WallpaperItem } from "../../data/wallpapers";

function useIsVisible<T extends HTMLElement>(
  rootMargin = "200px",
): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, isVisible];
}

type WallpaperPreviewCardProps = {
  item: WallpaperItem;
  isSelected: boolean;
  isFavourite: boolean;
  onSelect: (src: string) => void;
  onToggleFavourite: (id: string) => void;
};

function WallpaperPreviewCard({
  item,
  isSelected,
  isFavourite,
  onSelect,
  onToggleFavourite,
}: WallpaperPreviewCardProps) {
  const [ref, isVisible] = useIsVisible<HTMLButtonElement>("250px");

  return (
    <button
      ref={ref}
      type="button"
      className={`lo-spaces__card${isSelected ? " is-active" : ""}`}
      onClick={() => onSelect(item.src)}
      aria-pressed={isSelected}
    >
      <div className="lo-spaces__preview">
        {item.type === "video" ? (
          isVisible ? (
            <video
              className="lo-spaces__preview-video"
              src={item.src}
              muted
              playsInline
              preload="metadata"
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.currentTime = 0;
                void el.play().catch(() => {});
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.pause();
                el.currentTime = 0;
              }}
            />
          ) : (
            <div className="lo-spaces__preview-placeholder">Video preview</div>
          )
        ) : isVisible ? (
          <img
            className="lo-spaces__preview-image"
            src={item.src}
            alt={item.title}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="lo-spaces__preview-placeholder">Image preview</div>
        )}

        <button
          type="button"
          className={`lo-spaces__favourite${isFavourite ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavourite(item.id);
          }}
          aria-label={isFavourite ? "Remove favourite" : "Add favourite"}
        >
          ★
        </button>
      </div>

      <div className="lo-spaces__meta">
        <span className="lo-spaces__title">{item.title}</span>
      </div>
    </button>
  );
}

export default function SpacesPanel() {
  const [theme, setTheme] = React.useState<"duna" | "nebula">("duna");
  const [selected, setSelected] = React.useState<string>("");
  const [tab, setTab] = React.useState<"video" | "image" | "favourites">(
    "video",
  );
  const [favourites, setFavourites] = React.useState<string[]>([]);

  const [videoMuted, setVideoMuted] = React.useState(true);
  const [videoVolume, setVideoVolume] = React.useState(0.5);

  const selectedWallpaper = React.useMemo(
    () => WALLPAPERS.find((item) => item.src === selected),
    [selected],
  );

  const CATEGORY_OPTIONS = [
    { value: "all", label: "All" },
    { value: "nature", label: "Nature", icon: "🌿" },
    { value: "countries", label: "Countries", icon: "🌎" },
    { value: "retro", label: "Retro", icon: "👾" },
    { value: "games", label: "Games", icon: "🎮" },
    { value: "anime", label: "Anime", icon: "✨" },
    { value: "cars", label: "Cars", icon: "🏎️" },
  ] as const;

  const [category, setCategory] = React.useState<
    "all" | "nature" | "countries" | "retro" | "games" | "anime" | "cars"
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 720;
  });

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  React.useEffect(() => {
    const savedMuted = localStorage.getItem("lifeos_wallpaper_muted");
    const savedVolume = localStorage.getItem("lifeos_wallpaper_volume");

    setVideoMuted(savedMuted === null ? true : savedMuted === "true");
    setVideoVolume(savedVolume ? Number(savedVolume) : 0.5);

    try {
      const savedTheme =
        (localStorage.getItem("lifeos_theme") || "duna").toLowerCase() ===
        "nebula"
          ? "nebula"
          : "duna";

      const savedWallpaper =
        localStorage.getItem("lifeos_wallpaper") || WALLPAPERS[0].src;

      const savedFavourites = JSON.parse(
        localStorage.getItem("lifeos_wallpaper_favourites") || "[]",
      ) as string[];

      setTheme(savedTheme);
      setSelected(savedWallpaper);
      setFavourites(
        Array.isArray(savedFavourites)
          ? Array.from(
              new Set(
                savedFavourites.filter(
                  (v): v is string => typeof v === "string",
                ),
              ),
            )
          : [],
      );
    } catch {
      setTheme("duna");
      setSelected(WALLPAPERS[0].src);
      setFavourites([]);
    }
  }, []);

  const applyWallpaper = (src: string) => {
    setSelected(src);
    try {
      localStorage.setItem("lifeos_wallpaper", src);
      window.dispatchEvent(new Event("lifeos:wallpaper"));
    } catch {}
  };

  const toggleFavourite = (id: string) => {
    setFavourites((prev) => {
      const safePrev = Array.from(new Set(prev));

      const next = safePrev.includes(id)
        ? safePrev.filter((item) => item !== id)
        : [...safePrev, id];

      try {
        localStorage.setItem(
          "lifeos_wallpaper_favourites",
          JSON.stringify(next),
        );
      } catch {}

      return next;
    });
  };

  const uniqueWallpapers = React.useMemo(() => {
    const seen = new Set<string>();
    return WALLPAPERS.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, []);

  const filteredWallpapers = React.useMemo(() => {
    let list = uniqueWallpapers;

    if (tab === "favourites") {
      list = list.filter((item) => favourites.includes(item.id));
    } else if (tab === "video") {
      list = list.filter((item) => item.type === "video");
    } else if (tab === "image") {
      list = list.filter((item) => item.type === "image");
    }

    if (category !== "all") {
      list = list.filter((item) => item.category === category);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => item.title.toLowerCase().includes(query));
    }

    const seen = new Set<string>();
    return list.filter((item) => {
      const key = item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [uniqueWallpapers, tab, favourites, category, searchQuery]);

  const toggleVideoMuted = () => {
    setVideoMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("lifeos_wallpaper_muted", String(next));
        window.dispatchEvent(new Event("lifeos:wallpaper-audio"));
      } catch {}
      return next;
    });
  };

  const changeVideoVolume = (value: number) => {
    setVideoVolume(value);
    try {
      localStorage.setItem("lifeos_wallpaper_volume", String(value));
      window.dispatchEvent(new Event("lifeos:wallpaper-audio"));
    } catch {}
  };

  return (
    <div className="lo-spaces">
      <div className="lo-spaces__top">
        {!isMobile && (
          <div className="lo-spaces__section">
            <div className="lo-spaces__label">
              <strong>Theme</strong>
              <span>Duna / Nebula</span>
            </div>

            <select
              className="lo-spaces__select"
              value={theme}
              onChange={(e) => {
                const v = e.target.value === "nebula" ? "nebula" : "duna";
                setTheme(v);
                localStorage.setItem("lifeos_theme", v);
                document.documentElement.setAttribute("data-theme", v);
              }}
            >
              <option value="duna">Duna</option>
              <option value="nebula">Nebula</option>
            </select>
          </div>
        )}

        <div
          className="lo-spaces__tabs"
          role="tablist"
          aria-label="Wallpaper categories"
        >
          <button
            type="button"
            className={`lo-spaces__tab ${tab === "video" ? "is-active" : ""}`}
            onClick={() => setTab("video")}
          >
            Videos
          </button>

          <button
            type="button"
            className={`lo-spaces__tab ${tab === "image" ? "is-active" : ""}`}
            onClick={() => setTab("image")}
          >
            Images
          </button>

          <button
            type="button"
            className={`lo-spaces__tab ${tab === "favourites" ? "is-active" : ""}`}
            onClick={() => setTab("favourites")}
          >
            Favourites
          </button>
        </div>

        <div className="lo-spaces__search">
          <span className="lo-spaces__search-icon" aria-hidden="true">
            🔍
          </span>

          <input
            type="text"
            className="lo-spaces__search-input"
            placeholder="Search Space..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div
          className="lo-spaces__categories"
          role="tablist"
          aria-label="Wallpaper style categories"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`lo-spaces__category ${category === c.value ? "is-active" : ""} ${c.value === "all" ? "is-all" : ""}`}
              onClick={() => setCategory(c.value)}
              aria-label={c.label}
              title={c.label}
            >
              {c.value === "all" ? (
                <span className="lo-spaces__category-all">All</span>
              ) : (
                <>
                  <span className="lo-spaces__category-icon" aria-hidden="true">
                    {c.icon}
                  </span>
                  <span className="lo-spaces__category-tooltip">{c.label}</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="lo-spaces__gallery">
        {filteredWallpapers.length === 0 ? (
          <div className="lo-spaces__empty">No wallpapers found.</div>
        ) : (
          filteredWallpapers.map((item) => {
            const isActive = selected === item.src;
            const isFav = favourites.includes(item.id);

            return (
              <div
                key={item.id}
                className={`lo-spaces__card ${isActive ? "is-selected" : ""}`}
                onClick={() => applyWallpaper(item.src)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    applyWallpaper(item.src);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
              >
                <div className="lo-spaces__preview">
                  {item.type === "image" ? (
                    <img
                      className="lo-spaces__preview-image"
                      src={item.src}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <video
                      className="lo-spaces__preview-video"
                      src={item.src}
                      muted
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        el.currentTime = 0;
                        void el.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.pause();
                        el.currentTime = 0;
                      }}
                    />
                  )}

                  <button
                    type="button"
                    className={`lo-spaces__fav ${isFav ? "is-fav" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavourite(item.id);
                    }}
                    aria-label={
                      isFav ? "Remove from favourites" : "Add to favourites"
                    }
                  >
                    {isFav ? "♥" : "♡"}
                  </button>
                </div>

                <div className="lo-spaces__meta">
                  <div className="lo-spaces__title">{item.title}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="lo-spaces__footer">
        <div className="lo-spaces__current">
          <div className="lo-spaces__current-label">Selected wallpaper</div>
          <div className="lo-spaces__current-title">
            {selectedWallpaper?.title || "No wallpaper selected"}
          </div>
        </div>

        {selectedWallpaper?.type === "video" ? (
          <div className="lo-spaces__audio">
            <div className="lo-spaces__audio-row">
              <span className="lo-spaces__audio-label">Wallpaper sound</span>

              <button
                type="button"
                className={`lo-spaces__mute ${videoMuted ? "is-muted" : ""}`}
                onClick={toggleVideoMuted}
              >
                {videoMuted ? "Unmute" : "Mute"}
              </button>
            </div>

            <input
              className="lo-spaces__volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={videoVolume}
              onChange={(e) => changeVideoVolume(Number(e.target.value))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
