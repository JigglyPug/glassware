"""Made-up Molten for Discord activity: the demo seed for the screenshots, and the scenarios tools/tests/dash.py checks.

    python3 tools/seeds/discord.py        # rewrite the activity in tools/seeds/molten-for-discord.json (the demo: 'habit')

Every history ends on Tuesday 2026-11-03 at 8:40 PM, the screenshot clock. The servers, channels and
people are made up (the same ones as the demo favorites). make(name) returns the activity part of the
GM store for a scenario; PLANTED says what each scenario's Activity tab has to say, card by card.
The rest of molten-for-discord.json (favorites, saved messages, reminders) is kept as it is.
"""
import json, os, random
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
END = date(2026, 11, 3)
NOW_H, NOW_M = 20, 40

def w(*spans):
    """Hour weights from (start, end, weight) spans."""
    a = [0.0] * 24
    for s, e, x in spans:
        for hr in range(s, e): a[hr] += x
    return a

# place key: (minutes a day, weekday hours, weekend hours, messages an hour)
LOUNGE, RECIPE, PUGS, RAID, STUDY = '101010101010101010', '202020202020202020', '303030303030303030', '404040404040404040', '606060606060606060'
BASE = {
    f'{LOUNGE}/111111111111111111': (55, w((12, 13, 1), (18, 23, 3)), w((11, 23, 2)), 14),
    f'{LOUNGE}/333333333333333333': (10, w((19, 22, 1)), w((13, 18, 1)), 4),
    f'{RECIPE}/222222222222222222': (20, w((12, 13, 2), (17, 19, 2)), w((10, 13, 1), (16, 19, 1)), 6),
    f'{PUGS}/444444444444444444': (15, w((7, 9, 1), (21, 23, 1)), w((9, 12, 1)), 3),
    '@me/555555555555555555': (25, w((8, 9, 1), (19, 23, 2)), w((11, 23, 1)), 30),
    f'{STUDY}/616161616161616161': (30, w((14, 17, 2)), w(), 5),
    '@me/777777777777777777': (8, w((21, 23, 1)), w((15, 21, 1)), 24),
    'home': (6, w((8, 9, 1), (18, 22, 1)), w((10, 22, 1)), 0),
}
NAMES = {
    f'{LOUNGE}/111111111111111111': ('general', 'Lava Lounge', 'channel'),
    f'{LOUNGE}/333333333333333333': ('Chores', 'Lava Lounge', 'thread'),
    f'{RECIPE}/222222222222222222': ('weeknight-dinners', 'Recipe Club', 'channel'),
    f'{PUGS}/444444444444444444': ('pug-pics', 'Pug Pals', 'channel'),
    '@me/555555555555555555': ('Sam', 'Direct messages', 'dm'),
    f'{STUDY}/616161616161616161': ('focus-room', 'Study Hall', 'channel'),
    '@me/777777777777777777': ('Alex', 'Direct messages', 'dm'),
    f'{RAID}/414141414141414141': ('raid-night', 'Pixel Raiders', 'channel'),
    f'{RAID}/424242424242424242': ('Raid voice', 'Pixel Raiders', 'voice'),
}

# what changes in the last week of each scenario (from Tuesday 2026-10-27 on, today included)
CHANGES = {
    'habit': {   # a new raiding server takes over the late evenings, and you talk a lot more there
        f'{RAID}/414141414141414141': (80, w((17, 20, 2), (20, 24, 3)), w((20, 24, 2)), 40),
        f'{RAID}/424242424242424242': (45, w((22, 24, 1)), w((21, 24, 1)), 0),
        f'{STUDY}/616161616161616161': (12, None, None, None),
    },
    'better': {  # a quieter stretch: much less Lava Lounge and fewer late nights
        f'{LOUNGE}/111111111111111111': (15, w((18, 20, 1)), w((12, 18, 1)), 6),
        '@me/555555555555555555': (12, None, None, 12),
        '@me/777777777777777777': (2, None, None, None),
    },
}
CHANGE_FROM = date(2026, 10, 27)
DAYS = {'habit': 42, 'better': 42, 'new': 3, 'empty': 0}

