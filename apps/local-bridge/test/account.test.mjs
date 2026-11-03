import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fanqieIdentity} from '../src/fanqie.ts';
test('番茄连接绑定可验证昵称和作品集合，账号变化失效',()=>{
 const status={ready:true,login_check:{loggedIn:true,user:'作者甲'}};
 const books=[{id:'90071992547409931',name:'书'}];
 assert.equal(fanqieIdentity(status,books).ready,true);
 assert.notEqual(fanqieIdentity(status,books).accountId,fanqieIdentity({...status,login_check:{loggedIn:true,user:'作者乙'}},books).accountId);
 assert.notEqual(fanqieIdentity(status,books).accountId,fanqieIdentity(status,[{id:'2',name:'书'}]).accountId);
 assert.equal(fanqieIdentity(status,[]).ready,false);
 assert.equal(fanqieIdentity({ready:true},books).ready,false);
});
