import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';

// The OS owns this exclusive lease: a crash or reboot releases it without
// stale PID files. Token authentication distinguishes another project instance.
export function createControlServer(token,handler){
 if(typeof token!=='string'||token.length<32)throw Error('CONTROL_TOKEN_REQUIRED');
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const expected=Buffer.from(`Bearer ${token}`),got=Buffer.from(req.headers.authorization||'');
  if(req.headers.origin!==undefined||got.length!==expected.length||!timingSafeEqual(got,expected)){res.writeHead(401);res.end(JSON.stringify({error:'CONTROL_UNAUTHORIZED'}));return;}
  try{await handler(req,res);}catch{if(!res.headersSent)res.writeHead(500);res.end(JSON.stringify({error:'CONTROL_FAILED'}));}
 });
}
export function requestControl(port,token,path){return new Promise((yes,no)=>{
 const req=http.request({host:'127.0.0.1',port,path,method:path==='/stop'?'POST':'GET',headers:{Authorization:`Bearer ${token}`}},res=>{
  let body='';res.setEncoding('utf8');res.on('data',x=>body+=x);res.on('end',()=>{
   if(res.statusCode!==200){no(Error(res.statusCode===401?'CONTROL_UNAUTHORIZED':'CONTROL_FAILED'));return;}
   try{yes(JSON.parse(body));}catch{no(Error('Invalid supervisor response'));}
  });
 });req.on('error',no);req.setTimeout(5000,()=>req.destroy(Error('Supervisor timeout')));req.end();
});}
