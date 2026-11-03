"""Download a release archive and verify its published digest before extraction."""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request

kind, version, target, destination = sys.argv[1:]
destination = Path(destination)
destination.parent.mkdir(parents=True, exist_ok=True)

def read(url):
    return urllib.request.urlopen(url, timeout=90).read()

if kind == 'node':
    name = f'node-v{version}-{target}.tar.gz'
    mirror = os.environ.get('LOCAL_NODE_MIRROR', 'https://nodejs.org/dist').rstrip('/')
    if mirror not in ('https://nodejs.org/dist', 'https://repo.huaweicloud.com/nodejs'):
        raise RuntimeError('Unsupported Node mirror')
    base = f'{mirror}/v{version}/'
    # Retrieved from the Node project's release manifest, independently checked
    # against Huawei Cloud before enabling this mirror.
    pinned = {('22.23.4', 'darwin-arm64'): 'c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428'}
    expected = pinned.get((version, target))
    if expected is None:
        lines = read(f'https://nodejs.org/dist/v{version}/SHASUMS256.txt').decode().splitlines()
        expected = next(line.split()[0] for line in lines if line.split()[-1] == name)
    content = read(base + name)
    if hashlib.sha256(content).hexdigest() != expected:
        raise RuntimeError('Node SHA256 mismatch')
elif kind == 'pnpm':
    registry = os.environ.get('LOCAL_NPM_REGISTRY', 'https://registry.npmjs.org').rstrip('/')
    if registry not in ('https://registry.npmjs.org', 'https://registry.npmmirror.com'):
        raise RuntimeError('Unsupported npm registry')
    metadata = json.loads(read(f'{registry}/pnpm/{version}'))
    url = metadata['dist']['tarball']
    if not any(url.startswith(prefix) for prefix in ('https://registry.npmjs.org/pnpm/-/', 'https://registry.npmmirror.com/pnpm/-/', 'https://registry.npmmirror.com/pnpm/')):
        raise RuntimeError('Unexpected pnpm download URL')
    content = read(url)
    algorithm, expected = metadata['dist']['integrity'].split('-', 1)
    if algorithm != 'sha512' or base64.b64encode(hashlib.sha512(content).digest()).decode() != expected:
        raise RuntimeError('pnpm SHA512 mismatch')
else:
    raise RuntimeError('Unsupported release')
temporary = destination.with_suffix(destination.suffix + '.part')
temporary.write_bytes(content)
temporary.replace(destination)
print(f'{kind} {version}: verified {len(content)} bytes')
