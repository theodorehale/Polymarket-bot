// Documented public data only. No credentials, order endpoints, proxies or fallback hosts.
import WebSocket from 'ws';
import {mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const duration=Number(process.env.HALE_5M_DURATION_MS??45000);
if(!Number.isFinite(duration)||duration<1000||duration>300000)throw Error('INVALID_CAPTURE_DURATION');
const dir=resolve(process.env.HALE_5M_CAPTURE_DIR??('data/microstructure/capture-'+new Date().toISOString().replaceAll(':','-')));
mkdirSync(dir,{recursive:true});
const save=(name,value)=>writeFileSync(resolve(dir,name),JSON.stringify(value,null,2)+'\n');
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok){save('access-error.json',{endpoint:url,httpStatus:response.status,at:new Date().toISOString(),decision:'STOP_NO_FALLBACK'});throw Error('HTTP_'+response.status+' '+url);}return response;}
try {
 const geo=await (await get('https://polymarket.com/api/geoblock')).json();
 save('geoblock.json',{endpoint:'https://polymarket.com/api/geoblock',recordedAt:new Date().toISOString(),httpStatus:200,blocked:geo.blocked,country:geo.country,region:geo.region,purpose:'ORDER_ELIGIBILITY_ONLY_NO_TRADING'});
 const start=Math.floor(Date.now()/300000)*300;const url='https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-'+start;
 const response=await get(url);const body=await response.text();const m=JSON.parse(body);
 save('market-metadata.json',{recordedAt:new Date().toISOString(),endpoint:url,httpStatus:response.status,body});
 const tokens=m.version==='v1'?JSON.parse(m.clobTokenIds??'[]'):[];
 const outcomes=JSON.parse(m.outcomes??'[]');const end=Date.parse(m.endDate);
 if(m.version!=='v1'||!m.conditionId||!m.active||m.closed||m.acceptingOrders!==true||tokens.length!==2||new Set(tokens).size!==2||!outcomes.includes('Up')||!outcomes.includes('Down')||!Number.isFinite(end)||end<=Date.now()||end!==start*1000+300000)throw Error('UNSUPPORTED_OR_INACTIVE_MARKET');
 const endpoint='wss://ws-subscriptions-clob.polymarket.com/ws/market';
 const path=resolve(dir,'public-book-raw.jsonl');writeFileSync(path,'',{flag:'wx'});
 const ws=new WebSocket(endpoint,{handshakeTimeout:10000,followRedirects:false});
 let messages=0,books=0,done=false;const startedAt=new Date().toISOString();
 function finish(result){if(done)return;done=true;clearTimeout(timer);clearInterval(ping);ws.terminate();
  const raw=readFileSync(path),gz=gzipSync(raw,{level:9});writeFileSync(path+'.gz',gz);
  const hash=b=>createHash('sha256').update(b).digest('hex');save('data-hashes.json',{rawBytes:raw.length,gzipBytes:gz.length,rawSha256:hash(raw),gzipSha256:hash(gz)});
  const summary={startedAt,endedAt:new Date().toISOString(),endpoint,marketId:m.conditionId,messages,books,scope:'POLYMARKET_PUBLIC_ONLY_NOT_PAIRED_STRATEGY',...result};save('public-book-capture.json',summary);console.log(JSON.stringify({dir,...summary}));if(result.decision!=='PUBLIC_BOOKS_CAPTURED')process.exitCode=2;
 }
 ws.on('open',()=>ws.send(JSON.stringify({assets_ids:tokens,type:'market'})));
 ws.on('message',data=>{const raw=data.toString();messages++;appendFileSync(path,JSON.stringify({receivedAtMs:Date.now(),monotonicReceivedNs:process.hrtime.bigint().toString(),endpoint,raw})+'\n');try{const p=JSON.parse(raw);books+=(Array.isArray(p)?p:[p]).filter(x=>x.event_type==='book').length;}catch{}});
 ws.on('unexpected-response',(_,r)=>{r.resume();finish({httpStatus:r.statusCode,decision:'ACCESS_ERROR_STOP'});});
 ws.on('error',e=>finish({decision:'CONNECTION_ERROR_STOP',error:e.message}));
 ws.on('close',()=>{if(!done)finish({decision:'EARLY_DISCONNECT'});});
 const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send('PING');},10000);
 const timer=setTimeout(()=>finish({decision:books>0?'PUBLIC_BOOKS_CAPTURED':'NO_BOOKS'}),Math.min(duration,end-Date.now()));
 process.on('SIGINT',()=>finish({decision:'INTERRUPTED'}));process.on('SIGTERM',()=>finish({decision:'INTERRUPTED'}));
} catch(error){save('capture-error.json',{at:new Date().toISOString(),decision:'STOP_NO_FALLBACK',error:String(error)});console.error(String(error));process.exitCode=2;}
