'use client';
import { withProvider, PostComment } from '../high.order.provider';
import { XiaohongshuDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/local-cn.dto';
import { LocalSettings } from './local-settings';
export default withProvider({postComment:PostComment.POST,comments:false,minimumCharacters:[],SettingsComponent:()=> <LocalSettings channel="xiaohongshu"/>,dto:XiaohongshuDto,maximumCharacters:1000});
