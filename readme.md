# OMORI — Browser Port

A fully client-side browser port of the RPG Maker MV game **OMORI**. No server, no builds, no installs — just open `index.html` and play.

Everything that relied on NW.js (the original desktop shell) has been polyfilled or reimplemented so the game runs natively in any modern browser. Saves persist to IndexedDB, assets stream from a split ZIP archive, and mobile devices get a full set of on-screen controls.

---

## Quick Start

1. Serve the project directory with **any static HTTP server** (the game needs HTTP to fetch ZIP parts and JSON data — the `file://` protocol will not work):
   ```
   npx serve .
   # or
   python3 -m http.server 8080
   ```
2. Open `http://localhost:8080` (or whatever port you chose).
3. Wait for the asset loading bar — the game streams maps, audio, and images from a concatenated ZIP archive.
4. Play.

> If asset loading fails, make sure `data.zip`, `maps.zip`, `languages.zip`, and all ZIP part files (`.z01`, `.z02`, etc.) are in the same directory as `index.html`.

---

## How It Works

The original OMORI ships as an NW.js application. NW.js provides Node.js APIs (`fs`, `path`, `os`, `nw.gui`), a Chromium runtime, and local filesystem access. This port replaces every NW.js dependency with browser equivalents:

| Original (NW.js) | Browser Replacement |
|---|---|
| `fs.readFileSync` | Zip archive lookup, then fallback XHR |
| `fs.writeFileSync` / `fs.readFile` | In-memory store + IndexedDB persistence |
| `nw.Window` (fullscreen, focus) | Standard Fullscreen API + `window.focus()` |
| `nw.Shell.openExternal` | `window.open` |
| `require('os')` | Stubbed `process.platform` |
| `require('js-yaml')` | Inline YAML 1.1 parser (~200 lines) |
| `require('path')` | Minimal `join`/`dirname` shim |
| Steam API / Greenworks | Stubbed with the hardcoded Steam key the game expects |
| Local `.png` / `.ogg` files | Served from ZIP via patched ImageLoader and Audio stack |
| Local `MapXXX.json` files | XHR from zip or disk |
| Local save files | `localStorage` (base64-compressed) |

There is no build step and no Node.js dependency at runtime. The entire engine is a set of inline `<script>` blocks in `index.html` that run before the game scripts load.

---

## Project Layout

```
├── index.html              # The entire app shell (polyfills, UI, mobile controls)
├── fflate.js               # ZIP library (fflate) for decompressing assets
├── package.json            # Original NW.js manifest (kept for reference)
├── manifest.json           # Zip part manifest
│
├── data.zip                # Core game data (split into .z01/.z02/... if large)
├── maps.zip                # Map JSON files
├── languages.zip           # Localization YAML files
│
├── js/
│   ├── rpg_core.js          # RPG Maker MV core (~9300 lines, untouched)
│   ├── rpg_managers.js      # Scene/audio/storage managers
│   ├── rpg_objects.js       # Game data objects
│   ├── rpg_scenes.js        # Scene implementations
│   ├── rpg_sprites.js       # Sprite classes
│   ├── rpg_windows.js       # UI window classes
│   ├── main.js              # Game entry point
│   ├── plugins.js           # Plugin loader / registration
│   ├── zip_loader.js        # ZIP asset streaming + VFS layer (~800 lines)
│   ├── libs/
│   │   ├── pixi.js          # PIXI.js v4 (canvas/WebGL renderer)
│   │   ├── pixi-tilemap.js  # Tilemap extension
│   │   ├── pixi-picture.js  # Picture sprite extension
│   │   ├── lz-string.js     # LZ-based string compression (save files)
│   │   ├── fpsmeter.js      # FPS overlay
│   │   └── iphone-inline-video.browser.js  # iOS video unlock hack
│   └── plugins/             # 150+ RPG Maker MV plugins
│
├── aud_pack/               # Audio assets (split ZIP parts)
├── img_pack/               # Image assets (split ZIP parts)
├── fonts/                  # Game font (OMORI_GAME2.ttf)
├── icon/                   # App icon
├── movies/                 # Video files (WebM)
├── save/                   # Default save files
```

The game reads at **640x480** internal resolution and scales up to fill the browser window.

---

## Mobile and Touch

When a touch device is detected (phones, tablets), the page:

- **Locks to landscape** orientation (Screen Orientation API)
- Shows an **on-screen D-pad** on the left (arrow keys for movement)
- Shows **action buttons** on the right:
  - **Z** — confirm / interact / attack
  - **X** — cancel / menu / escape
  - **RUN** — hold to run (Shift)
  - **Q / W** — page up / page down (used for menu navigation)
  - **A** — tag action
- Controls live in the black sidebars around the 640x480 game canvas, never overlapping the game view
- A gamepad toggle in the top-left corner hides/shows the controls
- Multi-touch works — hold a direction on the D-pad while tapping Z

