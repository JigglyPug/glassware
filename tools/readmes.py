import os
import re, sys
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from features import F
OWNER = sys.argv[1] if len(sys.argv) > 1 else 'JigglyPug'
REPO = 'glassware'; R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = f'https://raw.githubusercontent.com/{OWNER}/{REPO}/main'
SITE = f'https://{OWNER.lower()}.github.io/{REPO}/'

# The Molten panels open on their Lava tab, so "main" is really the Lava tab.
for p in ['desktop/molten-tools', 'desktop/molten-for-reddit', 'mobile/molten-for-reddit-mobile']:
    m = f'{R}/{p}/images/main.webp'
    if os.path.exists(m): os.replace(m, f'{R}/{p}/images/lava.webp')

def ver(path):
    return re.search(r'@version\s+(\S+)', open(f'{R}/{path}', encoding='utf-8').read()).group(1)

S = {}
S['desktop/prism'] = dict(name='Prism', tag="Every app title bar, in its site's own color.", sites='Every site',
 intro='Prism colors the title bar of installed web apps (PWAs) to match the site you are on. It reads the color from the app icon, the manifest, the page\'s own theme color, the favicon or the page header, in whatever order you choose.',
 features=[
  '**Five color sources** (app icon, manifest color, site theme color, favicon, page header). Drag them into the order you want; the first one that works wins.',
  '**Live trail** shows which sources hit or missed on the current site and which one is in use.',
  '**Tone**: use the color exactly as found, or push it darker or brighter.',
  '**Per-site override**: type your own hex color, use the color dropper, or turn Prism off for one site.',
  '**Fallback color** for pages where nothing else works.',
  '**Master switch** to turn everything off at once; every open tab updates live.',
  'Frosted, Apple-style menu tinted by the current title bar color. Open with **Alt + Shift + P** or the Tampermonkey menu.',
  'Optional console logging (lines start with `[prism]`).'],
 shots=[('main', 'Settings panel')])

S['desktop/hourglass'] = dict(name='Hourglass', tag='Screen time and lockdown for every site.', sites='Every site',
 getting_started='A fresh install starts in setup mode: Hourglass counts your screen time but blocks nothing and locks no settings. Check your sites and schedule, then tap **Start lockdown** on the welcome card. If you start during scheduled hours, you can begin right away or wait until the current block ends.',
 phone=('The same script switches to a phone layout on its own: a bottom-sheet menu, a trimmed dashboard you can tap for details, and bigger touch targets. Open it from the Tampermonkey menu, or from the Open Hourglass link on any block screen.',
        [('phone-dashboard', 'Dashboard'), ('phone-schedule', 'Schedule'), ('phone-block', 'Block screen'), ('phone-nudge', 'Late-night nudge')]),
 intro='Hourglass tracks how long you spend on every site and blocks the distracting ones on a schedule. During lockdown the settings lock too, so you cannot talk yourself out of it in the moment.',
 features=[
  '**Dashboard**: screen time today vs your average, a by-hour chart with lockdown hours shaded, week/month view, a "time online" ring, per-category trends, blocked attempts, passes used, top sites, visits, busiest hour, first visit and days under your goal.',
  '**Suggestions**: sites not on your list that average 30m+ a day get suggested for a category (or ignored).',
  '**Schedule**: per-day lockdown blocks with drag handles in 30-minute steps, quick presets (9–5, 7–6, evenings, overnight, 24h), and copy-to-weekdays / every day.',
  '**Passes**: a set number of daily passes that open only the site you are on, with a pass length and a think-it-over wait.',
  '**Sites**: Socials, Shopping, Music and Custom lists; set each site to follow the schedule or always block.',
  '**Lockdown protection**: an "Is this important?" screen with a delay before Continue appears; loosening changes only take effect after lockdown ends.',
  '**Music mode** lets music sites through, plus listening time counted separately from screen time.',
  '**Late-night nudge**: a friendly take-a-break reminder after bedtime, even outside lockdown.',
  'Idle timeout, video/music counts as active, history length, daily goal and week start day.',
  'Private: data stays in Tampermonkey on that device, and only site names are stored, never full addresses or page titles.'],
 shots=[('main', 'Dashboard'), ('schedule', 'Schedule'), ('sites', 'Sites'), ('settings', 'Settings')],
 )

