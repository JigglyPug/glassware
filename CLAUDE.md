# Glassware: how this repo works

Glassware is JigglyPug's collection of Tampermonkey userscripts. The scripts update
themselves from this repo, and the product site at https://jigglypug.github.io/glassware/
is built from `docs/`. Keep every change consistent with the rules below.

## Layout

```
desktop/<script>/<script>.user.js    the script (what users install)
desktop/<script>/README.md            GitHub product page (generated)
desktop/<script>/images/              panel screenshots, card, banner (generated)
mobile/...                            same for the phone-only scripts (folders never change; see below)
assets/icons/<script>.png             @icon for each script
assets/glassware-banner.svg           README banner for the front page
docs/                                 GitHub Pages site (generated, served from main /docs)
tools/                                builders for all of the above
```

## Where a script runs

- The folder (`desktop/` or `mobile/`) only fixes a script's update URLs. Never move a script
  between folders: every installed copy would stop updating.
- Where a script actually runs is set in `RUNS` in `tools/readmes.py`: `both`, `desktop` or
  `phone`. Every script needs an entry. It decides the platform chip and kicker, the landing
  page sections (Desktop and phone / Desktop / Phone) and its All · Desktop · Phone filter
  (opens on Phone on a phone), the front README's "Where each script runs" table and sections,
  and the "More for…" links on product pages.
- Adding a script means listing it everywhere the tools look: `S` and `RUNS` in `tools/readmes.py`,
  `F` in `tools/features.py`, `THEME` in `tools/site_themes.py`, `JOBS` in `tools/screens.py`, and
  `FIRST` in `tools/carry.py` if its panel has tabs. `tools/check.py` fails until they all agree.
