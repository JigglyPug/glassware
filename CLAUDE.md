# Glassware: how this repo works

Glassware is JigglyPug's collection of Tampermonkey userscripts. The scripts update
themselves from this repo, and the product site at https://jigglypug.github.io/glassware/
is built from `docs/`. Keep every change consistent with the rules below.

## Layout

```
desktop/<script>/<script>.user.js    the script (what users install)
desktop/<script>/README.md            GitHub product page (generated)
desktop/<script>/CHANGES.md           what changed in each release (written by hand)
desktop/<script>/images/              panel screenshots, card, banner (generated)
mobile/...                            same for the phone-only scripts (folders never change; see below)
assets/icons/<script>.png             @icon for each script
assets/glassware-banner.svg           README banner for the front page
docs/                                 GitHub Pages site (generated, served from main /docs)
tools/                                the commands you run: check.py, push.py, pages.py, screens.py,
                                      new_script.py; frame.py, panel_icons.py, live_glyphs.py and icons.js
                                      (they write into the scripts, whose comments name them there, so
                                      they stay put); the pins (package.json, requirements*.txt)
tools/tests/                          the tests check.py runs (and their helpers)
tools/build/                          what pages.py runs to write the READMEs, banners, site and previews
tools/lib/                            shared by both: shot.js (the test browser), par.py, fonts.conf, tokens.json
tools/seeds/, tools/kit/              demo data for screenshots and tests; the new-script template
```

## Where a script runs

- The folder (`desktop/` or `mobile/`) only fixes a script's update URLs. Never move a script
  between folders: every installed copy would stop updating.
- Where a script actually runs is set in `RUNS` in `tools/build/readmes.py`: `both`, `desktop` or
  `phone`. Every script needs an entry. It decides the platform chip and kicker, the landing
  page sections (Desktop and phone / Desktop / Phone) and its All · Desktop · Phone filter
  (opens on Phone on a phone), the front README's "Where each script runs" table and sections,
  and the "More for…" links on product pages.
- **Start every new script with the kit**: write its spec as `tools/specs/<script>.json` (copy
  `tools/kit/example.json`: name, tagline, accent, icon colors and glyph, where it runs, settings,
  counters, page copy, features, demo data and the feature code), then run
  `python3 tools/new_script.py tools/specs/<script>.json`. It writes the script from
  `tools/kit/template.js`, already on the panel frame, the glass recipe and light/dark, picks
  readable inks for the accent, lists the script in every registry, draws and embeds its icon,
  captures it in both themes and rebuilds the pages. Then build out the feature code in the script
  itself, add any extra screenshots or demo data, and ship it like any other change (audit, check).
  The spec stays as the record of how it started; after that the script is the source.
- The registries the kit fills in (and `tools/check.py` checks agree): `S`, `RUNS` and `ACCENT` in
  `tools/build/readmes.py`, `F` in `tools/build/features.py`, `THEME` in `tools/build/site_themes.py`, `JOBS` in
  `tools/screens.py`, `FIRST` in `tools/tests/carry.py` (tabbed panels), `STATIC` or `LIVE` in
  `tools/check.py`, `SCRIPTS` in `tools/panel_icons.py` (static tiles), `ICONS` in `tools/icons.js` and
  `FRAMES` in `tools/frame.py`.
- The kit is part of the release check: `tools/check.py` generates a script from
  `tools/kit/example.json` and runs every frame and theme rule on it, so the template can't drift
  from this file. When a rule here changes, change the template too.
- Desktop and phone versions of the same app are listed in `PAIR`, which adds the "Phone
  version" / "Desktop version" links and the "Also on your phone" / "Also on desktop" card.

## Changing a script

- Raise `@version` in the header on every change that users should receive. Tampermonkey
  only updates when the number goes up. Never ship a lower number than what's live.
- Every release gets an entry at the top of the script's `CHANGES.md` (`## <version> · <date>`, then
  `- ` lines): what changed for the person using it, in plain words, not how it was built. The
  product page and README show the latest three. `tools/check.py` fails if the newest entry isn't
  the `@version`.
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
- People's settings and saved data must survive every update. `python3 tools/tests/carry.py` proves it:
  it changes every setting on the live version (from GitHub), then opens the new version with
  that saved data and compares what every control shows, and flags saved data (history, boards)
  the new version no longer reads, or a changed `@name`/`@namespace`. `tools/check.py` runs it twice:
  from the live version and from the release `CARRY_BACK` (4) before it, since people who skip updates
  jump several versions at once (`--back N` to try further). Fix anything it flags with a
  migration. Only a setting that was retired on purpose goes in `tools/tests/settings_ok.txt`.
