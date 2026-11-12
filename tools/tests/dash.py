"""Check Hourglass's dashboard says something true and useful about each made-up history.

    python3 tools/tests/dash.py

Runs the dashboard on every scenario in tools/seeds/hourglass.py (a habit change, a good stretch,
a new install, no data), on desktop and on a phone, for both ranges (7 days and 4 weeks), and
prints one line per problem ("clean" otherwise):
- every card is [data-q] with its question as its label and its answer in .ans: at most two
  sentences, each under 16 words with at most one comma
- the answer names what that scenario planted (PLANTED in tools/seeds/hourglass.py, per range
  where a change only shows in one)
- cards that cover a period ([data-range]) say which one ("past 7 days", "past 4 weeks" or "28 days")
- no figure (a time, a percentage, a count) shows on two cards; axis labels ([data-axis]) aside
- every chart ([data-chart]) labels its bottom and its height ([data-axis=x] and [data-axis=y])
- no NaN, undefined, Infinity or null anywhere in the panel
"""
import json, os, re, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder
sys.path.insert(0, os.path.join(HERE, 'seeds')); sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
import hourglass as SEEDS
from screens import CLOCK

JS = f'{R}/desktop/hourglass/hourglass.user.js'
# read every card, in the 7-day range and then the 4-week one
READ = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  // every piece of text on its own (textContent would glue "today" and "NaN" into "todayNaN")
  const texts = root => { const out = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const v = tw.currentNode.nodeValue.trim(); if (v) out.push(v); } return out.join(' | '); };
  const read = () => {
    const P = __all().find(e => e.classList && e.classList.contains('panel'));
    const cards = __all().filter(e => e.dataset && e.dataset.q !== undefined).map(c => {
      const strip = c.cloneNode(true); strip.querySelectorAll('[data-axis]').forEach(x => x.remove());
      strip.querySelectorAll('[title]').forEach(x => x.removeAttribute('title'));
      return {
        q: c.dataset.q, ranged: c.hasAttribute('data-range'),
        label: (c.querySelector('.label') || {}).textContent || '',
        ans: (c.querySelector('.ans') || {}).textContent || '',
        text: texts(strip),
        charts: [...c.querySelectorAll('[data-chart]')].map(ch => ({ name: ch.dataset.chart,
          x: [...ch.querySelectorAll('[data-axis=x]')].map(e => e.textContent).join(' ').trim(),
          y: [...ch.querySelectorAll('[data-axis=y]')].map(e => e.textContent).join(' ').trim() })),
      };
    });
    return { cards, all: P ? texts(P) : '' };
  };
  const out = { week: read() };
  const b = __all().find(e => e.tagName === 'BUTTON' && e.closest && e.closest('.rangebar') && /4 weeks/.test(e.textContent));
  if (b) { b.click(); await w(400); out.month = read(); }
  return out;
})()"""

UNIT = r'(?:tries|try|times|passes|pass|days?|nights?|visits?|sites?)'
def figures(text):
    """The figures a card shows: times, percentages and counts. Clock times and dates aren't figures."""
    t = re.sub(r'\b\d{1,2}(:\d\d)?\s?(AM|PM)\b', ' ', text)
    t = re.sub(r'\b(past|first) \d+ (days|weeks|nights)\b', ' ', t)   # the period a card covers, not a figure
    t = re.sub(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2}\b', ' ', t)
    found = re.findall(r'(?<![\w:.])(\d+h \d+m|\d+h|\d+m|<1m|\d+%|\d+ of \d+|\d+ ' + UNIT + r')(?![\w])', t)
    return {f for f in found if not re.fullmatch(r'0(m|h|%| \D.*)', f)}   # zeros say nothing

def run(scen, mobile):
    store = SEEDS.make(scen)
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(store, seed); seed.close()
    args = ['node', f'{HERE}/lib/shot.js', JS, 'https://www.youtube.com/', '/dev/null', '--cmd', 'Open', '--clock', CLOCK,
            '--seed', seed.name, '--eval', READ, '--print'] + (['--mobile', '--vh', '2600'] if mobile else ['--vh', '3000'])
    r = subprocess.run(args, capture_output=True, text=True, timeout=300)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    where = f"{scen} on {'a phone' if mobile else 'desktop'}"
    if not line: return where, [f'could not run: {(r.stderr or r.stdout)[-300:]}']
    got = json.loads(line[5:]) or {}
    return where, problems(scen, got)

def problems(scen, got):
    bad = []
    want = SEEDS.PLANTED[scen]
    if 'month' not in got: bad.append('no "4 weeks" button in the range switch (.rangebar)')
    for rng, period in (('week', '7 days'), ('month', '4 weeks')):
        names = (period, '28 days') if rng == 'month' else (period,)
        view = got.get(rng)
        if not view: continue
        cards, tag = view['cards'], f'[{period}] '
        for word in ('NaN', 'undefined', 'Infinity', 'null'):
            if re.search(r'\b' + word + r'\b', view['all']): bad.append(f'{tag}the panel says "{word}"')
        qs = [c['q'] for c in cards]
        for q in want:
            if q not in qs: bad.append(f'{tag}no "{q}" card')
        for c in cards:
            q = c['q']
            if q not in want: bad.append(f'{tag}"{q}" has no entry in PLANTED (tools/seeds/hourglass.py)'); continue
            if c['label'].strip().lower() != q.lower(): bad.append(f'{tag}"{q}": its label reads "{c["label"].strip()}", not the question')
            a = c['ans'].strip()
            if not a: bad.append(f'{tag}"{q}" has no answer sentence (.ans)'); continue
            # plain and short: at most two sentences, each under 16 words with at most one comma
            sents = [x for x in re.split(r'(?<=[.!?])\s+(?=[A-Za-z0-9])', a) if x]
            if not re.search(r'[.!?]$', a): bad.append(f'{tag}"{q}": the answer should end like a sentence: "{a}"')
            if len(sents) > 2: bad.append(f'{tag}"{q}": the answer should be at most two sentences: "{a}"')
            for x in sents:
                if len(x.split()) > 15 or x.count(',') > 1: bad.append(f'{tag}"{q}": too long to follow (under 16 words, one comma at most): "{x}"')
            words = want[q][rng] if isinstance(want[q], dict) else want[q]
            for w_ in words:
                if w_.lower() not in a.lower(): bad.append(f'{tag}"{q}" should mention "{w_}": "{a}"')
            if c['ranged'] and not any(n in a for n in names) and 'more day' not in a and 'nothing' not in a.lower(): bad.append(f'{tag}"{q}" covers a range but doesn\'t say "{period}": "{a}"')
            for ch in c['charts']:
                if not ch['x'] or not ch['y']: bad.append(f'{tag}"{q}": chart "{ch["name"]}" needs labels along the bottom and for the height')
        seen = {}
        for c in cards:
            for f in figures(c['text']):
                if f in seen and seen[f] != c['q']: bad.append(f'{tag}{f} shows on "{seen[f]}" and "{c["q"]}"')
                seen.setdefault(f, c['q'])
    return bad

if __name__ == '__main__':
    jobs = [(s, m) for s in SEEDS.PLANTED for m in (False, True)]
    with ThreadPoolExecutor(4) as ex: res = list(ex.map(lambda j: run(*j), jobs))
    for where, bad in res:
        print(f'== {where}: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
        for b in bad: print('  ' + b)
