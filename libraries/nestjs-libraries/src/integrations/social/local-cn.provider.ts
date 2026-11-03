import { randomUUID } from 'crypto';
import { Integration } from '@prisma/client';
import { BadBody, SocialAbstract, ValidityMedia } from '../social.abstract';
import { AuthTokenDetails, PendingCheckResponse, PostDetails, PostResponse, SocialProvider } from './social.integrations.interface';
import { DashboardFunction } from '../dashboard.function.decorator';
import { mapLocalPost } from './local-cn.mapping';

export abstract class LocalCnProvider extends SocialAbstract implements SocialProvider {
  abstract identifier: 'xiaohongshu' | 'fanqie';
  abstract name: string;
  isBetweenSteps=false;
  scopes: string[]=[];
  editor='none' as const;
  override maxConcurrentJob=1;
  toolTip='本机单用户渠道。连接会检查本机登录态；需要时打开扫码窗口。';
  maxLength() { return this.identifier === 'xiaohongshu' ? 1000 : 80000; }
  async customFields() {
    return [{key:'connection',label:'本机连接（保留 local 即可）',defaultValue:'local',validation:'/^local$/',type:'text' as const,hint:'连接只在当前电脑运行；不会向官方 Postiz 服务发送登录凭证。'}];
  }
  async generateAuthUrl() { const state=randomUUID(); return {url:state,state,codeVerifier:randomUUID()}; }
  private async bridge(action: string, method='GET', body?: unknown): Promise<any> {
    const origin=new URL(process.env.LOCAL_BRIDGE_URL || 'http://127.0.0.1:4318');
    if (origin.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || origin.username || origin.password) throw new BadBody(this.identifier,'{}','{}','本机桥接地址必须是回环地址');
    const token=process.env.LOCAL_BRIDGE_TOKEN;
    if (!token || token.length < 32) throw new BadBody(this.identifier,'{}','{}','尚未配置本机桥接密钥，请按 LOCAL_BUILD.md 启动');
    const path=action.startsWith('tasks/') ? `/v1/${action}` : `/v1/${this.identifier}/${action}`;
    try {
      const response=await fetch(new URL(path,origin),{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(action === 'login' || action === 'publish' ? 380000 : 120000)});
      const value=await response.json();
      if (!response.ok || !value.ok) throw Error(value.error || 'BRIDGE_ERROR');
      return value.data;
    } catch {
      throw new BadBody(this.identifier,'{}','{}','本机渠道未就绪或操作失败；若已开始提交，请先核查任务，勿重复发布。');
    }
  }
  async authenticate(params: {code:string;codeVerifier:string;refresh?:string}): Promise<AuthTokenDetails|string> {
    let fields: any;
    try { fields=JSON.parse(Buffer.from(params.code,'base64').toString('utf8')); }
    catch { return '请通过本机连接表单连接账号'; }
    if (fields.connection !== 'local') return '本机连接值应为 local';
    let status=await this.bridge('status');
    if (!status.ready) status=await this.bridge('login','POST',{});
    if (!status.ready || !status.accountId) return '尚未完成本机登录，请完成扫码后重新连接';
    return {id:status.accountId,name:status.name || this.name,username:status.accountId,accessToken:status.accountId,refreshToken:'',expiresIn:31536000,picture:''};
  }
  async refreshToken(accountId:string): Promise<AuthTokenDetails> {
    const status=await this.bridge('status');
    if (!status.ready || status.accountId !== accountId) throw new BadBody(this.identifier,'{}','{}','登录已失效或账号已变更，请重新连接');
    return {id:accountId,username:accountId,name:status.name || this.name,accessToken:accountId,refreshToken:'',expiresIn:31536000,picture:''};
  }
  override async checkValidity(posts: ValidityMedia[][], settings:any): Promise<string|true> {
    if (settings?.confirmed !== true) return '请先核对内容并勾选发布确认';
    if (posts.length !== 1) return '首版只支持单条笔记或单个章节，不支持评论线程';
    if (this.identifier === 'fanqie' && posts[0].length) return '番茄章节只支持纯文本正文';
    if (this.identifier === 'xiaohongshu' && (!posts[0].length || posts[0].length > 18)) return '小红书图文需要 1–18 张图片';
    return true;
  }
  async post(id:string,accessToken:string,details:PostDetails[],integration:Integration): Promise<PostResponse[]> {
    if (details.length !== 1) throw new BadBody(this.identifier,'{}','{}','每个任务仅支持一条内容');
    const post=details[0];
    let request: ReturnType<typeof mapLocalPost>;
    try { request=mapLocalPost(this.identifier,id,post,{uploadUrl:process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || `${process.env.FRONTEND_URL}/uploads/`,mediaRoot:process.env.UPLOAD_DIRECTORY}); }
    catch { throw new BadBody(this.identifier,'{}','{}','请核对标题、平台参数、图片，并确认本次发布内容'); }
    const result=await this.bridge('publish','POST',request);
    if (result.state === 'unknown') throw new BadBody(this.identifier,'{}','{}','发布结果待核查，本机已阻止相同任务重复提交');
    if (result.state === 'published' && result.remoteId) return [{id:post.id,postId:result.remoteId,releaseURL:result.url || '',status:'completed'}];
    return [{id:post.id,postId:'',releaseURL:result.url || '',status:'pending',pendingData:{taskId:post.id}}];
  }
  override async checkPostStatus(accessToken:string,pendingData:{taskId:string},integration:Integration): Promise<PendingCheckResponse> {
    const result=await this.bridge(`tasks/${pendingData.taskId}`);
    if (result.state === 'published' && result.remoteId) return {status:'completed',postId:result.remoteId,releaseURL:result.url || ''};
    if (result.state === 'unknown') throw new BadBody(this.identifier,'{}','{}','发布结果待核查，请到平台检查，勿重复发布');
    return {status:'pending',pendingData};
  }
  @DashboardFunction()
  async localStatus() { return this.bridge('status'); }
  @DashboardFunction()
  async localBooks() { return this.identifier === 'fanqie' ? this.bridge('books') : []; }
  @DashboardFunction()
  async localChapters(token:string,params:{bookId:string}) {
    if (this.identifier !== 'fanqie' || !/^\d+$/.test(params?.bookId || '')) return [];
    return this.bridge(`chapters/${params.bookId}`);
  }
}
