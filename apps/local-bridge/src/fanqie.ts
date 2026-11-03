import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { channelEnvironment } from './process.ts';
import { BridgeError } from './contracts.ts';
import type { PublishRequest, PublishResult, ChannelAdapter, AccountStatus } from './contracts.ts';

export function parseMcpResult(result: any): any {
  if (result?.isError) throw new BridgeError('CHANNEL_ERROR',502);
  let value: any;
  try { value=JSON.parse((result?.content || []).filter((c: any)=>c.type === 'text').map((c: any)=>c.text).join('\n')); }
  catch { throw new BridgeError('INVALID_CHANNEL_RESPONSE',502); }
  if (value?.ok === false || value?.error) throw new BridgeError('CHANNEL_ERROR',502);
  return value;
}
export function chapterArguments(p: PublishRequest) {
  return {book_id:p.settings.bookId,chapter_number:p.settings.chapterNumber,title:p.title,content:p.body,confirm:true,use_ai:p.settings.useAI,headless:false};
}
export function chapterResult(value: any): PublishResult {
  if (value?.ok === true && value.action === 'published') {
    const url=typeof value.url === 'string' && value.url.startsWith('https://fanqienovel.com/') ? value.url : undefined;
    return {state:'submitted',url,message:'AWAITING_PLATFORM_REVIEW'};
  }
  return {state:'unknown',message:'NEEDS_VERIFICATION'};
}
export function fanqieIdentity(value: any, books: {id:string,name:string}[]): AccountStatus {
  const user=value?.login_check?.user;
  if (value?.ready !== true || value?.login_check?.loggedIn !== true || typeof user !== 'string' || !user.trim() || !books.length)
    return {ready:false,message:'VERIFIABLE_AUTHOR_AND_EXISTING_BOOK_REQUIRED'};
  const fingerprint=createHash('sha256').update(JSON.stringify([user.trim(),books.map(b=>b.id).sort()])).digest('hex');
  return {ready:true,accountId:`fanqie-${fingerprint}`,name:user.trim()};
}
export class FanqieAdapter implements ChannelAdapter {
  project: string;
  dataDir: string;
  client: any;
  transport: any;
  queue: Promise<unknown> = Promise.resolve();
  constructor(project: string, dataDir: string) { this.project=project; this.dataDir=dataDir; }
  private async connect() {
    if (this.client) return this.client;
    const require = createRequire(join(this.project,'package.json'));
    const {Client} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
    const {StdioClientTransport} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
    const transport=new StdioClientTransport({command:process.execPath,args:[join(this.project,'dist/index.js')],env:{...channelEnvironment(),FANQIE_DATA_DIR:this.dataDir},stderr:'ignore'});
    const client=new Client({name:'postiz-local-bridge',version:'0.1.0'});
    await client.connect(transport);
    this.client=client; this.transport=transport;
    return client;
  }
  private call(name: string, args: Record<string,unknown> = {}) {
    const run=this.queue.catch(()=>{}).then(async()=> {
      const client=await this.connect();
      return parseMcpResult(await client.callTool({name,arguments:args},undefined,{timeout:360000}));
    });
    this.queue=run;
    return run;
  }
  async status(): Promise<AccountStatus> {
    try {
      const value=await this.call('get_publish_status',{verify_login:true});
      if (value?.ready !== true) return {ready:false,message:'LOGIN_OR_ENVIRONMENT_REQUIRED'};
      return fanqieIdentity(value,await this.books());
    } catch { return {ready:false,message:'LOGIN_OR_ENVIRONMENT_REQUIRED'}; }
  }
  async login(): Promise<AccountStatus> { await this.call('login_tomato',{timeout_seconds:300}); return this.status(); }
  async books() {
    const data=await this.call('list_novels_tomato');
    if (!Array.isArray(data?.books)) throw new BridgeError('INVALID_CHANNEL_RESPONSE',502);
    return data.books.map((b: any)=>({id:String(b.bookId),name:String(b.bookName)}));
  }
  async chapters(bookId: string) {
    const data=await this.call('list_chapters_tomato',{book_id:bookId});
    if (!Array.isArray(data?.chapters)) throw new BridgeError('INVALID_CHANNEL_RESPONSE',502);
    return data.chapters;
  }
  async publish(p: PublishRequest) {
    const status=await this.status();
    if (!status.ready || status.accountId !== p.accountId) throw new BridgeError('ACCOUNT_CHANGED',409);
    const books=await this.books();
    if (!books.some((b: any)=>b.id === p.settings.bookId)) throw new BridgeError('BOOK_NOT_ACCESSIBLE',409);
    return chapterResult(await this.call('add_chapter_tomato',chapterArguments(p)));
  }
  async close() { if (this.client) await this.client.close(); this.client=undefined; }
}
