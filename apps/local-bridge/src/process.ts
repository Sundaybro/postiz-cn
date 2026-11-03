import { execFile } from 'node:child_process';
import { BridgeError } from './contracts.ts';

export function channelEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keys=['PATH','HOME','USERPROFILE','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','XDG_CACHE_HOME','PLAYWRIGHT_BROWSERS_PATH','FANQIE_CHROME_PATH'];
  return Object.fromEntries(keys.filter(key=>source[key] !== undefined).map(key=>[key,source[key]]));
}

export function runFile(command: string, args: string[], options: { timeout?: number; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve,reject) => {
    execFile(command,args,{timeout:options.timeout || 120000,maxBuffer:1024*1024,encoding:'utf8',env:options.env || channelEnvironment()},(error,stdout) => {
      if (error) reject(new BridgeError(error.killed ? 'CHANNEL_TIMEOUT' : 'CHANNEL_PROCESS_ERROR',502));
      else resolve(stdout.trim());
    });
  });
}
