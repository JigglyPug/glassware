"""Ship the current commit to main: the only way changes reach it.

    python3 tools/push.py

main takes only commits whose checks have already passed somewhere else (the ruleset on main), so
this checks the rules here first (seconds), pushes HEAD to the holding branch `ready`, and then runs
two checks side by side: GitHub's "checks" run on that exact commit, and here the tests GitHub doesn't
run (`tools/check.py --local`: the glitch check, the performance test, Kaleidoscope's screenshots).
main moves to the commit only once both pass. It fails closed: a failed or missing run, a timeout, a
failed local test, or main having moved on (pull and rebase, push again) means main stays where it was.
"""
import json, os, subprocess, sys, tempfile, time
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO, HOLD, CHECK, WAIT = 'JigglyPug/glassware', 'ready', 'checks', 80 * 60
CHECKPY = os.path.join(R, 'tools', 'check.py')

def sh(*a, ok=True):
    r = subprocess.run(list(a), cwd=R, capture_output=True, text=True)
    if ok and r.returncode: sys.exit(f'push: {" ".join(a[:3])} failed: {(r.stderr or r.stdout).strip()[-300:]}')
    return r

def problems(out):   # the lines worth reading from a check.py run: what failed, and how long it took
    return '\n'.join(l for l in out.splitlines() if l.startswith(('  ✗', 'took ', '✗')))

if sh('git', 'status', '--porcelain', '--untracked-files=no').stdout.strip(): sys.exit('push: commit or stash your changes first')
sha = sh('git', 'rev-parse', 'HEAD').stdout.strip()
sh('git', 'fetch', '-q', 'origin', 'main')
if sh('git', 'merge-base', '--is-ancestor', 'origin/main', sha, ok=False).returncode:
    sys.exit('push: main has moved on; pull --rebase and push again')
if sh('git', 'rev-parse', 'origin/main').stdout.strip() == sha: print('push: main is already at ' + sha[:7]); sys.exit(0)

# the rules first: they take seconds, so a slip shows up before anything goes to GitHub
r = subprocess.run([sys.executable, CHECKPY, '--quick'], cwd=R, capture_output=True, text=True)
if r.returncode: sys.exit('push: the rules failed, nothing was pushed\n' + (problems(r.stdout) or r.stdout[-1500:]))
print('push: the rules pass')

# the holding branch only moves forward, like main (no force pushes anywhere)
r = sh('git', 'push', '-q', 'origin', f'{sha}:refs/heads/{HOLD}', ok=False)
if r.returncode: sys.exit(f"push: {HOLD} has a commit this doesn't build on (a change that never reached main?); "
                         f'look at it, then build on it or merge it: {r.stderr.strip()[-200:]}')
print(f'push: {sha[:7]} is on {HOLD}; GitHub runs its checks while the local-only tests run here')

log = tempfile.NamedTemporaryFile('w+', suffix='.log', delete=False, encoding='utf-8')
local = subprocess.Popen([sys.executable, CHECKPY, '--local'], cwd=R, stdout=log, stderr=subprocess.STDOUT, text=True)
def local_result():
    local.wait(); log.seek(0); return local.returncode, log.read()
def stop(msg):
    if local.poll() is None: local.terminate()
    sys.exit(msg)

end = time.time() + WAIT
github = None
while github is None:
    if local.poll() not in (None, 0):   # a local failure ends it at once; no need to wait for GitHub
        code, out = local_result()
        stop(f'push: the local-only tests failed; main stays put\n' + (problems(out) or out[-1500:]))
    r = sh('gh', 'api', f'repos/{REPO}/commits/{sha}/check-runs?check_name={CHECK}', ok=False)
    try: runs = json.loads(r.stdout).get('check_runs', [])
    except ValueError: runs = []
    done = [x for x in runs if x.get('status') == 'completed']
    if done:
        c = done[0]
        if c.get('conclusion') != 'success': stop(f"push: the {CHECK} run ended {c.get('conclusion')}: {c.get('html_url')}; main stays put")
        github = c
        break
    if time.time() > end: stop(f'push: no finished {CHECK} run after {WAIT // 60} minutes; main stays put')
    time.sleep(20)
print(f'push: GitHub\'s {CHECK} run passed' + ('; waiting for the local-only tests' if local.poll() is None else ''))

code, out = local_result()
if code: sys.exit('push: the local-only tests failed; main stays put\n' + (problems(out) or out[-1500:]))
print('push: the local-only tests pass' + (f' ({problems(out)})' if problems(out) else ''))
os.unlink(log.name)

r = sh('git', 'push', '-q', 'origin', f'{sha}:refs/heads/main', ok=False)
if r.returncode: sys.exit(f'push: main refused {sha[:7]}: {r.stderr.strip()[-300:]}')
print(f'push: main is at {sha[:7]}')
