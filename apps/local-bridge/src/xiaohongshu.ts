import { BridgeError } from './contracts.ts';
import type { PublishRequest, PublishResult, AccountStatus, ChannelAdapter } from './contracts.ts';
import { runFile } from './process.ts';
import { resolveMedia } from './validation.ts';

export function parseXhsEnvelope(raw: string): any {
  let value: any;
  try { value=JSON.parse(raw); } catch { throw new BridgeError('INVALID_CHANNEL_RESPONSE',502); }
  if (value?.ok !== true) throw new BridgeError('CHANNEL_ERROR',502);
  return value.data;
}
export function xhsArguments(p: PublishRequest, files: string[]): string[] {
  const args=['post','--title',p.title,'--body',p.body];
  for (const file of files) args.push('--images',file);
  for (const topic of p.settings.topics || []) args.push('--topic',topic);
  if (p.settings.useAI) args.push('--ai-generated');
  return [...args,'--json'];
}
export function xhsResult(value: any): PublishResult {
  const id = value?.note_id || value?.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9]+$/.test(id)) return {state:'unknown',message:'NEEDS_VERIFICATION'};
  return {state:'published',remoteId:id,url:`https://www.xiaohongshu.com/explore/${id}`};
}
export class XiaohongshuAdapter implements ChannelAdapter {
  command: string;
  mediaRoot: string;
  constructor(command: string, mediaRoot: string) { this.command=command; this.mediaRoot=mediaRoot; }
  async status(): Promise<AccountStatus> {
    try {
      const data=parseXhsEnvelope(await runFile(this.command,['status','--json']));
      const user=data?.user;
      if (data?.authenticated !== true || user?.guest || typeof user?.id !== 'string' || !user.id) return {ready:false,message:'LOGIN_REQUIRED'};
      return {ready:true,accountId:user.id,name:typeof user.nickname === 'string' ? user.nickname : '小红书'};
    } catch { return {ready:false,message:'LOGIN_OR_ENVIRONMENT_REQUIRED'}; }
  }
  async login(): Promise<AccountStatus> {
    parseXhsEnvelope(await runFile(this.command,['login','--qrcode','--json'],{timeout:360000}));
    return this.status();
  }
  async publish(p: PublishRequest): Promise<PublishResult> {
    const status=await this.status();
    if (!status.ready || status.accountId !== p.accountId) throw new BridgeError('ACCOUNT_CHANGED',409);
    const files=await Promise.all(p.media.map(m=>resolveMedia(this.mediaRoot,m)));
    return xhsResult(parseXhsEnvelope(await runFile(this.command,xhsArguments(p,files),{timeout:360000})));
  }
}