S['desktop/looking-glass'] = dict(name='Looking-Glass', tag='Open any video on its own.', sites='Every site',
 intro='Looking-Glass puts a small circle in the corner of every video, in the site\'s own color. Tap it to open the video file in its own tab. It works on Facebook, Instagram, Reddit, X, TikTok, YouTube and any page with a plain video.',
 features=[
  '**One tap** opens the direct video file in a new tab, in the background or switching to it.',
  '**Site-colored badge**: corner, size and resting opacity are adjustable; show it on every video or just the main one, always or only on hover.',
  '**Skips small videos** such as thumbnails and previews (size threshold adjustable).',
  '**Ducks under headers** when a site bar would cover the corner.',
  '**Best quality or data saver.**',
  '**When there is no direct file**: open the post instead or hide the badge. "Look harder" quietly loads the post page to find the file.',
  '**Right-click a badge** to copy the link, open the post, hide it or open settings.',
  'Per-site on/off and corner, an optional recent list, and a status bar showing what it is watching.'],
 shots=[('main', 'Settings panel, with the badge on the video to the left')])

S['desktop/molten-tools'] = dict(name='Molten Tools', tag='Molten glass and quality-of-life fixes for YouTube.', sites='YouTube, YouTube Music',
 intro='Molten Tools gives YouTube and YouTube Music a molten-glass lava background, plus a set of quality-of-life fixes. Click the orange lava button in the top bar for settings.',
 features=[
  '**Lava background** taken from the video or album art, with Calm / User / Crazy profiles. Each profile remembers its own blur, brightness, saturation, zoom, glass blur, motion and blobs.',
  '**Performance controls**: frame rate, sample size and GPU-saving switches.',
  '**Auto-dismiss** for "Continue watching?" and "Video paused" prompts.',
  '**Title bar and seek bar** colored from the current thumbnail, with a tone choice.',
  '**Automatic video quality**: a separate choice for high-frame-rate videos and YouTube Music video mode, Premium 1080p when offered, theater mode and custom player height.',
  '**Screenshot safe**: hides your account and channel names, handles and email everywhere on the site.',
  '**Default account switcher**: save which account or channel YouTube should open on.',
  'Master on/off switch; settings shared between YouTube and YouTube Music; open tabs update live.'],
 shots=[('general', 'General'), ('account', 'Account'), ('quality', 'Quality'), ('lava', 'Lava')])

S['desktop/molten-for-reddit'] = dict(name='Molten for Reddit', tag='Molten glass for new Reddit.', sites='reddit.com (new Reddit)',
 intro='Molten for Reddit puts a lava-lamp background made from the image or video you are looking at behind clear-glass posts and comments. Click the orange lava button in the top bar for settings.',
 features=[
  '**Lava background** from the post in the middle of the screen (falls back to the subreddit banner or icon), with Calm / User / Crazy profiles.',
  '**Glass controls**: frost, blur, roundness, outline and text shadow.',
  '**Title bar and video seek bar** colored from the art.',
  '**Best video quality** for Reddit MP4 videos; glass instead of black bars around narrow videos; a playing video can take over the lava.',
  '**Reddit tweaks**: default comment sort, auto-expand "more replies", hide the right sidebar and the legal links.',
  '**Arctic Shift lookup**: search any user\'s posts or comments, plus a 🔍 next to names on profiles.',
  'Master on/off switch and a layout report for troubleshooting.'],
 shots=[('general', 'General'), ('lava', 'Lava'), ('video', 'Video'), ('reddit', 'Reddit'), ('search', 'Search')])

S['desktop/kaleidoscope'] = dict(name='Kaleidoscope', tag='Your AniList list, turned into your next favorite.', sites='anilist.co, claude.ai',
 intro='Click the ✦ button on AniList and pick a mode. Kaleidoscope has Claude build a recommendation board from your list in the background, then opens it for you.',
 features=[
  '**Five modes**: more like my recent, more like my top rated, wildcard, what\'s airing now, clear my backlog. Works for anime and manga.',
  '**Optional mood** ("short", "no isekai", "dark and gritty").',
  '**Send to Claude** (board only, paste only, or paste and send), or copy the prompt to the clipboard.',
  '**Sequel finder**: sequels to things you have completed but not started, straight from AniList data with no AI.',
  '**Standing preferences** added to every prompt.',
  'Button in the top bar or the bottom corner.'],
 shots=[('main', 'Recommend'), ('sequels', 'Sequels'), ('settings', 'Settings')],
 note='a claude.ai account, signed in in the same browser, for the Claude features. Clipboard mode works without one.')

