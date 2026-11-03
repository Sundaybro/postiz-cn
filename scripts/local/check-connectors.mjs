// Read-only protocol smoke check: never calls auth, account or publishing tools.
import {FanqieAdapter} from '../../apps/local-bridge/src/fanqie.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const data=await mkdtemp(resolve('.local/state/mcp-check-'));
const adapter=new FanqieAdapter(resolve('.local/connectors/fanqie'),data);
try {
 const client=await adapter.connect();
 const result=await client.listTools();
 const names=result.tools.map(tool=>tool.name);
 for(const expected of ['get_publish_status','login_tomato','list_novels_tomato','list_chapters_tomato','add_chapter_tomato'])if(!names.includes(expected))throw Error(`Missing protocol tool ${expected}`);
 console.log('Fanqie MCP protocol tools available; no tool was executed.');
} finally {await adapter.close();await rm(data,{recursive:true,force:true});}
