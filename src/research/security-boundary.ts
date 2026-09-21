/**
 * Security boundary helpers for research-only external inputs.
 * No wallet, signer, broker, shell, filesystem, or order capabilities belong here.
 */

const SECRET_KEY_NAME=/(private.?key|secret|password|mnemonic|seed.?phrase|api.?key|authorization|bearer|signer|token)/i;
const SECRET_VALUE_PATTERNS=[
  /\b(sk-[A-Za-z0-9_-]{12,})\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(0x[a-fA-F0-9]{64})\b/g,
];

export function sanitizeExternalError(error:unknown):string{
  const raw=error instanceof Error?error.message:typeof error==='string'?error:'UNKNOWN_EXTERNAL_ERROR';
  let out=raw.slice(0,1000);
  for(const pattern of SECRET_VALUE_PATTERNS) out=out.replace(pattern,'[REDACTED]');
  out=out.replace(/((?:api[_-]?key|private[_-]?key|secret|password|authorization|mnemonic|seed[_-]?phrase)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]');
  return out||'UNKNOWN_EXTERNAL_ERROR';
}

export function containsSecretLikeMaterial(value:unknown,seen=new Set<object>()):boolean{
  if(value===null||value===undefined) return false;
  if(typeof value==='string') return SECRET_VALUE_PATTERNS.some(p=>{p.lastIndex=0;return p.test(value);});
  if(typeof value!=='object') return false;
  if(seen.has(value as object)) return false;
  seen.add(value as object);
  if(Array.isArray(value)) return value.some(x=>containsSecretLikeMaterial(x,seen));
  for(const [key,child] of Object.entries(value as Record<string,unknown>)){
    if(SECRET_KEY_NAME.test(key)) return true;
    if(containsSecretLikeMaterial(child,seen)) return true;
  }
  return false;
}

export interface ExternalInputLimits {maxStringLength:number;maxArrayLength:number;maxObjectKeys:number;maxDepth:number;}
export const DEFAULT_EXTERNAL_INPUT_LIMITS:ExternalInputLimits={maxStringLength:100_000,maxArrayLength:20_000,maxObjectKeys:2_000,maxDepth:20};

export function validateExternalInputShape(value:unknown,limits:ExternalInputLimits=DEFAULT_EXTERNAL_INPUT_LIMITS):string[]{
  const reasons:string[]=[];const seen=new Set<object>();
  const visit=(v:unknown,depth:number)=>{
    if(depth>limits.maxDepth){reasons.push('EXTERNAL_INPUT_MAX_DEPTH_EXCEEDED');return;}
    if(typeof v==='string'&&v.length>limits.maxStringLength) reasons.push('EXTERNAL_INPUT_STRING_TOO_LARGE');
    if(v===null||typeof v!=='object') return;
    if(seen.has(v as object)){reasons.push('EXTERNAL_INPUT_CYCLE');return;}seen.add(v as object);
    if(Array.isArray(v)){if(v.length>limits.maxArrayLength) reasons.push('EXTERNAL_INPUT_ARRAY_TOO_LARGE');for(const x of v) visit(x,depth+1);return;}
    const entries=Object.entries(v as Record<string,unknown>);
    if(entries.length>limits.maxObjectKeys) reasons.push('EXTERNAL_INPUT_OBJECT_TOO_LARGE');
    for(const [,x] of entries) visit(x,depth+1);
  };
  visit(value,0);return [...new Set(reasons)];
}