S['mobile/kaleidoscope-mobile'] = dict(name='Kaleidoscope Mobile', tag='Kaleidoscope, made for your phone.', sites='anilist.co',
 intro='This is the phone version of Kaleidoscope, built for Edge on Android. It uses the same prompts but has no Claude automation: pick a mode, then Copy, Save or Share the prompt.',
 features=[
  '**The same five modes and the same prompt logic** as desktop Kaleidoscope, for anime and manga.',
  '**Copy / Save / Share** the prompt.',
  '**Update** builds a "what changed since last time" prompt from your list.',
  '**Changes since last prompt** list.',
  '**Sequel finder** (AniList data, no AI).',
  'Opens from the Tampermonkey menu or a small ✦ button (bottom left, bottom right, or hidden).',
  'Remembers your AniList username for pages that don\'t show it.'],
 shots=[('main', 'Recommend'), ('sequels', 'Sequels'), ('settings', 'Settings')],
 runs_on_phone=True)

S['mobile/molten-for-reddit-mobile'] = dict(name='Molten for Reddit Mobile', tag='Molten glass for Reddit, pocket size.', sites='reddit.com',
 intro='This is the phone version of Molten for Reddit: a gentle lava background from the post you are looking at, clear-glass posts and comments, with simpler controls made for touch.',
 features=[
  '**Lava**: Calm / Balanced / Crazy presets, with Clear / Soft / Frosted glass.',
  '**Colors from the art** for the seek bar and the address bar (in browsers that support it).',
  '**Video quality**: Best, Auto, 1080p, 720p or 480p; glass around narrow videos; video shows through the lava (Off, Subtle or Strong).',
  '**No "Open in app" nagging**: hides app banners and taps "Continue" for you.',
  'Comment sort, auto-expand replies and Arctic Shift profile lookup.'],
 shots=[('general', 'General'), ('lava', 'Lava'), ('video', 'Video'), ('reddit', 'Reddit'), ('search', 'Search')],
 runs_on_phone=True)



# Where each script runs. This, not the folder, decides the platform labels, the landing filter,
# the README sections, the "Also on" links and the "More for..." links. Folders only fix the
# update URLs, so a script never moves folders. Every new script needs an entry here.
RUNS = {'desktop/prism': 'desktop', 'desktop/hourglass': 'both', 'desktop/looking-glass': 'both',
        'desktop/molten-tools': 'desktop', 'desktop/molten-for-reddit': 'desktop', 'desktop/kaleidoscope': 'desktop',
        'mobile/kaleidoscope-mobile': 'phone', 'mobile/molten-for-reddit-mobile': 'phone'}
# Desktop and phone versions of the same app link to each other.
PAIR = {'desktop/kaleidoscope': 'mobile/kaleidoscope-mobile', 'desktop/molten-for-reddit': 'mobile/molten-for-reddit-mobile'}
PAIR.update({v: k for k, v in list(PAIR.items())})
GROUPS = [('both', 'Desktop and phone'), ('desktop', 'Desktop'), ('phone', 'Phone')]
PLATFORM = {'both': 'Desktop + phone', 'desktop': 'Desktop', 'phone': 'Phone'}
assert set(RUNS) == set(S), 'every script needs a RUNS entry'
def runs_on(p, where): return RUNS[p] in ('both', where)
for _p, _s in S.items():
    _s['platform'] = PLATFORM[RUNS[_p]]
    _s['kicker'] = dict(GROUPS)[RUNS[_p]] + ' userscript'

ACCENT = {'desktop/prism':'3b6fd6','desktop/hourglass':'5b5bd6','desktop/looking-glass':'3b6fd6','desktop/molten-tools':'ff8a3d',
          'desktop/molten-for-reddit':'ff8a3d','desktop/kaleidoscope':'3db4f2','mobile/kaleidoscope-mobile':'3db4f2','mobile/molten-for-reddit-mobile':'ff8a3d'}
HERO = {'desktop/molten-tools':'general','desktop/molten-for-reddit':'general','mobile/molten-for-reddit-mobile':'lava'}

def badge(label, msg, color, style='for-the-badge'):
    from urllib.parse import quote
    q = lambda t: quote(t.replace('-', '--').replace('_', '__'), safe='')
    return f'https://img.shields.io/badge/{q(label)}-{q(msg)}-{color}?style={style}'

