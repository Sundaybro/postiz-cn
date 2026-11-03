export function localQueueAllowed(identifier:string,local:boolean) {
  return !local || ['main','xiaohongshu','fanqie'].includes(identifier);
}
