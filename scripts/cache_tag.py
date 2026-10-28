#!/usr/bin/env python3
"""Fill in `cache-tag` placeholders with content hashes.

Sources reference each other as `./model.js?cache-tag=1`. This module replaces the
`1` with a hash of the file being pointed at, so a URL changes exactly when its own
content changes: no stale modules, and no refetching the files that did not change.

The tag is a content hash rather than a counter or a clock because two files
importing the same third must produce the *same* URL — two URLs would mean two
module instances, and two copies of the application's state.

Two callers use this:

* `scripts/nocache-server.py` rewrites responses on the way out, so a local edit is
  picked up by the next reload without touching the files on disk.
* `python3 scripts/cache_tag.py _site` rewrites files in place, which is what the
  deploy job does: a static host has no way to rewrite anything, so the tags have
  to be baked in before upload.

Rewriting in place changes a file, which changes its own hash, which changes the
tag its parents must carry. So `finalize()` walks the import graph depth-first from
the leaves up: a file's imports are rewritten, *then* its hash is taken, and only
that value is handed to its parents. `rewrite()` on its own — the serve-time path —
does not need the ordering, because nothing on disk changes.
"""

import hashlib
import os
import re
import sys

IMPORT = re.compile(r"((?:from|import)\s+'\./)([\w.-]+\.js)(\?cache-tag=)[^']*'")
LINK = re.compile(r'((?:src|href)=")([\w./-]+\.(?:js|css))(\?cache-tag=)[^"]*"')

TAGGED = ('.html', '.js')


def digest_text(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]


def digest(path):
    try:
        with open(path, encoding='utf-8') as handle:
            return digest_text(handle.read())
    except OSError:
        return 'missing'


def rewrite(text, here, tag_for=None):
    """Replace every cache tag in `text`, using hashes resolved relative to `here`.

    `tag_for` takes a path and returns its tag; the default hashes the file as it
    currently sits on disk, which is what the dev server wants.
    """
    tag_for = tag_for or digest

    def js(match):
        return f"{match.group(1)}{match.group(2)}{match.group(3)}{tag_for(os.path.join(here, match.group(2)))}'"

    def link(match):
        return f'{match.group(1)}{match.group(2)}{match.group(3)}{tag_for(os.path.join(here, match.group(2)))}"'

    return LINK.sub(link, IMPORT.sub(js, text))


def _tagged_files(root):
    for folder, _dirs, files in os.walk(root):
        for name in files:
            if name.endswith(TAGGED):
                yield os.path.join(folder, name)


def finalize(root):
    """Rewrite every tagged file under `root` in place, leaves first."""
    memo = {}
    visiting = set()

    def visit(path):
        path = os.path.abspath(path)
        if path in memo:
            return memo[path]
        if path in visiting:
            # A cycle cannot be tagged consistently; leave it alone rather than
            # recursing forever.
            return digest(path)
        visiting.add(path)
        try:
            with open(path, encoding='utf-8') as handle:
                text = handle.read()
            text = rewrite(text, os.path.dirname(path), visit)
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(text)
            memo[path] = digest_text(text)
        finally:
            visiting.discard(path)
        return memo[path]

    for path in _tagged_files(root):
        visit(path)
    return memo


def main(argv):
    target = argv[1] if len(argv) > 1 else '.'
    if not os.path.isdir(target):
        print(f'cache_tag: {target} is not a directory', file=sys.stderr)
        return 2
    tags = finalize(target)
    print(f'cache_tag: wrote tags for {len(tags)} files under {target}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