- No Greasy Fork links anywhere. Nothing that identifies a real person beyond the name
  JigglyPug: no emails, real names, local paths, account names or personal preferences
  baked into defaults.
- Nothing about Claude or this workflow goes inside the scripts.

## Security

- **AI-written pages are untrusted code.** Treat HTML, JavaScript and any other output from a model
  (Kaleidoscope's boards) as code a stranger wrote: run it isolated and never with open network
  access. Kaleidoscope's board runs in a sandboxed frame with scripts only (no pop-ups, no forms),
  under a content policy that lets it reach only AniList's API and images (plus scripts, styles and
  fonts from the common code CDNs), with DNS prefetching off; the page around it stops the frame
  navigating anywhere; WebRTC, which content policies don't cover, is switched off inside it; and its
  links open through Kaleidoscope, AniList addresses only. A saved board file is the same sandboxed
  frame in a small page of its own (that page stops navigation and opens AniList links only), never the
  board running on its own.
- **Nothing of yours goes into untrusted code.** Never send personal or account-derived data (your
  list, your activity, settings) into a frame that runs untrusted code, not even data that's public
  elsewhere: blocking the network is the second line, not the first. Kaleidoscope's Recent activity
  strip is drawn by Kaleidoscope on the page around the board, never inside it.
- **A sandbox doesn't stop a frame navigating itself, and a load event doesn't prove which document
  loaded.** Treat every navigation, reload and document replacement inside a frame as a new,
  unknown document: don't count loads, don't `postMessage(..., '*')` anything sensitive (nothing
  sensitive goes in at all, above), and stop the navigation where possible (the page's `frame-src`).
- **Hostile tests cover order, not just outcomes.** `tools/tests/boardtest.py` opens hostile boards that try
  every way out (fetch, XHR, beacons, WebSocket, EventSource, outside styles, `@import`, fonts, prefetch
  and images, forms, pop-ups, links, a meta refresh, WebRTC, navigating later), ones that navigate at
  once, before their first load event, to another site, a `data:` page and `about:blank`, and ones that
  ask Kaleidoscope to open an AniList link and then navigate away, at once and a moment later, each
  listening for whatever Kaleidoscope sends next. It fails if anything reaches another site or any data reaches the board, and if covers,
  the API, AniList links or the Recent activity strip stop working. It also saves boards with the
  Save button and opens the file on its own, with the same checks. A new way out or in gets a case
  there.
- **Hand-offs between sites go to the tab they were made for.** Kaleidoscope opens Claude with a
  one-time id in the address; only that tab takes the waiting prompt (it remembers the id through
  signing in), never another claude.ai tab, and nothing waits if the tab didn't open. If the tab
  is blocked, or closed before the board comes back, the job ends at once with a sentence saying
  so, never a progress bar left running. Everything a hand-off keeps in storage (the waiting
  prompt, the result, the job, the saved board, past times) is read back through a checker
  (`handoffOk`, `cleanBoard`, `readBoards`, `readTimes`, `cleanJob`): a value of the wrong shape is
  cleared or skipped, and a link in it is used only if it points where it should. Read new stored
  values the same way. `tools/tests/handofftest.py` checks all of it (shot.js `--opentab`).
- **Ask for as little as possible.** Every `@grant` is used. A script that has to reach any site
  (`@connect *`: Prism and Looking-Glass fetch whatever icon or manifest a site points to) sends its
  requests through `gwPublicUrl()`, one shared helper: public `http(s)` addresses only, never this
  computer or a private network unless the page itself is on one, and without cookies. Its answer is
  checked the same way: if a redirect took the request to a private address (`finalUrl`), nothing
  that came back is used. (Tampermonkey follows redirects itself and can't show where they lead
  first, so the request may still have been made; it just gets no further.) The same check comes
  before every request the script makes for a site's address, also the browser's own (`fetch`, an
  `Image`): a refused address gets no request at all, never a browser-side fallback. `data:` and
  `blob:` addresses are already in the page and pass. The helper reads an IPv4 address back out of an
  IPv6 one (the browser writes an `[::ffff:…]` address with its IPv4 part in hex, `[::ffff:c0a8:101]`) and ignores a trailing
  dot (`localhost.`); `tools/check.py` tests it on a table of addresses written every such way. A
  site name that only resolves to a private address (DNS) can't be seen from a script; that's the
  browser's to block. `tools/tests/nettest.py` checks the rest (`--net redirect`, and `--net private` /
  `private-icons`: nothing at all is asked of a private address the page points at).
