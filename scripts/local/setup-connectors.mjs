import {mkdir,cp,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const local=resolve(root,'.local');
const env={...process.env,UV_CACHE_DIR:resolve(local,'cache/uv'),UV_PYTHON_INSTALL_DIR:resolve(local,'runtime/python'),PLAYWRIGHT_BROWSERS_PATH:resolve(local,'runtime/playwright'),PUPPETEER_SKIP_DOWNLOAD:'true'};
const run=(command,args,cwd=root)=>new Promise((yes,no)=>{const child=spawn(command,args,{cwd,env,stdio:'inherit'});child.once('error',no);child.once('exit',code=>code===0?yes():no(Error(`${command} exited ${code}`)));});
await mkdir(resolve(local,'connectors'),{recursive:true});
try{await access(resolve(local,'python/bin/python'));}catch{await run('uv',['venv','--python',process.env.LOCAL_PYTHON||'3.12',resolve(local,'python')]);}
await run('uv',['pip','install','--python',resolve(local,'python/bin/python'),'--index-url',process.env.LOCAL_PYPI_INDEX||'https://pypi.tuna.tsinghua.edu.cn/simple','-r',resolve(root,'scripts/local/requirements-xhs.txt'),resolve(root,'third_party/xiaohongshu-cli')]);
const source=resolve(root,'third_party/fanqie-autopub-mcp'),target=resolve(local,'connectors/fanqie');
await mkdir(target,{recursive:true});
for(const name of ['src','package.json','package-lock.json','tsconfig.json','LICENSE']){
 try{await access(resolve(source,name));}catch{continue;}
 await cp(resolve(source,name),resolve(target,name),{recursive:true});
}
await run('npm',['install','--ignore-scripts','--registry',process.env.LOCAL_NPM_REGISTRY||'https://registry.npmmirror.com'],target);
await run('npm',['run','build'],target);
console.log('Project-local channel environments are ready. No account was accessed.');
