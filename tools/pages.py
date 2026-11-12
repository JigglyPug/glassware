"""Rebuild every README, banner and site page from tools/build/readmes.py + tools/features.py.

    python3 tools/pages.py

Version numbers are read from each script's @version, so run this after any bump.
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
env = {k: v for k, v in os.environ.items() if k != 'ONLY'}
for step in ['banners.py', 'readmes.py', 'site.py', 'og.py']:
    subprocess.run([sys.executable, os.path.join(HERE, 'build', step)] + (['JigglyPug'] if step == 'readmes.py' else []), check=True, cwd=HERE, env=env)
print('pages rebuilt')
