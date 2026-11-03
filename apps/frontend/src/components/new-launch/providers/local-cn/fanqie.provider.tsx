'use client';
import { withProvider, PostComment } from '../high.order.provider';
import { FanqieDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/local-cn.dto';
import { LocalSettings } from './local-settings';
export default withProvider({postComment:PostComment.POST,comments:false,minimumCharacters:[],SettingsComponent:()=> <LocalSettings channel="fanqie"/>,dto:FanqieDto,maximumCharacters:80000});
