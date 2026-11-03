export type Channel = 'xiaohongshu' | 'fanqie';
export type PublishState = 'submitted' | 'published' | 'unknown';
export interface PublishRequest {
  taskId: string;
  channel: Channel;
  accountId: string;
  title: string;
  body: string;
  media: string[];
  settings: { useAI: boolean; bookId?: string; chapterNumber?: number; topics?: string[] };
  confirmed: boolean;
  dueAt?: string;
}
export interface PublishResult { state: PublishState; remoteId?: string; url?: string; message?: string }
export interface AccountStatus { ready: boolean; accountId?: string; name?: string; message?: string }
export interface ChannelAdapter {
  status(): Promise<AccountStatus>;
  login(): Promise<AccountStatus>;
  publish(request: PublishRequest): Promise<PublishResult>;
  books?(): Promise<{ id: string; name: string }[]>;
  chapters?(bookId: string): Promise<unknown[]>;
  close?(): Promise<void>;
}
export class BridgeError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
