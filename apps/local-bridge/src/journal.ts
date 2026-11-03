import { mkdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { BridgeError } from './contracts.ts';
import type { PublishRequest, PublishResult } from './contracts.ts';
import { contentHash } from './validation.ts';

type Entry = { hash: string; accountId: string; state: 'running' | 'done'; result?: PublishResult };
export class PublishJournal {
  directory: string;
  active = new Map<string, { hash: string; promise: Promise<PublishResult> }>();
  accounts = new Map<string, Promise<unknown>>();
  constructor(directory: string) { this.directory = directory; }
  private async syncDirectory() {const dir=await open(this.directory,'r');try{await dir.sync();}finally{await dir.close();}}
  private file(taskId: string) { return join(this.directory,createHash('sha256').update(taskId).digest('hex')+'.json'); }
  async replay(request: PublishRequest): Promise<PublishResult | null> {
    let raw: string;
    try { raw=await readFile(this.file(request.taskId),'utf8'); }
    catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
    let old: Entry;
    try { old=JSON.parse(raw); } catch { return {state:'unknown',message:'NEEDS_VERIFICATION'}; }
    if (old.hash !== contentHash(request)) throw new BridgeError('TASK_CONFLICT',409);
    return old.result || {state:'unknown',message:'NEEDS_VERIFICATION'};
  }
  async get(taskId: string): Promise<PublishResult | null> {
    try {
      const entry: Entry = JSON.parse(await readFile(this.file(taskId),'utf8'));
      return entry.result || {state:'unknown',message:'NEEDS_VERIFICATION'};
    } catch (error: any) { if (error.code === 'ENOENT') return null; return {state:'unknown',message:'NEEDS_VERIFICATION'}; }
  }
  async publish(request: PublishRequest, send: () => Promise<PublishResult>): Promise<PublishResult> {
    const hash = contentHash(request);
    const active = this.active.get(request.taskId);
    if (active) {
      if (active.hash !== hash) throw new BridgeError('TASK_CONFLICT',409);
      return active.promise;
    }
    const key = request.channel+':'+request.accountId;
    const before = this.accounts.get(key) || Promise.resolve();
    const promise = before.catch(()=>{}).then(()=>this.execute(request,hash,send));
    this.accounts.set(key,promise);
    this.active.set(request.taskId,{hash,promise});
    try { return await promise; }
    finally { this.active.delete(request.taskId); if (this.accounts.get(key) === promise) this.accounts.delete(key); }
  }
  private async execute(request: PublishRequest, hash: string, send: () => Promise<PublishResult>): Promise<PublishResult> {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const path = this.file(request.taskId);
    const entry: Entry = {hash,accountId:request.accountId,state:'running'};
    try { await writeFile(path,JSON.stringify(entry),{flag:'wx',mode:0o600,flush:true});await this.syncDirectory(); }
    catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      let old: Entry;
      try { old = JSON.parse(await readFile(path,'utf8')); }
      catch { return {state:'unknown',message:'NEEDS_VERIFICATION'}; }
      if (old.hash !== hash) throw new BridgeError('TASK_CONFLICT',409);
      return old.result || {state:'unknown',message:'NEEDS_VERIFICATION'};
    }
    let result: PublishResult;
    try { result = await send(); }
    catch { result = {state:'unknown',message:'NEEDS_VERIFICATION'}; }
    if (!['published','submitted','unknown'].includes(result.state) || (result.state === 'published' && !result.remoteId)) result = {state:'unknown',message:'NEEDS_VERIFICATION'};
    const temp = path+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify({...entry,state:'done',result}),{mode:0o600,flush:true});
    await rename(temp,path);
    await this.syncDirectory();
    return result;
  }
}
