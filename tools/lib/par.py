"""Run independent test cases side by side (tools/check.py's tests; issue #4).

    from par import pmap
    results = pmap(fn, items)          # same order as items, like map()

Each case is its own browser run and spends most of its time waiting (page loads, timeouts), so a few
at once finish in a fraction of the time. GLASSWARE_JOBS sets how many (default: three per CPU, 4 to 8);
GLASSWARE_JOBS=1 runs them one after another, as before. The performance test never uses this: it
measures time, so it runs alone.
"""
import os
from concurrent.futures import ThreadPoolExecutor

JOBS = int(os.environ.get('GLASSWARE_JOBS') or max(4, min(8, (os.cpu_count() or 2) * 3)))

def pmap(fn, items, jobs=None):
    items = list(items); n = max(1, min(jobs or JOBS, len(items) or 1))
    if n == 1: return [fn(x) for x in items]
    with ThreadPoolExecutor(n) as ex: return list(ex.map(fn, items))

def ptry(calls, jobs=None):
    """Run zero-argument calls side by side; each result in order, a RuntimeError returned in its place
    (so a loop can report 'could not run' for that case and go on, as it did one at a time)."""
    def one(f):
        try: return f()
        except RuntimeError as e: return e
    return pmap(one, calls, jobs)