On desktop with a mouse and keyboard, none of this appears. Detection uses the user agent string (`Android`, `iPhone`, etc.), not just `maxTouchPoints` (which would trigger on touchscreen laptops).

---

## Fullscreen

Press **F4** (the game built-in toggle) or use the browser fullscreen button. On entering fullscreen:

- The 640x480 canvas stretches to fill the screen with bilinear filtering (smoother than the default nearest-neighbor upscale)
- A short CSS transition animates the resize
- On exit, the previous stretch setting is restored

---

## Save Files

Saves are stored in `localStorage` under keys like `RPG File1`, `RPG Global`, and `RPG Config`. The game compresses save data with LZ-String before storing it.

A **save uploader** in the top-right corner of the page lets you:
- Import `.rpgsave` files from a desktop copy of OMORI (drag or select `file1.rpgsave` through `file20.rpgsave`, `global.rpgsave`, `config.rpgsave`)
- Export all saves as a ZIP download

The IndexedDB-backed `WO_Client` layer persists the virtual filesystem (config files, YAML data that gets written during play) so settings survive page reloads.

---

## Zip Asset Loader

The original game reads thousands of individual files from disk. This port uses **fflate** to decompress them on the fly from pre-built ZIP archives.

How it works:

1. The loader fetches a `manifest.json` that lists which ZIP parts exist and their URLs.
2. It loads part files concurrently (configurable, default 6 at a time) and concatenates them into a single archive in memory.
3. A virtual filesystem maps file paths to byte arrays. There is also a case-insensitive lookup table because the original game mixed cases in its asset references.
4. When the game engine requests a file (image, audio, JSON, YAML), the loader intercepts the request and serves the bytes from the VFS.
5. Images get blob URLs so the browser can decode them natively. Audio gets served through a custom streaming layer.

The loading progress bar shows real-time percentage and switches to a LAUNCH button once everything is ready.

---

## RPG Maker Plugins

The project includes about 150 plugins, the full set from the original OMORI:

**Core:** Omori BASE, GTP OmoriFixes, YEP CoreEngine, Community Basic

**Battle:** Full OMORI battle system (emotion-based, no traditional HP bars), Yanfly Battle Engine Core, action sequences, counter control, critical control, taunt, lifesteal

**Audio and Video:** Streaming audio, OGG-only mode, video player

**Text and Message:** Yanfly Message Core with extended message packs, language processing system with localization support

**Utilities:** Preloader, debugger, dash toggle, event copier/spawner/morpher, smart pathfinding, animation curves

---

## Technical Notes

- **No build tooling.** Everything is vanilla JS loaded via `<script>` tags. The YAML parser, Buffer polyfill, and NW.js shims are all inline in `index.html`.
- **WebGL preferred, Canvas fallback.** PIXI.js auto-detects the best renderer. Press F3 to toggle stretch mode, F2 for FPS meter.
- **LZ-String compression** is used for save files in localStorage. The original game uses the same approach, so saves are cross-compatible with the desktop version.
- **The `process` global** is stubbed to `{ platform: 'browser' }` because several plugins check `process.platform` for platform-specific behavior.
- **The YAML parser** handles the specific YAML 1.1 dialect that OMORI language files use, including inline flow mappings with bare identifiers (which would choke a JSON parser).
- **Audio** uses the browser native `<audio>` elements and the HTML5 Audio API. The original WebAudio streaming system (`stbvorbis`) is included but largely bypassed in favor of direct `<audio>` playback.

---

## Limitations

- **Not all video formats** may play in all browsers. The original game uses WebM; Safari may need additional handling.
- **Localization** works for English. Other language packs may need their ZIP archives placed in the project root.
- **Performance** on low-end mobile devices varies. The game runs at 640x480 but some battle scenes with heavy sprite usage can stress older GPUs.
- **File protocol** will not work due to XHR and ZIP loading requirements. Always serve over HTTP.
- **Possible Bugs** all throughout, primarily language error, just report them to me

---

## Credits

- **OMORI** (c) OMOCAT, LLC. This is an unofficial browser port for preservation and accessibility.
- **RPG Maker MV** engine by Kadokawa / Yoji Ojima
- **PIXI.js** v4 by Goodboy Digital
- **fflate** by Arjun Barrett (ZIP compression/decompression)
- **Plugin authors:** Yanfly, Galv, Hime, SumRndmDde, Olivia, TDS, YIN, Archeia, Exhydra, TDDP, and many others from the RPG Maker community

---

## License

This repository contains no original OMORI game assets. You must provide your own legally obtained copy of the game files. The HTML, JavaScript polyfills, and mobile controls in this repository are provided as-is for educational and interoperability purposes. (totally)
