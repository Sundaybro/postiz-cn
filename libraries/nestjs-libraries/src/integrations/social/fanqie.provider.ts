import { LocalCnProvider } from './local-cn.provider';
import { FanqieDto } from '../../dtos/posts/providers-settings/local-cn.dto';
export class FanqieProvider extends LocalCnProvider {
  identifier='fanqie' as const;
  name='番茄小说';
  dto=FanqieDto;
}