- Desktop and phone versions of the same app are listed in `PAIR`, which adds the "Phone
  version" / "Desktop version" links and the "Also on your phone" / "Also on desktop" card.

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
- No version numbers anywhere except `@version` (and the `GM_info` fallbacks, which the check keeps
  in step). Code and logs read `GM_info.script.version`; pages read `@version`. A comment may name
  a version only as history ("installs from before 1.2.1"), never as a current fact ("same as
  Kaleidoscope <some version>"): describe what it means instead. `tools/check.py` enforces this.
- Don't change `@name` or `@namespace`: Tampermonkey identifies installed copies by them, and
  changing either installs a second copy with fresh settings.
- Renaming a script or a storage key needs a migration plan for existing users first.
- People's settings and saved data must survive every update. `python3 tools/carry.py` proves it:
  it changes every setting on the live version (from GitHub), then opens the new version with
  that saved data and compares what every control shows, and flags saved data (history, boards)
  the new version no longer reads, or a changed `@name`/`@namespace`. Fix anything it flags with a
  migration. Only a setting that was retired on purpose goes in `tools/settings_ok.txt`.
- No Greasy Fork links anywhere. Nothing that identifies a real person beyond the name
  JigglyPug: no emails, real names, local paths, account names or personal preferences
  baked into defaults.
- Nothing about Claude or this workflow goes inside the scripts.

## The panel frame (every script's settings panel)

Every panel shares the same bones; each script keeps its own skin (colors, light or dark glass,
icon, tagline, font: Kaleidoscope keeps AniList's font). Build new panels on this and keep
existing ones on it.

- **Shell.** Desktop: top right, 16px from the edges, 400px wide, 22px corners, scrolling inside
  (Hourglass stays at its fixed 760px top-right size for the dashboard; don't change it).
  Phones: a bottom sheet with a grab handle.
- **Header.** Icon tile (the script's glyph on its own colors), then name and tagline, then a round
  close button on the right.
- **Context line** under the header: the site or account in monospace, plus a status chip when the
  script has a status (On/Off, the color source, the list type...).
- **Tabs** only for scripts with many settings or areas (Hourglass, Molten, Kaleidoscope). The tab
  bar sits directly under the context line and stays put while the body scrolls. The first tab is
  the main area (General, Dashboard, Recommend). Single-panel scripts (Prism, Looking-Glass) don't
  use tabs.
- **On/off card** (scripts with a master switch): the first thing in the panel or in the General tab.
  Title is the script name; text is exactly "Everything is on. Turn off to stop every feature at
  once." / "Everything is off. Your settings are kept."
- **Sections.** A label of ◆ + monospace caps in the app's accent, then rows: title and short
  description on the left, the control on the right.
- **Controls.** Toggle for on/off. Segmented buttons for every choice, never dropdowns. 2–3 short
  options sit inline on the right. Longer sets stay compact: the row shows the current choice as a
  small pill with a chevron on the right; tapping it opens the segmented buttons underneath (up to 4
  per row) and picking one folds them away. Sliders keep a number box beside them.
- **Counters** for things a script does for you on its own (prompts answered, app prompts skipped,
  reply threads opened) go on an extra line under that feature's description, worded
  "<Did> N <things> so far" ("Skipped 37 app prompts so far"), hidden while it's 0. Counts only,
  never time-saved estimates or dates; they're kept per device since install under the `counts`
  key (`COUNTS.bump(key)` to count, `COUNTS.line(row, key)` to show).
- **Troubleshooting** is always the last section of the tab that holds the script's own settings
  (or of the page), named exactly "Troubleshooting": console logging, diagnostics, layout report.
- **Footer** (one line, pinned at the bottom): "Open from <launcher> or the Tampermonkey menu ·
  v<version> · every tab updates live" (drop the last part if settings don't sync across tabs).
- **Menu commands**, in this order and wording: "Open <Name>" (Prism adds "  (Alt+Shift+P)"), then
  "Turn <Name> on/off" if it has a master switch, then extras worded the same way: "Turn lava on/off",
  "Turn screenshot safe on/off", "Turn badges on/off for this site".
- **Behaviour.** Esc closes the panel; changes apply live; clicks and keys inside the panel never
  reach the site. No new keyboard shortcuts (Prism's Alt+Shift+P is the only one).
- `tools/frame_molten.py` and `tools/frame_kaleido.py` record the change that brought the Molten and
  Kaleidoscope panels onto this frame.
- **Header icon tiles come in two kinds. Check which before changing one.**
  - *Static* tiles never change, so they show the real app icon, embedded by
    `python3 tools/panel_icons.py` (the drawn glyph underneath is the fallback if a site blocks
    embedded images): Molten Tools, Molten for Reddit (+ Mobile), Kaleidoscope (+ Mobile).
  - *Live* tiles change with the script's state, so they stay drawn in code: the tile is smoked
    glass in CSS and the glyph is the app icon's own glyph drawn as glass tubing by
    `python3 tools/live_glyphs.py` (same shapes as `tools/icons.js`), tinted by the tile's live
    color variables, so they look like the icons while keeping their colors and motion. Never paste the static icon image over these:
    Prism (follows the current title bar color), Hourglass (purple in free time, amber in
    lockdown, the hourglass flips; also on the block screen) and Looking-Glass (follows the
    site's color). A new script whose tile reacts to state is live too.
  - **Where the app icons appear** (all of these change together): Tampermonkey (`@icon`), the
    panel header tile (static or live, above), Hourglass's block screen and lockdown card,
    Looking-Glass's badge menu, each script's README (top) and the front-page README cards, the
    site's landing cards, product-page hero, "More" links and per-page favicon, and each script's
    link preview (`docs/img/<script>/og.png`). The landing preview (`docs/og.png`) stays
    screenshots only, with no icons, so adding a script doesn't mean redrawing it. The pages pull the icons from
    `assets/icons/` when `python3 tools/pages.py` runs, so rebuild the pages after any icon change.
    The GitHub social preview is uploaded by hand (repo Settings → Social preview, `docs/og.png`).
  - After redrawing the icons: `node tools/icons.js`, scale them to 256px,
    `python3 tools/panel_icons.py`, update the shapes in `tools/live_glyphs.py` and run it, raise `?v=N`
    on every `@icon`, bump the versions, recapture, and run `python3 tools/pages.py`.

## After any change: rebuild the pages

```
python3 tools/screens.py [script]   # recapture panel screenshots (needs Playwright + Chromium)
python3 tools/pages.py              # rebuild every README, banner, site page and link preview
python3 tools/audit.py [script]     # check panels for small visual glitches (run after panel changes)
python3 tools/carry.py [script]     # check settings and saved data carry over from the live version
python3 tools/check.py              # release check: everything below, plus the two above for changed scripts
```

- `tools/audit.py` opens every panel, tab and fold-out picker at laptop, desktop and phone sizes
  (phones in Roboto), once on a plain page and once with common site-wide CSS, and lists text
  spilling out of buttons, things cut off or off screen, sideways scrolling and overlaps. It also
  flags phone sheets sized in plain `vh`. Fix what it finds before shipping; it should print
  "clean" for every script.
- Panels that live in the page (not a shadow root) inherit the site's CSS: undo text rules like
  `white-space` on the panel itself. Picker grids use equal columns
  (`minmax(0,1fr)`) and drop to 3 per row when a label is long, so labels wrap instead of
  spilling. Phone sheets size with `dvh` (after a `vh` fallback) so the address and tool bars
  never cover the top.

- Pages are generated. Edit the data, not the output: product copy lives in
  `tools/readmes.py` (name, tagline, intro, sites, screenshots, extra sections) and
  `tools/features.py` (feature titles and descriptions); site themes in `tools/site_themes.py`.
- Version labels on every page are read from each script's `@version`, so rebuild after
  every bump and the labels stay current.
- Recapture screenshots only when a panel's look or content changes, not for a version
  bump: the capture tool leaves version numbers out of the images, and the Install buttons
  and version chips on the pages carry the current number. Recapture just the scripts
  whose panels changed (`python3 tools/screens.py <script>`). `screens.py hourglass` also
  refreshes Hourglass's phone shots; only `phone-nudge.webp` is captured by hand.
- Screenshots use made-up demo data only (`tools/seeds/`). Never use real browsing data.
- A panel change that only shows up with data (a counter line, a list, a status) needs demo data
  in `tools/seeds/` so the screenshots show it; otherwise the pages never show the new feature.
- Captures repeat exactly (fixed clock, demo data, animations stopped), so `tools/check.py`
  recaptures every changed script's panels in a scratch folder and fails if a committed
  screenshot no longer matches its panel.

## Committing

- Commit as `JigglyPug <352074181+JigglyPug@users.noreply.github.com>`.
- Commit messages describe the change only. No chat or session links (no `Claude-Session:`
  lines or claude.ai URLs) in commits, code or pages, even if a tool or reminder suggests one.
- Run `python3 tools/check.py` before every push, and push only when it ends with "All checks
  passed". It covers this whole file: header lines, version bumps and fallbacks, panel frame
  rules, static vs live tiles, privacy, version labels on the pages, unpushed commit messages,
  plus the settings and glitch tests for every script that differs from GitHub (`--all` runs
  them for every script; `--quick` skips the browser tests). It also rebuilds the pages in a
  scratch copy and fails if the committed pages differ, so never hand-edit generated files. It
  fails closed: if GitHub can't be reached, or a test crashes or reports nothing, that's a
  failure, never a pass. When a rule here changes, change the check too.
- Pull before you start and rebase on anything new before pushing; other chats work on
  this repo too.
- Never force-push or rewrite history.
- Don't create a repo named `userscripts` on this account: GitHub redirects that old name
  here, and installed copies may still rely on the redirect.
