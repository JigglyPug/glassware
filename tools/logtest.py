"""Check that console logging never prints account or channel names, handles, emails or ids.

    python3 tools/logtest.py [script]       # Molten Tools, or the copy given (to compare an older one)

People share console captures, so a script's log lines must not name their accounts even with
logging on (CLAUDE.md, Security). This turns on every logging switch in Molten Tools (account
switching, lava and the rest), saves a made-up default account, and walks the paths that handle
account names, on stand-in YouTube and YouTube Music pages that show made-up accounts:
- YouTube Music: switching to the saved account when it isn't in the account list, and when the
  account menu never opens
- YouTube: the account picker with the saved account missing (it must give up once, not send you
  back and forth), and with it there
- Screenshot safe learning the names from YouTube's account list
It passes when no console line contains any of the made-up names, handles, emails or ids (first
names included). Prints "clean" for each path, or the lines that gave something away.
"""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
JS = f'{R}/desktop/molten-tools/molten-tools.user.js'

MINE = {'name': 'Quillon Vantablack', 'handle': '@quillonvanta', 'email': 'quillon.vanta@example.com', 'id': 'UCquillonSentinel000001'}
OTHER = {'name': 'Marrowind Tessaly', 'handle': '@marrowindt', 'email': 'marrowind.t@example.com', 'id': 'UCmarrowindSentinel0002'}
# anything that would identify either account, first names and bare handles too
SECRETS = [v for a in (MINE, OTHER) for v in a.values()] + ['Quillon', 'Vantablack', 'Marrowind', 'Tessaly', 'quillonvanta', 'marrowindt']

GM = {'acctDebug': True, 'lava': {'shared': {'debug': True}},
      'privacy': {'on': True, 'found': [MINE['name'], MINE['handle']], 'extra': MINE['email']}}
LS = {'acctSwitch.config': json.dumps({'enabled': True, 'name': MINE['name'], 'id': MINE['id']})}

def account(a, tag='ytd-account-item-renderer'):
    return (f'<{tag}><a href="/signin?pageid={a["id"]}"><div id="channel-title">{a["name"]}</div>'
            f'<span>{a["handle"]}</span><span>12 subscribers</span></a></{tag}>')

# The stand-in page: signed in as the other channel, with an account menu and list built from the cases.
INIT = r'''(() => {
  const C = %(case)s;
  window.ytcfg = { get: k => ({ INNERTUBE_API_KEY: 'k', DELEGATED_SESSION_ID: C.current })[k] };
  // YouTube's account list (Screenshot safe reads it), with both accounts
  const _f = window.fetch;
  window.fetch = function (u, o) {
    if (String(u).includes('getAccountSwitcherEndpoint')) return Promise.resolve(new Response(")]}'\n" + JSON.stringify(C.list)));
    return _f.apply(this, arguments);
  };
  if (C.pending && !sessionStorage.getItem('lt.once')) { sessionStorage.setItem('lt.once', '1'); sessionStorage.setItem('acctSwitch.pending', '1'); sessionStorage.setItem('acctSwitch.next', '/'); }
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', C.page);
    document.addEventListener('click', e => {
      const t = (e.target.closest('button,tp-yt-paper-item,ytmusic-settings-button') || e.target).textContent.trim().toLowerCase();
      if (C.menu && e.target.closest('ytmusic-settings-button') && !document.getElementById('lt-menu'))
        document.body.insertAdjacentHTML('beforeend', '<div id="lt-menu">' + C.menu + '</div>');
      if (t === 'switch account' && !document.getElementById('lt-list'))
        document.body.insertAdjacentHTML('beforeend', '<div id="lt-list">' + C.picker + '</div>');
    }, true);
  });
})();'''

def acct_list():
    run = lambda t: {'simpleText': t}
    return {'data': {'actions': [{'getMultiPageMenuAction': {'menu': {'sections': [
        {'accountItem': {'accountName': run(a['name']), 'channelHandle': run(a['handle']), 'accountByline': run(a['email'])}} for a in (MINE, OTHER)]}}}]},
        'header': {'googleAccountHeaderRenderer': {'name': run(MINE['name']), 'email': run(MINE['email'])}}}

