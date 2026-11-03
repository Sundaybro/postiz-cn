# Connector source snapshots

Copied from clean local Git checkouts on 2026-10-28; no account data or browser profile was copied.

| Directory | Source | Commit | License |
| --- | --- | --- | --- |
| xiaohongshu-cli | https://github.com/Sundaybro/xiaohongshu-cli (local enhanced fork of jackwener/xiaohongshu-cli) | 61a83fd5017f1eeb4a6511d3f1c5e232c7c0a4c2 | Apache-2.0 |
| fanqie-autopub-mcp | https://github.com/yangmi829/fanqie-autopub-mcp (local checkout) | e195a8866e5515718651676afc5b3c2a87d4acb2 | MIT |

These commits identify the local source snapshots; this does not claim that a locally enhanced commit has been pushed to the named remote. Sources are provided here so installing this project does not depend on another local checkout. Generated dist files are not tracked; setup builds the connector from the included source.

Each directory keeps its own LICENSE. No upstream copyright notice was removed. The Postiz bridge and local wrapper live outside these snapshots. The wrapper directs Xiaohongshu credentials into project-local data and disables automatic browser-cookie extraction.

Trailing whitespace and redundant final blank lines in imported Python sources were normalized; no functional connector change was made.

The local xiaohongshu-cli checkout declares Apache-2.0 in pyproject.toml but contained no LICENSE file. This distribution adds the unmodified standard Apache-2.0 text from https://www.apache.org/licenses/LICENSE-2.0.txt.
