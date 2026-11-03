import { LocalCnProvider } from './local-cn.provider';
import { XiaohongshuDto } from '../../dtos/posts/providers-settings/local-cn.dto';
export class XiaohongshuProvider extends LocalCnProvider {
  identifier='xiaohongshu' as const;
  name='小红书';
  dto=XiaohongshuDto;
}
