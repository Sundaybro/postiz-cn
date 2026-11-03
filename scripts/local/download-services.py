"""Install integrity-checked native dependencies under this checkout only."""
import base64
import hashlib
import json
from pathlib import Path
import platform
import os
import subprocess
import tarfile
import urllib.request

root = Path(__file__).resolve().parents[2]
local = root / '.local'
if (platform.system(), platform.machine()) != ('Darwin', 'arm64'):
    raise SystemExit('Native service bootstrap currently supports macOS Apple Silicon only.')
manifest = json.loads((root / 'scripts/local/services.json').read_text())

def hydrate_postgres(destination):
    package = destination / 'package'
    for link in json.loads((package / 'native/pg-symlinks.json').read_text()):
        source = package / link['source']
        target = package / link['target']
        if not source.resolve().is_relative_to(package.resolve()) or not target.resolve().is_relative_to(package.resolve()):
            raise RuntimeError('Invalid PostgreSQL library link')
        if not target.exists():
            target.symlink_to(os.path.relpath(source, target.parent))

for name, entry in manifest.items():
    destination = local / 'runtime' / entry['directory']
    stamp = destination / '.installed-version'
    if stamp.exists() and stamp.read_text().strip() == entry['version']:
        if name == 'postgres':
            hydrate_postgres(destination)
        print(name + ': already installed', flush=True)
        continue
    archive = local / 'downloads' / entry['archive']
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        request = urllib.request.Request(entry['url'], headers={'User-Agent': 'postiz-cn-native-bootstrap'})
        temporary = archive.with_suffix('.part')
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
            while chunk := response.read(1024*1024):
                output.write(chunk)
        temporary.replace(archive)
    digest = hashlib.sha512() if 'integrity' in entry else hashlib.sha256()
    with archive.open('rb') as source:
        while chunk := source.read(1024*1024):
            digest.update(chunk)
    expected = entry.get('sha256')
    actual = digest.hexdigest()
    if 'integrity' in entry:
        expected = entry['integrity'].split('-',1)[1]
        actual = base64.b64encode(digest.digest()).decode()
    if actual != expected:
        raise SystemExit(name + ': checksum mismatch; refusing to extract')
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as source:
        source.extractall(destination, filter='data')
    if name == 'redis':
        source_dir = destination / ('redis-' + entry['version'])
        subprocess.run(['make','-j1','MALLOC=libc','BUILD_TLS=no'],cwd=source_dir,check=True)
    if name == 'postgres':
        hydrate_postgres(destination)
    stamp.write_text(entry['version'] + '\n')
    print(name + ': installed and verified', flush=True)
