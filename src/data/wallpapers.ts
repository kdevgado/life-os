export type WallpaperItem = {
  id: string;
  title: string;
  src: string;
  type: "image" | "video";
  category: "nature" | "countries" | "retro" | "games" | "anime" | "cars";
};

const BASE = "https://pub-4ba799b2be9743b492e92fdaf467aa56.r2.dev";

/* ---------------- IMAGES ---------------- */

export const IMAGE_WALLPAPERS: WallpaperItem[] = [
  {
    id: "duna-sky",
    title: "Duna Sky",
    src: `${BASE}/images/duna-sky.jpg`,
    type: "image",
    category: "nature",
  },
  {
    id: "nebula-space",
    title: "Nebula Space",
    src: `${BASE}/images/nebula-space.jpg`,
    type: "image",
    category: "nature",
  },
  {
    id: "rayban-sunglasses",
    title: "RayBan Sunglasses",
    src: `${BASE}/images/RayBan%20sunglasses.jpg`,
    type: "image",
    category: "retro",
  },
  {
    id: "stakkholtsgja",
    title: "Stakkholtsgja Canyon, Iceland",
    src: `${BASE}/images/Stakkholtsgja%20canyon,%20Iceland.jpg`,
    type: "image",
    category: "countries",
  },
  {
    id: "vernazza",
    title: "Vernazza, Italy",
    src: `${BASE}/images/Vernazza,%20Italy.jpg`,
    type: "image",
    category: "countries",
  },
  {
    id: "elnido-palawan",
    title: "El Nido, Palawan, Philippines",
    src: `${BASE}/images/elnidopalawan.jpg`,
    type: "image",
    category: "countries",
  },
  {
    id: "melbourne-skyline-balloons",
    title: "Melbourne, Australia",
    src: `${BASE}/images/Skyline.jpg`,
    type: "image",
    category: "countries",
  },
];
/* ---------------- VIDEOS ---------------- */

export const VIDEO_WALLPAPERS: WallpaperItem[] = [
  {
    id: "sunset",
    title: "Sunset",
    src: `${BASE}/videos/sunset.mp4`,
    type: "video",
    category: "nature",
  },
  {
    id: "japan-street",
    title: "Japan City Street During Fall",
    src: `${BASE}/videos/japan-street-fall.mp4`,
    type: "video",
    category: "retro",
  },
  {
    id: "cozy-fireplace",
    title: "Cozy Fireplace",
    src: `${BASE}/videos/cozy-fireplace.mp4`,
    type: "video",
    category: "nature",
  },
  {
    id: "cyberpunk-city",
    title: "Cyberpunk City Night Patrol",
    src: `${BASE}/videos/cyberpunk-city-style-night-patrol-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "retro",
  },
  {
    id: "midnight-blossom",
    title: "Midnight Blossom Village",
    src: `${BASE}/videos/midnight-blossom-village-japanese-aesthetic-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "nature",
  },
  {
    id: "ocean-sunset-window",
    title: "Ocean Sunset Window View",
    src: `${BASE}/videos/ocean-sunset-window-view-tropical-aesthetic-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "nature",
  },
  {
    id: "porsche-911",
    title: "Porsche 911",
    src: `${BASE}/videos/porsche-911-timeless-performance-in-darkness-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "cars",
  },
  {
    id: "retro-sunset-drive",
    title: "Retro Sunset Drive",
    src: `${BASE}/videos/retro-sunset-drive-pixel-journey-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "cars",
  },
  {
    id: "super-mario-room",
    title: "Super Mario Pixel Room",
    src: `${BASE}/videos/super-mario-pixel-room-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "games",
  },
  {
    id: "winter-cabin",
    title: "Winter Cabin Under the Stars",
    src: `${BASE}/videos/winter-cabin-under-the-stars-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "nature",
  },
  {
    id: "arknights-sakura",
    title: "Arknights Sakura Sanctuary",
    src: `${BASE}/videos/arknights-endfield-sakura-sanctuary-live-wallpaper-wallsflow-com.mp4`,
    type: "video",
    category: "games",
  },
  {
  id: "aurora-forest",
  title: "Aurora Forest",
  src: `${BASE}/videos/aurora-forest.mp4`,
  type: "video",
  category: "nature",
},
{
  id: "ocean-sunset-window-2",
  title: "Ocean Sunset Window Tropical",
  src: `${BASE}/videos/ocean-sunset-window-view-tropical-aesthetic-live-wallpaper-wallsflow-com.mp4`,
  type: "video",
  category: "nature",
},
{
  id: "rain-on-glass",
  title: "Rain on Glass",
  src: `${BASE}/videos/rain-on-glass.mp4`,
  type: "video",
  category: "nature",
},
{
  id: "rainy-cafe-japan",
  title: "Rainy Cafe Japan",
  src: `${BASE}/videos/rainy-cafe-japan.mp4`,
  type: "video",
  category: "anime",
},
{
  id: "sunset-reflections",
  title: "Sunset Reflections",
  src: `${BASE}/videos/sunset-reflections.mp4`,
  type: "video",
  category: "nature",
},
{
  id: "videogame",
  title: "Videogame Ambience",
  src: `${BASE}/videos/videogame.mp4`,
  type: "video",
  category: "games",
},
{
  id: "rainy-forest-ambience",
  title: "Rainy Forest Ambience",
  src: `${BASE}/videos/Rainy Forest Ambience Live Wallpaper.mp4`,
  type: "video",
  category: "nature",
},
{
  id: "earth-outer-space",
  title: "Earth - Outer Space",
  src: `${BASE}/videos/Earth - outer space.mp4`,
  type: "video",
  category: "nature",
},
];

/* ---------------- COMBINED ---------------- */

export const WALLPAPERS: WallpaperItem[] = [
  ...IMAGE_WALLPAPERS,
  ...VIDEO_WALLPAPERS,
];