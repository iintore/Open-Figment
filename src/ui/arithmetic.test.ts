import { describe, expect, it } from 'vitest';
import { evalExpr, parseArithmetic } from './arithmetic';

describe('parseArithmetic', () => {
  it.each([
    ['1+2', 3],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['10-4-3', 3],
    ['100/10/2', 5],
    ['-5+2', -3],
    ['-(2+3)', -5],
    ['--3', 3],
    ['+4', 4],
    ['2**3', 8],
    ['2**3**2', 512],
    ['2*3**2', 18],
    ['1.5*2', 3],
    ['.5+.25', 0.75],
    ['((1))', 1],
  ])('%s = %d', (src, expected) => {
    expect(parseArithmetic(src)).toBeCloseTo(expected, 10);
  });

  it.each(['', '()', '1+', '(1', '1)', '1 2', '1..2', '.', 'a', '1;2', '*2'])('rejects %j', (src) => {
    expect(parseArithmetic(src)).toBeNull();
  });
});

describe('evalExpr', () => {
  it('evaluates plain expressions', () => {
    expect(evalExpr('100/2', 0)).toBe(50);
    expect(evalExpr(' 24 + 8 ', 0)).toBe(32);
    expect(evalExpr('42', 7)).toBe(42);
  });

  it('a leading minus number is absolute, not relative', () => {
    expect(evalExpr('-5', 100)).toBe(-5);
    expect(evalExpr('-5+1', 100)).toBe(-4);
  });

  it('relative input applies to the current value', () => {
    expect(evalExpr('*2', 10)).toBe(20);
    expect(evalExpr('+10', 5)).toBe(15);
    expect(evalExpr('/4', 10)).toBe(2.5);
    expect(evalExpr('-(2)', 10)).toBe(8);
  });

  it('accepts comma decimals and a trailing percent', () => {
    expect(evalExpr('1,5', 0)).toBe(1.5);
    expect(evalExpr('2,5*2', 0)).toBe(5);
    expect(evalExpr('50%', 0)).toBe(50);
  });

  it('rejects empty, non-finite and garbage input', () => {
    expect(evalExpr('', 1)).toBeNull();
    expect(evalExpr('   ', 1)).toBeNull();
    expect(evalExpr('1/0', 1)).toBeNull();
    expect(evalExpr('abc', 1)).toBeNull();
    expect(evalExpr('1e5', 1)).toBeNull();
  });

  it.each(['alert(1)', '1;2', '()', '1..2', 'constructor', 'this', '1+window', '`1`', '[]', '{}', '1=1', '0x10', 'Math.PI', '2(3)'])(
    'rejects injection attempt %j',
    (s) => {
      expect(evalExpr(s, 10)).toBeNull();
    },
  );
});
