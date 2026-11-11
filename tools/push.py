"""Ship the current commit to main: the only way changes reach it.

    python3 tools/push.py

main takes only commits whose checks have already passed somewhere else (the ruleset on main), so
this pushes HEAD to the holding branch `ready`, waits for GitHub's "checks" run on that exact commit,
and moves main to it once the run passes. It fails closed: a failed or missing run, a timeout, or main
having moved on (pull and rebase, run tools/check.py, push again) means main stays where it was.
Run tools/check.py first; this doesn't replace it.
"""
import json, os, subprocess, sys, time
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO, HOLD, CHECK, WAIT = 'JigglyPug/glassware', 'ready', 'checks', 80 * 60

def sh(*a, ok=True):
    r = subprocess.run(list(a), cwd=R, capture_output=True, text=True)
    if ok and r.returncode: sys.exit(f'push: {" ".join(a[:3])} failed: {(r.stderr or r.stdout).strip()[-300:]}')
    return r

if sh('git', 'status', '--porcelain', '--untracked-files=no').stdout.strip(): sys.exit('push: commit or stash your changes first')
sha = sh('git', 'rev-parse', 'HEAD').stdout.strip()
sh('git', 'fetch', '-q', 'origin', 'main')
if sh('git', 'merge-base', '--is-ancestor', 'origin/main', sha, ok=False).returncode:
    sys.exit('push: main has moved on; pull --rebase, run tools/check.py and push again')
if sh('git', 'rev-parse', 'origin/main').stdout.strip() == sha: print('push: main is already at ' + sha[:7]); sys.exit(0)

# the holding branch only moves forward, like main (no force pushes anywhere)
r = sh('git', 'push', '-q', 'origin', f'{sha}:refs/heads/{HOLD}', ok=False)
if r.returncode: sys.exit(f"push: {HOLD} has a commit this doesn't build on (a change that never reached main?); "
                         f'look at it, then build on it or merge it: {r.stderr.strip()[-200:]}')
print(f'push: {sha[:7]} is on {HOLD}; waiting for the {CHECK} run')

end = time.time() + WAIT
while True:
    r = sh('gh', 'api', f'repos/{REPO}/commits/{sha}/check-runs?check_name={CHECK}', ok=False)
    try: runs = json.loads(r.stdout).get('check_runs', [])
    except ValueError: runs = []
    done = [x for x in runs if x.get('status') == 'completed']
    if done:
        c = done[0]
        if c.get('conclusion') != 'success': sys.exit(f"push: the {CHECK} run ended {c.get('conclusion')}: {c.get('html_url')}; main stays put")
        break
    if time.time() > end: sys.exit(f'push: no finished {CHECK} run after {WAIT // 60} minutes; main stays put')
    time.sleep(20)

r = sh('git', 'push', '-q', 'origin', f'{sha}:refs/heads/main', ok=False)
if r.returncode: sys.exit(f'push: main refused {sha[:7]}: {r.stderr.strip()[-300:]}')
print(f'push: main is at {sha[:7]}')
