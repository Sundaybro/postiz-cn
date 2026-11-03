import {test} from 'node:test';
import assert from 'node:assert/strict';
import {channelEnvironment} from '../src/process.ts';
test('外部渠道进程只收到操作所需环境，不继承工作台密钥和其他账号目录',()=>{
 const result=channelEnvironment({PATH:'/bin',HOME:'/home/example',JWT_SECRET:'secret',DATABASE_URL:'private',LOCAL_BRIDGE_TOKEN:'token',FANQIE_COOKIES_FILE:'/other/cookies',FANQIE_TRANSPORT:'http',FANQIE_CHROME_PATH:'/browser'});
 assert.deepEqual(result,{PATH:'/bin',HOME:'/home/example',FANQIE_CHROME_PATH:'/browser'});
});
