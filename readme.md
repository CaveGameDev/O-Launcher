![OMORI](icon/icon.png)

# OMORI Browser Port (WITH MODLOADER) nocache

This is the RPG Maker MV game **OMORI**, running entirely in the browser. Just uhh serve the folder and play, you can also open the live site at `omor-1.pages.dev`.

It's a port of the original desktop (NW.js) release. Everything the game relied on from the desktop shell reading, files, saving, the Steam API, the window chrome, has been replaced with browser equivalents, so it runs on any modern browser, desktop or mobile.

## Run it

Just serve the folder over HTTP (`file://` won't work):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`. On the first visit it downloads and caches the assets (~1.6 GB); after that, visits load straight from the browser's storage and skip the download screen.

## What's in here

## Features

- **Save import/export** — pull `.rpgsave` files in from the desktop game, or export yours as a ZIP download. The original game couldn't export saves.
- **Cross-compatible saves** — save files are byte-compatible with the desktop version.
- **Caching** — assets download once, then later visits load instantly.
- **Mobile controls** — an on-screen D-pad and action buttons appear on touch devices.
- **Boot self-check** — if a script or asset fails to load, the page tells you exactly what went wrong instead of going blank.
- **Moddable** so try! Now Accepts omori mod zips! (FIRST EVER WEBPORT WITH MODLAUCNHER!)

## Limitations

- Always serve over HTTP; the file protocol won't work.
- Possible bugs throughout, mainly language errors.. just report them to me 

## Also
- **More Builds and fixes soon**, currently creating a compiled version for deploys
- Decently better than the gn-math version
## Credits

OMORI (c) OMOCAT, LLC. This is an unofficial browser port for preservation and accessibility. RPG Maker MV by Kadokawa / Yoji Ojima. Built on PIXI.js and fflate, plus plugins from the RPG Maker community (Yanfly, Galv, SumRndmDde, Olivia, and many more).