HEADER = f'<ytmusic-active-account-header-renderer>{MINE["name"]} {MINE["handle"]}</ytmusic-active-account-header-renderer>'
MENU = HEADER + '<tp-yt-paper-item>Switch account</tp-yt-paper-item><tp-yt-paper-item>Sign out</tp-yt-paper-item>'
CASES = {
    # the saved account isn't in YT Music's list: the switch gives up and says why
    'music: saved account missing': ('https://music.youtube.com/', 16000, 'not in the list', {
        'page': '<ytmusic-settings-button><button id="button">Account</button></ytmusic-settings-button>',
        'menu': MENU, 'picker': account(OTHER)}),
    # the account menu never opens: the switch gives up and lists what it saw
    'music: menu never opens': ('https://music.youtube.com/', 16000, 'never opened', {
        'page': '<ytmusic-settings-button><button id="button">Account</button></ytmusic-settings-button>' + HEADER, 'menu': '', 'picker': ''}),
    # YouTube's account picker without the saved account: it gives up, goes back and leaves it there
    # (no new attempt from the page it went back to, or the two would send each other back and forth)
    'picker: saved account missing': ('https://www.youtube.com/channel_switcher', 24000, 'Could not find', {
        'page': account(OTHER) + HEADER, 'pending': True}),
    # and with it
    'picker: saved account there': ('https://www.youtube.com/channel_switcher', 6000, 'Clicking the saved default', {
        'page': account(OTHER) + account(MINE) + HEADER, 'pending': True}),
    # Screenshot safe learns the names from the account list
    'screenshot safe: names learned': ('https://www.youtube.com/', 6000, 'names found', {
        'page': HEADER, 'current': MINE['id']}),
}

def run_case(url, wait, case):
    case = dict({'current': OTHER['id'], 'list': acct_list(), 'menu': '', 'picker': '', 'pending': False}, **case)
    tmp = tempfile.mkdtemp()
    files = {}
    for k, v in (('init', INIT % {'case': json.dumps(case)}), ('gm', json.dumps(GM)), ('ls', json.dumps(LS))):
        files[k] = os.path.join(tmp, k); open(files[k], 'w').write(v)
    # the wait is the harness's, not the page's, so it carries on through the script's own page changes
    r = subprocess.run(['node', f'{HERE}/shot.js', JS, url, '/dev/null', '--cmd', 'none', '--console', '--init', files['init'],
                        '--seed', files['gm'], '--seedls', files['ls'], '--wait', str(wait), '--eval', 'location.href', '--print'],
                       capture_output=True, text=True, timeout=180)
    lines = [json.loads(l.split(' ', 2)[2]) for l in r.stdout.splitlines() if l.startswith('CONSOLE ')]
    return lines, r

def run():
    out = {}
    from par import pmap
    ran = dict(zip(CASES, pmap(lambda c: run_case(c[0], c[1], c[3]), CASES.values())))
    for name, (url, wait, sign, case) in CASES.items():
        lines, r = ran[name]
        leak = [l for l in lines if any(re.search(re.escape(s), l, re.I) for s in SECRETS)]
        out[name] = [f'a log line names an account: {l[:160]}' for l in leak]
        # the path really ran, with logging on: its own line is there (a test that logs nothing proves nothing)
        if name.startswith('picker: saved account missing') and any('Switching to the saved default account' in l for l in lines):
            out[name].append('after giving up it tried to switch again, so the page and the picker send each other back and forth')
        if not any(sign in l for l in lines):
            out[name].append(f'no "{sign}" line, so this path never ran or logging stayed off: '
                             + ((r.stderr or r.stdout).strip().splitlines() or ['no output'])[-1][:160])
    return out

if __name__ == '__main__':
    if len(sys.argv) > 1: JS = os.path.abspath(sys.argv[1])
    bad = False
    for name, probs in run().items():
        print(f'== {name}: ' + ('clean' if not probs else 'problems'))
        for p in probs: print('   ' + p); bad = True
    sys.exit(1 if bad else 0)