PLANTED = {
    # card question: words its sentence must include (case-insensitive), for each scenario; a
    # {'week': [...], 'month': [...]} entry when the change only stands out in one range
    'habit': {
        "How's today going?": ['above', 'Tuesday'],
        'Where does your time go?': {'week': ['Pixel Raiders'], 'month': ['Lava Lounge']},
        'How much are you on Discord?': ['more than before'],
        'How much do you talk?': ['up from'],
        'What changed?': ['Pixel Raiders', 'new'],
        'When are you on?': {'week': ['later'], 'month': []},
        'How often are you on?': ['run'],
        'What are your records?': ['longest session'],
    },
    'better': {
        "How's today going?": ['below', 'Tuesday'],
        'Where does your time go?': [],
        'How much are you on Discord?': ['less than before'],
        'How much do you talk?': ['down from'],
        'What changed?': {'week': ['Lava Lounge', 'dropped'], 'month': ['dropped']},
        'When are you on?': [],
        'How often are you on?': ['run'],
        'What are your records?': ['longest session'],
    },
    'new': {
        "How's today going?": ['usual'],
        'Where does your time go?': ['Lava Lounge'],
        'How much are you on Discord?': ['a day'],
        'How much do you talk?': ['messages a day'],
        'What changed?': ['more days'],
        'When are you on?': ['busiest hours'],
        'How often are you on?': ['3 of the last 3'],
        'What are your records?': ['longest session'],
    },
    'empty': {
        "How's today going?": ['first day'],
        'Where does your time go?': ['nothing'],
        'How much are you on Discord?': ['after your first full day'],
        'How much do you talk?': ['after your first full day'],
        'What changed?': ['more days'],
        'When are you on?': ['nothing'],
        'How often are you on?': ['nothing'],
        'What are your records?': ['after your first full day'],
    },
}

def day(rnd, d, scen, today):
    weekend = d.weekday() >= 5
    change = CHANGES.get(scen, {}) if d >= CHANGE_FROM else {}
    places = dict(BASE)
    for k, (mins, wd, we, mph) in change.items():
        b = places.get(k, (0, wd, we, mph))
        places[k] = (mins, wd if wd is not None else b[1], we if we is not None else b[2], mph if mph is not None else b[3])
    o = {'t': {}, 'm': {}, 'h': [0.0] * 24, 'ss': 0, 'long': 0, 'first': None}
    stop = NOW_H + NOW_M / 60 if today else 24
    for k, (mins, wd, we, mph) in places.items():
        hrs = we if weekend else wd
        tot = sum(hrs[:int(stop)]) + (hrs[int(stop)] * (stop % 1) if stop < 24 else 0)
        if not tot or not mins: continue
        sec = mins * 60 * rnd.uniform(.8, 1.2) * (tot / sum(hrs))
        o['t'][k] = round(sec, 1)
        n = round(sec / 3600 * mph * rnd.uniform(.8, 1.2))
        if n: o['m'][k] = n
        for hr in range(24):
            if hr < stop and hrs[hr]: o['h'][hr] += sec * hrs[hr] / tot * (min(1, stop - hr))
    o['h'] = [round(min(3600, v), 1) for v in o['h']]
    busy = [i for i, v in enumerate(o['h']) if v > 0]
    if busy:
        o['first'] = busy[0] * 60 + rnd.randrange(0, 50)
        o['ss'] = max(1, len([i for i in busy if i == busy[0] or o['h'][i - 1] == 0]) + rnd.randrange(0, 2))
        run, best = 0, 0
        for v in o['h']:
            run = run + v if v > 0 else 0; best = max(best, run)
        o['long'] = round(best * rnd.uniform(.7, .95))
    return o

def make(scen='habit'):
    rnd = random.Random(7)
    store, days = {}, []
    n = DAYS[scen]
    for i in range(n - 1, -1, -1):
        d = END - timedelta(days=i)
        if scen != 'new' and i not in (0,) and rnd.random() < .06: continue   # a day off now and then
        o = day(rnd, d, scen, i == 0)
        k = d.isoformat(); store['act:' + k] = o; days.append(k)
    if days:
        store['actDays'] = days
        at = 1793000000000
        store['actPlaces'] = {k: {'n': n_, 's': s, 'k': kind, 'i': '', 'at': at + j} for j, (k, (n_, s, kind)) in enumerate(NAMES.items())}
    return store

if __name__ == '__main__':
    path = os.path.join(HERE, 'molten-for-discord.json')
    base = json.load(open(path))
    base = {k: v for k, v in base.items() if not (k.startswith('act:') or k in ('actDays', 'actPlaces', 'actSession'))}
    base.update(make('habit'))
    with open(path, 'w') as f: json.dump(base, f, indent=1, ensure_ascii=False)
    print('wrote', path, len(base['actDays']), 'days')
