# Glassware: how this repo works

Glassware is JigglyPug's collection of Tampermonkey userscripts. The scripts update
themselves from this repo, and the product site at https://jigglypug.github.io/glassware/
is built from `docs/`. Keep every change consistent with the rules below.

## Layout

```
desktop/<script>/<script>.user.js    the script (what users install)
desktop/<script>/README.md            GitHub product page (generated)
desktop/<script>/images/              panel screenshots, card, banner (generated)
mobile/...                            same for the phone-only scripts
assets/icons/<script>.png             @icon for each script
assets/glassware-banner.svg           README banner for the front page
docs/                                 GitHub Pages site (generated, served from main /docs)
tools/                                builders for all of the above
```

## Changing a script

- Raise `@version` in the header on every change that users should receive. Tampermonkey
  only updates when the number goes up. Never ship a lower number than what's live.
- Keep these header lines exactly in this form (only the folder/name changes per script):
  - `@author JigglyPug`, `@license MIT`
  - `@icon https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/<script>.png?v=N`
    (icons are drawn by `node tools/icons.js`, then scaled to 256px; raise `?v=N` whenever they
    change so Tampermonkey downloads the new ones)
  - `@homepageURL https://jigglypug.github.io/glassware/<platform>/<script>/`
  - `@supportURL https://github.com/JigglyPug/glassware/issues`
  - `@updateURL` and `@downloadURL`: `https://raw.githubusercontent.com/JigglyPug/glassware/main/<platform>/<script>/<script>.user.js`
- Version text shown inside a panel comes from `GM_info.script.version`, never a hardcoded string.
- Don't change `@name` or `@namespace`: Tampermonkey identifies installed copies by them, and
  changing either installs a second copy with fresh settings.
- Renaming a script or a storage key needs a migration plan for existing users first.
- No Greasy Fork links anywhere. Nothing that identifies a real person beyond the name
  JigglyPug: no emails, real names, local paths, account names or personal preferences
  baked into defaults.
- Nothing about Claude or this workflow goes inside the scripts.

## After any change: rebuild the pages

```
python3 tools/screens.py [script]   # recapture panel screenshots (needs Playwright + Chromium)
python3 tools/pages.py              # rebuild every README, banner, site page and link preview
```

- Pages are generated. Edit the data, not the output: product copy lives in
  `tools/readmes.py` (name, tagline, intro, sites, screenshots, extra sections) and
  `tools/features.py` (feature titles and descriptions); site themes in `tools/site_themes.py`.
- Version labels on every page are read from each script's `@version`, so rebuild after
  every bump and the labels stay current.
- Recapture screenshots only when a panel's look or content changes, not for a version
  bump: the capture tool leaves version numbers out of the images, and the Install buttons
  and version chips on the pages carry the current number. Recapture just the scripts
  whose panels changed (`python3 tools/screens.py <script>`). Hourglass's `phone-*.webp`
  shots are captured by hand; refresh them separately if the phone layout changes.
- Screenshots use made-up demo data only (`tools/seeds/`). Never use real browsing data.

## Committing

- Commit as `JigglyPug <352074181+JigglyPug@users.noreply.github.com>`.
- Pull before you start and rebase on anything new before pushing; other chats work on
  this repo too.
- Never force-push or rewrite history.
- Don't create a repo named `userscripts` on this account: GitHub redirects that old name
  here, and installed copies may still rely on the redirect.