- **Console logging is off by default** and never prints account or channel names, emails or ids,
  even when it's on: people share console captures. That includes messages built for failures ("could
  not find …"): say what was missing, never whose. `tools/tests/logtest.py` turns every logging switch in
  Molten Tools on, saves a made-up account and walks every path that handles account names (switching
  on YouTube Music with the account missing or the menu not opening, YouTube's account picker with
  and without the account, Screenshot safe learning names), and fails if a console line names either
  made-up account. A new path that touches account names gets a case there.
- **Every request can fail, and the script says so.** A request has a time limit (Tampermonkey's `timeout`,
  or an `AbortController` on `fetch`: 20 s for AniList, 8 s for a page's own manifest), and a timeout, a
  server error, a broken body and a dropped connection each end in a fallback (Prism and Looking-Glass
  colour from the page instead) or a sentence a person can act on ("AniList took too long to answer. Try
  again in a moment."), never a spinner forever or a raw "Failed to fetch". `tools/tests/nettest.py` opens every
  script that makes requests with the network failing each of those ways (`shot.js --net`) and fails on
  an uncaught error, a broken panel, or a missing fallback. A new script that makes requests gets a case there.
- **The checks run side by side.** Every test case is its own browser run and mostly waits (page loads,
  timeouts), so `tools/lib/par.py` runs several at once (`pmap`, `ptry`; `GLASSWARE_JOBS=1` for one at a
  time), and a run that only wants what `--eval` or `--drive` finds skips the screenshot pauses. The
  live-update test gives each tab, and each third of a tab's controls, a browser of its own. Only the
  performance test runs alone, because it measures time. A new test loops over its cases with `pmap`,
  and waits for what it needs (poll for it) rather than sleeping a fixed time. `check.py` ends with how
  long each slow section took.
- `tools/check.py` enforces the last two (permissions, privacy) on every run, runs the Kaleidoscope
  tests when Kaleidoscope changes, the logging test when Molten Tools changes and the network test when a
  script that makes requests changes (GitHub runs all three every time).
- **An imported file is untrusted.** Hourglass's Import settings won't read a file over 1 MB, keeps
  only the settings it has (each the right kind, inside the range its control allows, so a file
  can't hand out 1000 passes), checks the schedule and site lists entry by entry, skips a part it
  can't read, and says in the panel what happened. `tools/tests/importtest.py` hands it damaged, foreign,
  out-of-range and oversized files and its own export. A new import gets the same treatment and a case there.

## The panel frame (every script's settings panel)

Every panel shares the same bones and the same glass; each script keeps only its own skin
(accent color, icon, tagline, font: Kaleidoscope keeps AniList's font). Build new panels on this
and keep existing ones on it.

- **Shell.** Desktop: top right, 16px from the edges, 400px wide, 22px corners (panel shape below), scrolling inside
  (Hourglass stays at its fixed 760px top-right size for the dashboard; don't change it).
  Phones: a bottom sheet with a grab handle. Pulling the handle or the header down closes it (a short
  pull springs back), and no touch, tap or click inside it reaches the page behind. Both come from
  `gwSheetGestures()`, stamped by `tools/frame.py` like the controls; every script that runs on phones
  calls it, and `tools/tests/touchtest.py` works each sheet with real touches (`shot.js --drive`).
- **Header.** Icon tile (the script's glyph on its own colors), then name and tagline, then the
  sun/moon switch (`aria-label` "Dark mode"), then a round close button on the right.
- **Control sizes** (the same in every panel; design tokens in `tools/lib/tokens.json`, which the frame,
  the kit and the audit read; the table below must match them):

  | | desktop | phone |
  |---|---|---|
  | icon tile | 34×34, 10px corners | same |
  | name / tagline | 16px semibold / 12px (Kaleidoscope keeps its AniList wordmark) | same |
  | sun/moon switch | 50×28 track, 22px knob, 3px in | same |
  | close button | 28×28 round, 8px after the switch | 36×36 |
  | toggle | 40×24 track, 20px knob, 2px in | 46×28, 24px knob |

  These controls are written once, in `tools/frame.py`, and stamped into every script (and the kit's
  template) between `glassware:frame start` / `end` markers, with `!important` for panels that
  live in the page so a site's own button rules can't reach them. To change one, change
  `tools/frame.py`, run `python3 tools/frame.py`, recapture and ship. `tools/check.py` fails if a
  stamped copy was edited by hand, if a script styles these controls anywhere else, or if a script
  isn't listed in `FRAMES`. The close button's × is stamped the same way (`gwCloseIcon()`).
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
- **Settings fold away with their switch.** The settings that belong to a feature's switch sit in a
  group straight after the switch's row, marked `data-fold`, and show only while the switch is on;
  the switch itself always stays. Nothing is reset: turn it back on and they're as they were. Never
  dim them instead. `data-fold="off"` is for the opposite case (shown only while the switch is off),
  `data-fold="far"` for a group whose switch or choice sits somewhere else. The Molten scripts have a
  `fold(show, kind)` helper; elsewhere set `data-fold` and `hidden`. The master switch works the
  same way: off, its features fold away and only things like Appearance, Troubleshooting and your
  data remain (the Molten scripts leave just the switch; Hourglass's Schedule and Sites tabs say it's
  paused). Kaleidoscope has no master switch. `tools/tests/live.py` flips every switch and fails if
  a fold shows or hides out of step with it, or if anything under an off switch is merely dimmed.
- **Counters** for things a script does for you on its own (prompts answered, app prompts skipped,
  reply threads opened) go on an extra line under that feature's description, worded
  "<Did> N <things> so far" ("Skipped 37 app prompts so far"), hidden while it's 0. Counts only,
  never time-saved estimates or dates; they're kept per device since install under the `counts`
  key (`COUNTS.bump(key)` to count, `COUNTS.line(row, key)` to show).
- **Appearance** is a section with one toggle, "Match my device", placed just above Troubleshooting
  (or as the last section of the script's own settings when there's no Troubleshooting).
- **Troubleshooting** is always the last section of the tab that holds the script's own settings
  (or of the page), named exactly "Troubleshooting": console logging, diagnostics, layout report.
- **Footer** (one line, pinned at the bottom): "Open from <launcher> or the Tampermonkey menu ·
  v<version> · every tab updates live" (drop the last part if settings don't sync across tabs).
- **Menu commands**, in this order and wording: "Open <Name>" (Prism adds "  (Alt+Shift+P)"), then
  "Turn <Name> on/off" if it has a master switch, then extras worded the same way: "Turn lava on/off",
  "Turn screenshot safe on/off", "Turn badges on/off for this site".
- **Behaviour.** Esc closes the panel; changes apply live; clicks and keys inside the panel never
  reach the site. Everything the panel shows updates on the spot, never only after switching tabs,
  reopening or refreshing: a control and anything it affects (the sun/moon switch and "Match my
  device", a tone and its color swatch, a status line), in this tab and in every other open tab of
  the site, plus readouts that change on their own (a color that fades in, a count). An open panel
  re-renders when another tab saves, unless someone is typing in it. `tools/tests/live.py` tests this:
  it changes every control there and back, compares the panel with a freshly opened one, then does
  the same from a second tab. No new keyboard shortcuts (Prism's Alt+Shift+P is the only one).
- **Light and dark.** Every panel follows the device's light or dark setting by default. The header
  switch picks one and keeps it; turning "Match my device" back on returns to following the device.
  The choice is saved as `appearance` (`auto`, `light` or `dark`, default `auto`), follows device
  changes live (a `prefers-color-scheme` listener) and reaches every open tab. Everything a script
  draws flips, not just the panel: menus, toasts, the block screen and lockdown card, the late-night
  nudge, the badge menu. Only accents stay the same; accent-colored text uses a darker ink of the
  accent on light glass so it stays readable.
- **The glass recipe.** Every frosted surface (panel, menus, cards, toasts) uses the same numbers
  (design tokens in `tools/lib/tokens.json`; the table below must match them); neutrals swap between
  themes and accents don't:

  | | light | dark |
  |---|---|---|
  | glass | `rgba(255,255,255,.84)` | `rgba(22,22,28,.8)` |
  | edge | `rgba(255,255,255,.8)` | `rgba(255,255,255,.12)` |
  | top highlight (inset) | `#fff` | `rgba(255,255,255,.1)` |
  | drop shadow | `rgba(0,0,0,.34)` | `rgba(0,0,0,.6)` |
  | text | `#1d1d1f` | `#f2f2f5` |
  | secondary text | `rgba(29,29,31,.64)` | `rgba(235,235,245,.62)` |

  Both: `backdrop-filter: blur(28px) saturate(170%)`, plus an accent glow in the top-left corner,
  `radial-gradient(120% 40% at 0% 0%, <accent at .16–.2>, transparent)`. Glass may be tinted
  slightly toward the script's accent (Prism, Hourglass, Kaleidoscope's AniList navy) but keeps
  the same opacity: 84% light, 80% dark. Kaleidoscope keeps AniList's own text colors (part of its
  skin) and every other number above. Small chips over video (Looking-Glass badges) and
  full-screen veils are not glass and keep their own lighter blur, without `saturate(170%)`.
  `tools/check.py` and `tools/tests/audit.py` enforce this (below).
- **Everything stays visible in both themes.** Text, chart labels (SVG text too), small marks (dots,
  ticks, legend swatches, `::before`/`::after` markers), dashed guide lines and selected states take
  their colors from the theme variables or the accent, never a fixed dark or light gray that only
  works on one glass. Selection and focus rings (outlines, a tapped bar or day) use the accent, never
  black, white or the text color: some phone browsers darken light pages themselves and leave
  outlines alone, so a neutral ring vanishes there. The audit flags text under 3:1 and marks under
  1.8:1 against what's behind them, and taps a chart bar to check the selected state too.
- `tools/build/frame_molten.py` and `tools/build/frame_kaleido.py` record the change that brought the Molten and
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
    The GitHub social preview is uploaded by hand (repo Settings → Social preview, `docs/og.png`):
    re-upload it whenever `docs/og.png` changes, and say so when shipping.
  - After redrawing the icons: `node tools/icons.js`, scale them to 256px,
    `python3 tools/panel_icons.py`, update the shapes in `tools/live_glyphs.py` and run it, raise `?v=N`
    on every `@icon`, bump the versions, recapture, and run `python3 tools/pages.py`.

## Design tokens

`tools/lib/tokens.json` is the one place the design numbers live: the glass recipe (both themes, blur,
saturation, opacity), control sizes, the panel's shape (below), the contrast minimums and the prism
cut's diagonal and seam.

**Panel shape** (the `shape` tokens; the audit measures every panel against them):

| | |
|---|---|
| panel | 400px wide (Hourglass 760px), 22px corners; phone sheets 24px top corners |
| insets | icon tile and close button 18px from the panel's edges; tab bar 14px from each side |
| corner scale | 22 panel · 24 sheet · 16 card · 12 control · 10 field · 9 small · 8 button · 6 chip · 4 tiny |

Every rounded corner inside a panel is on the scale, fully round, 4px or less, or nested inside its
parent's corner (the parent's radius less its padding, so a segment inside a 12px bar with 3px of
padding is 9px). The kit's template takes these from the tokens too.
`tools/frame.py` stamps the controls from it, the audit (`tools/lib/shot.js`) measures against it, the
kit fills its template's glass from it, and the cut and banners take their diagonal from it. To
change a number: edit `tools/lib/tokens.json`, run `python3 tools/frame.py` and `python3 tools/pages.py`,
update the scripts' own glass where the recipe changed, recapture, and ship. `tools/check.py`
fails if CLAUDE.md's tables disagree with the file or a tool keeps its own copy of a token value.

## Dashboards (Hourglass's, and any panel that shows your history)

A dashboard is there to tell people something about their habits, not to show the same numbers
in more shapes.

- **Every card answers one question, in plain short sentences.** The card's label is the question
  ("What changed?", "When do you drift?") and its first line is the answer, naming what it found
  ("youtube.com rose the most in the past 7 days. It went from 41m to 2h 05m a day."). At most
  two sentences, each under 16 words with at most one comma: a chain of commas is hard to
  follow. Charts and rows below back the answer up. A card with nothing to say yet says why
  ("Changes show up after 13 more days of history.").
- **Each chart lives on the card whose question it answers**, so a favorite view (hours stacked by
  category, a bar per day, the category breakdown) is part of a card instead of a card of its own
  that repeats another's numbers.
- **No figure appears on two cards.** If two cards would show the same number, one of them is
  asking the wrong question.
- **Compare with the person's own history.** Use everything stored (up to the history setting),
  not just the last few days: today against the usual for this weekday, the chosen range against
  the weeks before it.
- **Three levels, top to bottom**: *At a glance* (today's total against the usual, today's
  lockdown), *Where and when* (today by hour, how much and on what over the range, the sites that
  moved) and *What's changing* (when you drift, whether lockdown works, the goal streak). Each
  level has a small heading; a new card goes in the level its question belongs to.
- **Week and Month are ranges, not extra cards.** One switch above the range cards picks the
  range (last 7 days or last 4 weeks) and every card that covers a period uses it; the sentences
  say which period they mean. Today's cards cover today, and the streak calendar always shows
  five whole weeks.
- **Every chart has labelled axes**: what's along the bottom (hours, days) and what the height or
  shade means (time, a scale with units), so nobody has to guess what a bar is.
- Markup the checks read: each card is `[data-q]` (the question), its sentence is `.ans`, and
  axis labels are `[data-axis]` (left out of the repeated-figure check).
- `python3 tools/tests/dash.py` runs the dashboard on several made-up histories (`tools/seeds/hourglass.py`:
  a habit change, a good stretch, a new install, no data) and fails if a card has no sentence, a
  figure shows on two cards, a chart has no axis labels, text says NaN or undefined, or a
  sentence misses the change planted in that history. `tools/check.py` runs it when Hourglass
  changes. A new dashboard card or scenario gets an entry there.
- The demo history in `tools/seeds/hourglass.json` is written by `python3 tools/seeds/hourglass.py`
  (six weeks with a clear change in the last one); edit the generator, not the JSON.

## Performance

Scripts run for hours on busy pages (a YouTube or Reddit feed that never stops loading), so what a
script leaves running matters more than how fast it starts.

- **Nothing keeps growing.** Every repeating timer, page watcher (MutationObserver) and listener a
  script starts is started once, or stopped when it's done; elements and data for things that left
  the page aren't kept. A page change in a site's app (YouTube and Reddit never reload) is not a
  reason to start another one.
- **Work in proportion to what changed.** Prefer reacting to the page (an observer, an event) over
  polling it, keep polling slow (a second or more) and narrow (the elements that matter, not every
  element), and remember what's been handled (a WeakSet) instead of handling it again.
- **A background tab costs next to nothing**, except for what has to keep working there (Hourglass's
  listening time and lockdown, Molten's answers to "still watching?" while music plays).
- `python3 tools/tests/perf.py` runs a long session on a stand-in page of each script's site (40 rounds of
  200 new feed items, text changes and app-style page changes, then a quiet stretch and a hidden one)
  and compares it with the same session without the script. It fails on growth in memory, page
  elements, listeners, timers or page watchers, and on script time over its budget per round, per
  quiet second and per hidden second (`BUDGET` in the file, about twice what the scripts cost today, so
  it catches a new leak or a timer that suddenly costs much more, not small drifts). It also reports
  page work: how much longer the page's own changes take with the script on, which is the price of
  what the script draws (Molten's lava) rather than a bug. It proves itself first on a deliberately
  bad script, which every budget has to catch: a new kind of leak gets a line there. The stand-in pages
  aren't the real sites, so compare numbers between versions, not with real-world timings, and only
  from runs one at a time (`tools/tests/perf.py` never runs two browsers at once). `tools/check.py` runs it
  for changed scripts; it isn't part of GitHub's run, whose shared machines time too unevenly.
- `node tools/lib/shot.js <script> <url> /dev/null --perf … --cpuprofile <file>` saves a CPU profile of the
  quiet stretches, to find where a script's time goes before changing anything.

## After any change: rebuild the pages

```
cd tools && npm ci && pip install --require-hashes -r requirements.txt   # the locked tools (Playwright, Pillow); then npx playwright install chromium
cd tools && npm audit && pip-audit -r requirements.txt  # no known vulnerabilities in the tools (check.py runs both when a pin changes)
python3 tools/screens.py [script]   # recapture panel screenshots (needs Playwright + Chromium)
python3 tools/pages.py              # rebuild every README, banner, site page and link preview
python3 tools/tests/audit.py [script]     # check panels for small visual glitches (run after panel changes)
python3 tools/tests/carry.py [script]     # check settings and saved data carry over from the live version
python3 tools/build/sheet.py              # every changed screenshot, dark next to light, on one sheet per script
python3 tools/tests/live.py [script]      # every control updates the panel live, in this tab and in another open tab
python3 tools/tests/perf.py [script]      # a long session: nothing keeps growing, time within budget (Performance)
python3 tools/check.py              # release check: everything below, plus the two above for changed scripts
```

- The tools are locked (all in `tools/`): Node in `package-lock.json`, Python in `requirements.txt`, which is made from the pins
  in `requirements.in` (change a pin there, then run the `uv pip compile` line at its top, in `tools/`) and holds every
  package, dependencies included, with hashes. `tools/check.py` fails if the two disagree or a package has
  no hash. `pip-audit` itself is locked the same way, apart from the tools (`requirements-audit.in` →
  `requirements-audit.txt`).
- Known vulnerabilities: GitHub's `audit` job runs `npm audit` and `pip-audit` on both Python locks on
  every push and weekly. It's a job of its own, not part of "checks", so a vulnerability published today
  shows up red without holding back a release or a rollback: fix it (raise the pin, re-lock) before the
  next change. `tools/check.py` runs the same audits whenever a lock file changes, and fails if it can't.
- `tools/tests/audit.py` opens every panel, tab and fold-out picker at laptop, desktop and phone sizes
  (phones in Roboto), once on a plain page and once with common site-wide CSS, and lists text
  spilling out of buttons, things cut off or off screen, sideways scrolling and overlaps. It also
  flags phone sheets sized in plain `vh`. It runs in both themes and also flags glass off the
  recipe, text fainter than 3:1 and marks or outlines under 1.8:1 against their background
  ("hard to see"), switches whose knob isn't centered, shared controls off the sizes above, and
  labels that take the site's own text color (the site CSS uses the opposite theme's colors),
  with a chart bar tapped as well, and does the same for what a script draws
  outside its panel (`SURFACES` in `tools/tests/audit.py`: block screen, nudge, badge menu; add new ones there). It also flags
  a row of buttons (30px and taller) that wraps onto a second line without lining up in columns:
  lay such rows out as one row, or as a grid of equal columns (two per row on phones). A row that holds only
  action buttons (two or more) spans the full width of its row and splits it evenly, so nothing sits
  pushed to one side next to an empty stretch; the audit flags rows that don't. A lone button keeps its
  own size, and segmented controls (on their own filled bar) and buttons beside a label are left alone. `node tools/lib/shot.js … --forcedark` opens a page
  the way browsers that darken pages themselves show it, to look at by eye. Fix what it finds before shipping; it should print
  "clean" for every script.
- Panels that live in the page (not a shadow root) inherit the site's CSS: undo text rules like
  `white-space` on the panel itself. Their buttons get one reset in the stamped frame (normal
  display, auto height, centered content), because sites like Reddit give every button a fixed
  height with its text pushed to the bottom; the audit's site CSS does the same and flags any
  button whose text isn't centered. Picker grids and any group of buttons that can wrap use equal columns
  (`minmax(0,1fr)`) and drop to 3 per row when a label is long, so labels wrap instead of
  spilling. Phone sheets size with `dvh` (after a `vh` fallback) so the address and tool bars
  never cover the top.

- Pages are generated. Edit the data, not the output: product copy lives in
  `tools/build/readmes.py` (name, tagline, intro, sites, screenshots, extra sections) and
  `tools/build/features.py` (feature titles and descriptions); site themes in `tools/build/site_themes.py`.
- Version labels on every page are read from each script's `@version`, so rebuild after
  every bump and the labels stay current.
- Recapture screenshots only when a panel's look or content changes, not for a version
  bump: the capture tool leaves version numbers out of the images, and the Install buttons
  and version chips on the pages carry the current number. Recapture just the scripts
  whose panels changed (`python3 tools/screens.py <script>`). `screens.py hourglass` also
  refreshes Hourglass's phone shots, the late-night nudge included.
- Every screenshot is taken in both themes: `<name>.webp` (dark) and `<name>-light.webp`. The site
  has a sun/moon switch in the top bar that follows the device until it's flipped (then remembers
  the choice, with a "Match my device" link in the footer to go back) and swaps the site's palette
  and every screenshot.
- **Wherever there's no switch, show both themes at once** with the prism cut: light upper left,
  dark lower right, along a diagonal with a thin seam in the script's accent (a lava-lamp edge with
  wax drops for the Molten scripts). That's every README banner (`tools/build/banners.py`), each README's
  top screenshot and the front README's cards (`<name>-cut.webp`, made by `tools/build/readmes.py` with
  `tools/build/prismcut.py`), and every link preview (`docs/img/<script>/og.png` and the landing
  `docs/og.png`). The README galleries further down use `<picture>` and follow GitHub's theme. The
  site itself never uses the cut: its switch shows both.
- Link preview addresses carry a fingerprint of what they're made from (`og.png?v=…`), so Discord,
  Slack and others fetch the new image instead of a cached old one.
- **Look at every changed screenshot before pushing** (`python3 tools/build/sheet.py`), dark and light,
  every tab. It writes one page per screenshot, dark next to light, and cuts tall ones into parts so
  every page can be read at full size; look at every page it prints. The checks only catch the problems they were written for; looking catches the rest
  (a knob out of place, a ring that shouldn't be there, a color that's off). When looking finds
  something a check could have caught, add the check too.
- Panels open with focus on the panel itself, never on a control (that shows a focus ring on
  every open); Esc still closes them.
- Screenshots use made-up demo data only (`tools/seeds/`). Never use real browsing data.
- A panel change that only shows up with data (a counter line, a list, a status) needs demo data
  in `tools/seeds/` so the screenshots show it; otherwise the pages never show the new feature.
- A capture shows the whole panel: `tools/screens.py` fails if anything in a cropped capture still
  scrolls (part of the panel would be missing), so give long panels a taller `--vh`.
- Captures repeat exactly (fixed clock, demo data, animations stopped, the fonts in `tools/lib/fonts.conf`),
  so `tools/check.py` recaptures every changed script's panels in a scratch folder and fails if a
  committed screenshot no longer matches its panel.

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
- GitHub runs the release check on every push (`.github/workflows/checks.yml`, `check.py --quick --ci`;
  actions pinned to exact commits): the rules, every security test, settings carry-over, live updates
  and the generated pages for whatever changed. The glitch check (phone sizes in Roboto), the
  performance test (shared machines time unevenly) stay local, so it doesn't replace the local check.
  Screenshots are compared there too and a mismatch fails, except Kaleidoscope's two panels, which are
  report-only on GitHub (issue #3: the same font files put its footer line one pixel further right there).
  They match because every test browser draws with the same fonts
  (`tools/lib/fonts.conf`: Ubuntu 24.04's `fonts-inter`, `fonts-dejavu-core`, `fonts-dejavu-mono` and `fonts-noto-color-emoji`,
  no hinting); the job runs on `ubuntu-24.04` (not `ubuntu-latest`) and installs those four packages. A failed run gets fixed
  before anything else; `gh run list --workflow checks.yml` shows the latest.
- Pull before you start and rebase on anything new before pushing; other chats work on
  this repo too.
- **Ship with `python3 tools/push.py`**, never `git push` to `main`. A ruleset on `main` (repo Settings →
  Rules → Rulesets, set by hand: this workflow can't write repo settings) blocks force pushes and
  deleting the branch, and takes only a commit whose "checks" run has already passed. So `tools/push.py`
  pushes the commit to the holding branch `ready`, waits for GitHub's run on it, and moves `main` to that
  same commit once it passes; if the run fails, `main` stays put. `tools/check.py` warns while the
  ruleset or its required check is missing.
- Never force-push or rewrite history, on any branch (`ready` included). Installed copies update straight
  from `main`, so whoever can push to it can ship code to everyone: keep two-step sign-in on the account.
- **Rolling back** a bad release: put the last good code back and give it a *higher* `@version` than the
  bad one (Tampermonkey never installs a lower number, so a plain revert reaches nobody), then run the
  usual checks and ship it (`tools/push.py`). Say in the commit which version it restores. Tried end to end
  in a real Tampermonkey (issue #1): the rollback arrives through the normal update check, settings and
  saved data survive both the bad release and the rollback, and the old code under its old, lower number
  is ignored. GitHub serves the raw files with a 5-minute cache, so for up to 5 minutes after a push (or
  after someone's last download) an update check can still find nothing: wait 5 minutes before deciding
  a release didn't go out.
- Don't create a repo named `userscripts` on this account: GitHub redirects that old name
  here, and installed copies may still rely on the redirect.
