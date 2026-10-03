import type { PaperExecutionAttempt } from './types.js';
import type { Markout } from './markout.js';

export interface PaperPerformanceRow {
 latencyMs:number; attempts:number; fills:number; fillRate:number;
 meanNetEdge?:number; expectancyPerAttempt?:number;
 meanMarkout100ms?:number; meanMarkout500ms?:number; meanMarkout1000ms?:number;
}
const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:undefined;
export function summarizePaperPerformance(
 attempts:PaperExecutionAttempt[], markouts:Markout[]
):PaperPerformanceRow[]{
 return [...new Set(attempts.map(a=>a.configuredLatencyMs))].sort((a,b)=>a-b).map(latencyMs=>{
  const rows=attempts.filter(a=>a.configuredLatencyMs===latencyMs);
  const fills=rows.filter(a=>a.status==='PAPER_FILLED');
  const edges=fills.map(a=>a.netEdge).filter((x):x is number=>Number.isFinite(x));
  const ids=new Set(fills.map(a=>a.attemptId));
  const at=(h:number)=>mean(markouts.filter(m=>ids.has(m.attemptId)&&m.horizonMs===h&&m.status==='OBSERVED')
    .map(m=>m.signedMarkout).filter((x):x is number=>Number.isFinite(x)));
  const netContribution=rows.map(a=>a.status==='PAPER_FILLED'?(a.netEdge??0):0);
  return {latencyMs,attempts:rows.length,fills:fills.length,fillRate:rows.length?fills.length/rows.length:0,
    meanNetEdge:mean(edges),expectancyPerAttempt:mean(netContribution),
    meanMarkout100ms:at(100),meanMarkout500ms:at(500),meanMarkout1000ms:at(1000)};
 });
}
