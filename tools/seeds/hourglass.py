"""Made-up Hourglass histories: the demo seed for the screenshots, and the scenarios tools/tests/dash.py checks.

    python3 tools/seeds/hourglass.py        # rewrite tools/seeds/hourglass.json (the demo: 'habit')

Every history ends on Tuesday 2026-11-03 at 8:40 PM, the screenshot clock. Nothing here is real
browsing data. make(name) returns the GM store for a scenario; PLANTED says what each scenario's
dashboard has to say, card by card (tools/tests/dash.py checks it).
"""
import json, os, random
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
END = date(2026, 11, 3)
NOW_H, NOW_M = 20, 40                   # the screenshot clock: today is counted up to 8:40 PM
CAT_IX = {'social': 0, 'shop': 1, 'music': 2, 'custom': 3, 'other': 4}   # order inside each hour bucket

# the list Hourglass starts with (sites not here count as "everything else")
LISTED = {'reddit.com': 'social', 'youtube.com': 'social', 'instagram.com': 'social', 'amazon.com': 'shop', 'music.youtube.com': 'music'}

def w(*spans):
    """Hour weights from (start, end, weight) spans."""
    a = [0.0] * 24
    for s, e, x in spans:
        for hr in range(s, e): a[hr] += x
    return a

# site: (minutes a day, weekday hours, weekend hours, weekdays only)
BASE = {
    'youtube.com':       (40, w((7, 8, 1), (12, 13, 1), (18, 22, 3)), w((10, 13, 2), (15, 22, 2)), False),
    'reddit.com':        (35, w((7, 9, 2), (12, 13, 3), (17, 21, 2)), w((9, 12, 2), (13, 22, 1)), False),
    'instagram.com':     (18, w((7, 8, 2), (12, 13, 2), (19, 22, 2)), w((10, 22, 1)), False),
    'amazon.com':        (10, w((12, 13, 1), (19, 21, 2)), w((11, 17, 1)), False),
    'music.youtube.com': (30, w((9, 17, 1)), w((11, 16, 1)), False),
    'github.com':        (45, w((9, 12, 2), (13, 17, 2)), w(), True),
    'wikipedia.org':     (15, w((10, 12, 1), (14, 16, 1), (20, 22, 1)), w((11, 21, 1)), False),
    'anilist.co':        (15, w((20, 22, 1)), w((14, 22, 1)), False),
    'ebay.com':          (12, w((12, 13, 1), (20, 22, 2)), w((12, 20, 1)), False),
}
LOCK = (9, 17)                          # demo lockdown: weekdays 9 AM - 5 PM

# what changes in the last week of each scenario (from Tuesday 2026-10-27 on, today included)
CHANGES = {
    'habit': {   # YouTube takes over the late evening, Twitch is new, eBay creeps up; Reddit eases off
        'youtube.com': (125, w((17, 21, 3), (21, 24, 3)), w((14, 18, 1), (20, 24, 3))),
        'twitch.tv':   (35, w((19, 24, 1)), w((21, 24, 1))),
        'ebay.com':    (38, w((20, 23, 1)), w((13, 22, 1))),
        'reddit.com':  (20, None, None),
    },
    'better': {  # a good stretch: YouTube and Reddit both way down
        'youtube.com': (12, None, None),
        'reddit.com':  (10, None, None),
        'instagram.com': (8, None, None),
    },
}
CHANGE_FROM = date(2026, 10, 27)

PLANTED = {
    # card question: words its sentence must include (case-insensitive), for each scenario; a
    # {'week': [...], 'month': [...]} entry when the change only stands out in one range
    'habit': {
        "How's today going?": ['above', 'Tuesday'],
        'Where did today go?': ['busiest hour'],
        'How much are you online?': ['more than before'],
        'Where does your time go?': ['Socials'],
        'What changed?': ['youtube.com', 'rose'],
        'When do you drift?': {'week': ['later'], 'month': []},
        'Is lockdown working?': ['fell'],
        'Are you under your goal?': ['streak'],
    },
    'better': {
        "How's today going?": ['below', 'Tuesday'],
        'Where did today go?': ['busiest hour'],
        'How much are you online?': ['less than before'],
        'Where does your time go?': [],
        # one good week is the biggest change over 7 days; over 4 weeks it's one of several
        'What changed?': {'week': ['youtube.com', 'dropped'], 'month': ['dropped']},
        'When do you drift?': [],
        'Is lockdown working?': [],
        'Are you under your goal?': ['streak'],
    },
    'new': {             # installed yesterday: no usual Tuesday, no history to compare yet
        "How's today going?": ['usual day'],
        'Where did today go?': [],
        'How much are you online?': ['first day'],
        'Where does your time go?': [],
        'What changed?': ['more day'],
        'When do you drift?': [],
        'Is lockdown working?': [],
        'Are you under your goal?': [],
    },
    'empty': {           # installed today, nothing browsed yet
        "How's today going?": ['first day'],
        'Where did today go?': ['nothing yet'],
        'How much are you online?': ['after your first full day'],
        'Where does your time go?': ['after your first full day'],
        'What changed?': ['more day'],
        'When do you drift?': ['nothing'],
        'Is lockdown working?': [],
        'Are you under your goal?': [],
    },
}

SETTINGS = {"enabled": True, "passes": 3, "passLen": 5, "passWait": 30, "idle": 3, "video": True, "hist": 90, "weekStart": "mon",
            "gateDelay": 10, "showAttempts": True, "goal": 240, "listen": True, "nudge": True, "bedS": 46, "bedE": 10,
            "nudgeAfter": 20, "nudgeScope": "all"}
