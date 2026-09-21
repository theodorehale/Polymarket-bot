import {describe,expect,it} from 'vitest';
import {containsSecretLikeMaterial,sanitizeExternalError,validateExternalInputShape} from './security-boundary.js';

describe('research security boundary',()=>{
 it('redacts common secret values from vendor errors',()=>{
  expect(sanitizeExternalError(new Error('authorization=Bearer abcdefghijklmnop api_key=sk-abcdefghijklmnop'))).not.toContain('abcdefghijklmnop');
 });
 it('detects secret-like values even under harmless field names',()=>{
  expect(containsSecretLikeMaterial({message:'request failed with sk-abcdefghijklmnop'})).toBe(true);
 });
 it('detects secret-like key names recursively',()=>{
  expect(containsSecretLikeMaterial({nested:{privateKey:'value'}})).toBe(true);
 });
 it('bounds hostile oversized external structures',()=>{
  expect(validateExternalInputShape({x:'12345'},{maxStringLength:2,maxArrayLength:10,maxObjectKeys:10,maxDepth:3})).toContain('EXTERNAL_INPUT_STRING_TOO_LARGE');
 });
 it('detects cyclic hostile objects without recursing forever',()=>{
  const x:any={};x.self=x;
  expect(validateExternalInputShape(x)).toContain('EXTERNAL_INPUT_CYCLE');
 });
});
