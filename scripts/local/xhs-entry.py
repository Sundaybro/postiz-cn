"""Run the installed CLI with this project's credential directory only."""
from pathlib import Path
from contextlib import redirect_stdout
import sys
import xhs_cli.cookies as cookies

directory = Path(__file__).resolve().parents[2] / '.local/data/xiaohongshu'
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
cookies.get_config_dir = lambda: directory
# Account access never silently imports another app's browser credentials.
cookies.extract_browser_cookies = lambda *args, **kwargs: None
if '--json' in sys.argv or '--yaml' in sys.argv:
    import xhs_cli.qr_login as qr_login
    original_qr_login = qr_login.qrcode_login

    def structured_qr_login(*args, **kwargs):
        # QR progress uses print(), while the command's final envelope is
        # emitted after this function returns. Keep those channels separate.
        with redirect_stdout(sys.stderr):
            return original_qr_login(*args, **kwargs)

    qr_login.qrcode_login = structured_qr_login
from xhs_cli.cli import cli
cli()