SCHEDULE = [{"on": True, "blocks": [{"s": 18, "e": 34}]} for _ in range(5)] + [{"on": False, "blocks": [{"s": 12, "e": 20}]}, {"on": False, "blocks": []}]

def stamp(d, hr, mi):
    """Epoch ms for a local time (America/Detroit: UTC-4 until Nov 1, 2026, UTC-5 after)."""
    off = -5 if d >= date(2026, 11, 1) else -4
    return int(datetime(d.year, d.month, d.day, hr, mi, tzinfo=timezone(timedelta(hours=off))).timestamp() * 1000)

def day(rnd, d, scen, today):
    weekend = d.weekday() >= 5
    locked = not weekend
    change = CHANGES.get(scen, {}) if d >= CHANGE_FROM else {}
    o = {'s': {}, 'v': {}, 'h': [[0.0] * 5 for _ in range(24)], 'first': None, 'long': None, 'att': {}, 'attH': [0] * 24, 'pass': [], 'ls': {}}
    sites = dict(BASE)
    for k, (mins, wd, we) in change.items():
        b = sites.get(k, (0, wd, we, False))
        sites[k] = (mins, wd or b[1], we or b[2], b[3])
    # blocked tries on lockdown days: about 6 a day at first, falling to about 2 by the last week (the
    # lockdown is working), except in 'better', where they stay flat
    tries = []
    if locked:
        age = (END - d).days
        mean = 6 - 4 * (41 - age) / 41 if scen == 'habit' else 4
        n = max(0, round(rnd.gauss(mean, 1.2)))
        for _ in range(n):
            site = rnd.choices(['youtube.com', 'reddit.com', 'instagram.com'], [4, 3.5, 2.5])[0]
            hr = rnd.randrange(*LOCK)
            if today and hr * 60 >= NOW_H * 60 + NOW_M: continue
            tries.append((site, hr))
    passes = [t for t in tries if rnd.random() < .2][:3]
    for k, (mins, wd, we, weekdays_only) in sites.items():
        if weekend and weekdays_only: continue
        hours = list(we if weekend else wd)
        if locked and k in LISTED and LISTED[k] != 'music':
            for hr in range(*LOCK): hours[hr] = 0
        tot = sum(hours)
        if not tot: continue
        sec = max(0, rnd.gauss(mins, mins * .22)) * 60
        for hr in range(24):
            if not hours[hr]: continue
            part = sec * hours[hr] / tot
            if today:
                if hr > NOW_H: continue
                if hr == NOW_H: part *= NOW_M / 60
            o['h'][hr][CAT_IX[LISTED.get(k, 'other')]] += part
            o['s'][k] = o['s'].get(k, 0) + part
    for site, hr in tries:
        o['att'][site] = o['att'].get(site, 0) + 1
        o['attH'][hr] += 1
    for site, hr in passes:   # a pass is 5 minutes on the site it was used for
        mi = rnd.randrange(0, 50)
        o['pass'].append({'d': site, 'at': hr * 60 + mi})
        o['s'][site] = o['s'].get(site, 0) + 300
        o['h'][hr][CAT_IX[LISTED[site]]] += 300
    if not o['s']: return None
    for k in o['s']:
        o['s'][k] = round(o['s'][k], 1)
        o['v'][k] = max(1, round(o['s'][k] / 240 * rnd.uniform(.6, 1.4)))
    o['h'] = [[round(x, 1) for x in hr] for hr in o['h']]
    first = next(hr for hr in range(24) if sum(o['h'][hr]))
    o['first'] = first * 60 + rnd.randrange(0, 40)
    top = max(o['s'], key=o['s'].get)
    o['long'] = {'d': top, 'sec': int(min(o['s'][top] * .45, 2400)), 'at': 20 * 60 + 5}
    if 'music.youtube.com' in o['s']: o['ls']['music.youtube.com'] = round(o['s']['music.youtube.com'] * .9, 1)
    return o

def make(scen='habit'):
    rnd = random.Random('glassware-hourglass-' + scen)
    span = {'new': 2, 'empty': 1}.get(scen, 42)
    store, keys = {}, []
    for i in range(span - 1, -1, -1):
        d = END - timedelta(days=i)
        today = i == 0
        o = None if scen == 'empty' else day(rnd, d, scen, today)
        keys.append(d.isoformat())
        if o: store['day:' + d.isoformat()] = o
    store['days'] = keys
    store['schedule'] = SCHEDULE
    store['settings'] = SETTINGS
    store['music'] = True
    if scen == 'habit': store['ignored'] = [{'d': 'github.com', 'avg': 2050}]   # work: the demo ignores its suggestion
    # late-night minutes (after 11 PM, until 5 AM) per night, every site and just your list
    nights = {}
    for k in keys:
        o, nxt = store.get('day:' + k), store.get('day:' + (date.fromisoformat(k) + timedelta(days=1)).isoformat())
        hrs = ([o['h'][23]] if o else []) + ([nxt['h'][hr] for hr in range(5)] if nxt else [])
        a = sum(sum(hr) for hr in hrs)
        if a: nights[k] = {'all': round(a), 'list': round(sum(sum(hr[:4]) for hr in hrs))}
    store['nights'] = nights
    today = store.get('day:' + END.isoformat())
    if today and today['pass']:   # passes used today (they reset every day)
        store['passes'] = {'day': END.isoformat(), 'used': [{'d': p['d'], 'at': stamp(END, p['at'] // 60, p['at'] % 60)} for p in today['pass']], 'open': {}}
    return store

if __name__ == '__main__':
    with open(os.path.join(HERE, 'hourglass.json'), 'w') as f: json.dump(make('habit'), f, separators=(',', ':'))
    print('wrote tools/seeds/hourglass.json')
