import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { BridgeError } from './contracts.ts';
import type { Channel, ChannelAdapter } from './contracts.ts';
import { PublishJournal } from './journal.ts';
import { validatePublish, resolveMedia } from './validation.ts';

type Response = { status: number; body: { ok: boolean; data?: any; error?: string } };
type Options = { token: string; dataDir: string; mediaRoot: string; adapters: Record<Channel,ChannelAdapter>; enablePublish: boolean };
export function createBridge(options: Options) {
  if (options.token.length < 32) throw new BridgeError('BRIDGE_TOKEN_TOO_SHORT');
  const journal=new PublishJournal(join(options.dataDir,'tasks'));
  async function dispatch(method: string, path: string, headers: Record<string,string | string[] | undefined>, body: unknown): Promise<Response> {
    try {
      const expected=Buffer.from('Bearer '+options.token);
      const supplied=Buffer.from(typeof headers.authorization === 'string' ? headers.authorization : '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected,supplied)) throw new BridgeError('UNAUTHORIZED',401);
      if (headers.origin !== undefined) throw new BridgeError('ORIGIN_NOT_ALLOWED',403);
      let data: any;
      if (method === 'GET' && path === '/health') data={ready:true};
      else if (method === 'GET' && /^\/v1\/tasks\/[a-zA-Z0-9_-]{1,120}$/.test(path)) {
        data=await journal.get(path.split('/').pop()!);
        if (!data) throw new BridgeError('TASK_NOT_FOUND',404);
      } else {
        const route=path.match(/^\/v1\/(xiaohongshu|fanqie)\/(status|login|books|chapters|preview|publish)(?:\/(\d+))?$/);
        if (!route) throw new BridgeError('NOT_FOUND',404);
        const channel=route[1] as Channel;
        const action=route[2];
        const adapter=options.adapters[channel];
        if (action === 'status' && method === 'GET') data=await adapter.status();
        else if (action === 'login' && method === 'POST') data=await adapter.login();
        else if (action === 'books' && method === 'GET' && adapter.books) data=await adapter.books();
        else if (action === 'chapters' && method === 'GET' && route[3] && adapter.chapters) data=await adapter.chapters(route[3]);
        else if (method === 'POST' && ['preview','publish'].includes(action)) {
          const request=validatePublish(body,Date.now(),true);
          if (request.channel !== channel) throw new BridgeError('CHANNEL_MISMATCH');
          if (action === 'preview') {
            await Promise.all(request.media.map(m=>resolveMedia(options.mediaRoot,m)));
            data={title:request.title,body:request.body,media:request.media,settings:request.settings,characters:Array.from(request.body).length,offline:true};
          } else {
            if (!request.confirmed) throw new BridgeError('CONFIRMATION_REQUIRED');
            const replay=await journal.replay(request);
            if (replay) data=replay;
            else {
              validatePublish(request);
              if (!options.enablePublish) throw new BridgeError('PUBLISH_DISABLED',403);
              const status=await adapter.status();
              if (!status.ready) throw new BridgeError('LOGIN_REQUIRED',409);
              if (status.accountId !== request.accountId) throw new BridgeError('ACCOUNT_CHANGED',409);
              data=await journal.publish(request,()=>adapter.publish(request));
            }
          }
        } else throw new BridgeError('NOT_FOUND',404);
      }
      return {status:200,body:{ok:true,data}};
    } catch (error) {
      return {status:error instanceof BridgeError ? error.status : 500,body:{ok:false,error:error instanceof BridgeError ? error.code : 'BRIDGE_INTERNAL_ERROR'}};
    }
  }
  const server=createServer(async (req,res)=> {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      let total=0;
      const chunks: Buffer[]=[];
      for await (const chunk of req) {
        total+=chunk.length;
        if (total > 512*1024) throw new BridgeError('BODY_TOO_LARGE',413);
        chunks.push(Buffer.from(chunk));
      }
      const raw=Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try { body=raw ? JSON.parse(raw) : null; } catch { throw new BridgeError('INVALID_JSON'); }
      const result=await dispatch(req.method || '',req.url || '',req.headers,body);
      res.writeHead(result.status);res.end(JSON.stringify(result.body));
    } catch (error) {
      res.writeHead(error instanceof BridgeError ? error.status : 500);
      res.end(JSON.stringify({ok:false,error:error instanceof BridgeError ? error.code : 'BRIDGE_INTERNAL_ERROR'}));
    }
  });
  server.requestTimeout=390000;
  server.headersTimeout=15000;
  return {dispatch,server};
}