for p, s in S.items():
    if ONLY and p not in ONLY: continue
    slug = p.split('/')[1]; url = f'{RAW}/{p}/{slug}.user.js'; v = ver(f'{p}/{slug}.user.js'); c = ACCENT[p]
    phone = s.get('runs_on_phone')
    hero = HERO.get(p, s['shots'][0][0]); rest = [x for x in s['shots'] if x[0] != hero]
    md  = f'<div align="center">\n\n<img src="../../assets/icons/{slug}.png" alt="{s["name"]} icon" width="112">\n\n<img src="images/banner.svg" alt="{s["name"]}: {s["tag"]}" width="100%">\n\n'
    md += f'[![Install]({badge("Install", "v" + v, c)})]({url}) [![Website]({badge("Website", "product page", "222")})]({SITE}{p}/)\n\n'
    md += f'![Runs on]({badge("runs on", s["sites"], "555", "flat-square")}) '
    md += f'![Platform]({badge("platform", s["platform"], "555", "flat-square")})\n\n'
    md += f'<img src="images/{hero}.webp" width="{300 if phone else 620}">\n\n</div>\n\n'
    md += s['intro'] + '\n\n'
    if s.get('getting_started'): md += '## Getting started\n\n' + s['getting_started'] + '\n\n'
    md += '## Features\n\n' + '\n'.join(f'- **{t}**: {b}' for t, b in F[p]) + '\n'
    if s.get('note'): md += f"\n**Requires:** {s['note']}\n"
    if rest:
        md += '\n## A closer look\n\n'
        per = 4 if phone else 2; w = 200 if phone else 400
        md += '<table>\n'
        for i in range(0, len(rest), per):
            md += '<tr>' + ''.join(f'<td align="center" valign="top"><img src="images/{f}.webp" width="{w}"><br><sub><b>{cap}</b></sub></td>' for f, cap in rest[i:i+per]) + '</tr>\n'
        md += '</table>\n'
    if s.get('phone'):
        txt, shots = s['phone']
        md += '\n## On your phone\n\n' + txt + '\n\n<table>\n<tr>' + ''.join(f'<td align="center" valign="top"><img src="images/{f}.webp" width="200"><br><sub><b>{cap}</b></sub></td>' for f, cap in shots) + '</tr>\n</table>\n'
    open(f'{R}/{p}/README.md', 'w', encoding='utf-8').write(md)

def card(p):
    s = S[p]; slug = p.split('/')[1]; url = f'{RAW}/{p}/{slug}.user.js'; hero = HERO.get(p, s['shots'][0][0])
    pair = PAIR.get(p)
    also = (f'<br><sub>{"Phone version" if RUNS[pair] == "phone" else "Desktop version"}: <a href="{pair}">{S[pair]["name"]}</a></sub>') if pair else ''
    return (f'<td align="center" valign="top" width="50%"><a href="{p}"><img src="{p}/images/card.webp" width="380"></a><br>'
            f'<h3><img src="assets/icons/{slug}.png" alt="" width="44" align="center"> <a href="{p}">{s["name"]}</a></h3>{s["tag"]}<br><sub>{s["sites"]}</sub>{also}<br><br>'
            f'<a href="{url}"><img src="{badge("Install", "v" + ver(f"{p}/{slug}.user.js"), ACCENT[p])}"></a></td>')

def group(g):
    return [p for p in S if RUNS[p] == g]

def grid(g):
    ps = group(g)
    return '<table>\n' + ''.join('<tr>' + ''.join(card(p) for p in ps[i:i+2]) + '</tr>\n' for i in range(0, len(ps), 2)) + '</table>\n'

def cell(p, where):
    if runs_on(p, where): return '✓'
    q = PAIR.get(p)
    return f'[{S[q]["name"]}]({q}) ↗' if q and runs_on(q, where) else ''

table = ('| Script | Desktop | Phone | Runs on |\n|---|:---:|:---:|---|\n'
         + ''.join(f'| <img src="assets/icons/{p.split("/")[1]}.png" alt="" width="20" align="center"> [{S[p]["name"]}]({p}) | {cell(p, "desktop")} | {cell(p, "phone")} | {S[p]["sites"]} |\n'
                   for g, _ in GROUPS for p in group(g)))

root = f"""<div align="center">

<img src="assets/glassware-banner.svg" alt="Glassware: glass for the web, by JigglyPug" width="100%">

[![Visit the site]({badge("Visit the site", "jigglypug.github.io", "ff8a3d")})]({SITE})

Built for [Tampermonkey](https://www.tampermonkey.net/). Every script updates itself from this repo.

</div>

## Where each script runs

{table}
""" + ''.join(f"""
## {title}

{grid(g)}""" for g, title in GROUPS)
if not ONLY: open(f'{R}/README.md', 'w', encoding='utf-8').write(root)
ROOT_CARD = card
print('ok')
