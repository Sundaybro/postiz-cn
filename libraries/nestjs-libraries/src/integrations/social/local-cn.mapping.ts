import { isAbsolute, relative, resolve, sep } from 'node:path';
type LocalPost = { id: string; message: string; media?: {type:string;path:string}[]; settings: any };
export function localPostSettings(identifier:string,settings:string,publishDate:Date) {
  const parsed=JSON.parse(settings || '{}');
  return ['xiaohongshu','fanqie'].includes(identifier) ? {...parsed,dueAt:publishDate.toISOString()} : parsed;
}
export function localEditorContent(identifier:string,content:string) {
  return ['xiaohongshu','fanqie'].includes(identifier)
    ? content.replace(/<\/p>/gi,'</p>\n\n').replace(/<br\s*\/?\s*>/gi,'\n')
    : content;
}
export function mapLocalPost(channel: 'xiaohongshu'|'fanqie', accountId: string, post: LocalPost, config: {uploadUrl:string;mediaRoot?:string}) {
  const s=post.settings || {};
  if (s.confirmed !== true) throw Error('CONFIRMATION_REQUIRED');
  if (typeof s.useAI !== 'boolean') throw Error('AI_DECLARATION_REQUIRED');
  if (channel === 'fanqie' && (typeof s.bookId !== 'string' || !/^\d+$/.test(s.bookId) || !Number.isSafeInteger(s.chapterNumber) || s.chapterNumber < 1)) throw Error('BOOK_REQUIRED');
  const media=(post.media || []).map(m=> {
    if (m.type !== 'image') throw Error('IMAGE_ONLY');
    const base=new URL(config.uploadUrl.endsWith('/') ? config.uploadUrl : config.uploadUrl+'/');
    const decoded=decodeURIComponent(m.path);
    if (decoded.split('/').some(p=>p === '..' || p === '.')) throw Error('LOCAL_MEDIA_ONLY');
    if (isAbsolute(m.path) && config.mediaRoot) {
      const path=relative(resolve(config.mediaRoot),resolve(m.path));
      if (path && path !== '..' && !path.startsWith('..'+sep) && !isAbsolute(path)) return path.split(sep).join('/');
      throw Error('LOCAL_MEDIA_ONLY');
    }
    const url=new URL(m.path,base.origin+'/');
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) throw Error('LOCAL_MEDIA_ONLY');
    return decodeURIComponent(url.pathname.slice(base.pathname.length));
  });
  if (channel === 'fanqie' && media.length) throw Error('TEXT_ONLY');
  return {
    taskId:post.id,channel,accountId,title:s.title,body:post.message,media,
    settings:channel === 'fanqie' ? {bookId:s.bookId,chapterNumber:s.chapterNumber,useAI:s.useAI} : {useAI:s.useAI,...(s.topics?.length ? {topics:s.topics} : {})},
    confirmed:true,
    ...(s.dueAt ? {dueAt:s.dueAt} : {}),
  };
}
