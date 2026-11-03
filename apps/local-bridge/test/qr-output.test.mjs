import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
// Exercise the real entry wrapper with a fake QR backend: no packages, browser,
// credentials or network are needed, and the final envelope must remain strict.
test('真实 CLI 入口把扫码进度写入 stderr，成功信封保持独立 JSON',()=>{
 const code=`import sys, types, runpy, json
package=types.ModuleType('xhs_cli'); package.__path__=[]
cookies=types.ModuleType('xhs_cli.cookies')
qr=types.ModuleType('xhs_cli.qr_login')
def login(**kwargs):
 print('Starting QR login...')
 print('QR IMAGE BLOCKS')
 return {'authenticated':True,'user':{'id':'test-user'}}
qr.qrcode_login=login
cli=types.ModuleType('xhs_cli.cli')
def run():
 print(json.dumps({'ok':True,'data':qr.qrcode_login()}))
cli.cli=run
sys.modules.update({'xhs_cli':package,'xhs_cli.cookies':cookies,'xhs_cli.qr_login':qr,'xhs_cli.cli':cli})
sys.argv=['scripts/local/xhs-entry.py','login','--qrcode','--json']
runpy.run_path('scripts/local/xhs-entry.py',run_name='__main__')
`;
 const out=execFileSync(process.env.LOCAL_TEST_PYTHON||'python3',['-c',code],{encoding:'utf8'});
 assert.deepEqual(JSON.parse(out),{ok:true,data:{authenticated:true,user:{id:'test-user'}}});
});
