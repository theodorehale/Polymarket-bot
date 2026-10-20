import WebSocket from 'ws'; import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const dir='data/microstructure/takeover-2026-10-20/'; const m=JSON.parse(JSON.parse(readFileSync(dir+'market-metadata.json','utf8')).body);
if(m.version!=='v1')throw Error('UNSUPPORTED_MARKET_VERSION');
if(!Number.isFinite(Date.parse(m.endDate)) || Date.now()>=Date.parse(m.endDate))throw Error('MARKET_EXPIRED_REFRESH_METADATA');
writeFileSync(dir+'public-book-raw.jsonl','',{flag:'wx'}); // Never mix sessions

const endpoint='wss://ws-subscriptions-clob.polymarket.com/ws/market';
const ws=new WebSocket(endpoint,{handshakeTimeout:10000,followRedirects:false}); let messages=0,books=0,done=false;
const startedAt=new Date().toISOString();
function finish(result){if(done)return;done=true;clearTimeout(timer);clearInterval(ping);ws.terminate();const s={startedAt,endedAt:new Date().toISOString(),endpoint,marketId:m.conditionId,messages,books,...result};writeFileSync(dir+'public-book-capture.json',JSON.stringify(s,null,2));console.log(JSON.stringify(s));}
ws.on('open',()=>ws.send(JSON.stringify({assets_ids:JSON.parse(m.clobTokenIds),type:'market'})));
ws.on('message',data=>{const raw=data.toString();messages++;appendFileSync(dir+'public-book-raw.jsonl',JSON.stringify({receivedAtMs:Date.now(),monotonicReceivedNs:process.hrtime.bigint().toString(),endpoint,raw})+'\n');try{const p=JSON.parse(raw);books+=(Array.isArray(p)?p:[p]).filter(x=>x.event_type==='book').length;}catch{}});
ws.on('unexpected-response',(_,r)=>{r.resume();finish({httpStatus:r.statusCode,decision:'ACCESS_ERROR_STOP'});});ws.on('error',e=>finish({decision:'CONNECTION_ERROR_STOP',error:e.message}));
const ping=setInterval(()=>{if(ws.readyState===1)ws.send('PING');},10000);
const timer=setTimeout(()=>finish({decision:books>0?'PUBLIC_BOOKS_CAPTURED':'NO_BOOKS'}),30000);
