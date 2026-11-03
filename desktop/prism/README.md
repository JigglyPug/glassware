<div align="center">

# Prism

**Every app title bar, in its site's own color.**

[![Install](https://img.shields.io/badge/Install-v2.0.8-3b6fd6?style=for-the-badge)](https://raw.githubusercontent.com/JigglyPug/userscripts/main/desktop/prism/prism.user.js)

![Runs on](https://img.shields.io/badge/runs%20on-Every%20site-555?style=flat-square) ![Platform](https://img.shields.io/badge/platform-desktop-555?style=flat-square)

<img src="images/main.webp" width="620">

</div>

Prism colors the title bar of installed web apps (PWAs) to match the site you are on. It reads the color from the app icon, the manifest, the page's own theme color, the favicon or the page header, in whatever order you choose.

## Features

- **Five color sources** (app icon, manifest color, site theme color, favicon, page header). Drag them into the order you want; the first one that works wins.
- **Live trail** shows which sources hit or missed on the current site and which one is in use.
- **Tone**: use the color exactly as found, or push it darker or brighter.
- **Per-site override**: type your own hex color, use the color dropper, or turn Prism off for one site.
- **Fallback color** for pages where nothing else works.
- **Master switch** to turn everything off at once; every open tab updates live.
- Frosted, Apple-style menu tinted by the current title bar color. Open with **Alt + Shift + P** or the Tampermonkey menu.
- Optional console logging (lines start with `[prism]`).
