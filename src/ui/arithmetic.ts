/** Evaluate simple math typed into number fields (e.g. "100/2", "24+8"). */
export function evalExpr(s: string, current: number): number | null {
  const t = s.trim().replace(/,/g, '.').replace(/%$/, '');
  if (!t) return null;
  if (/^[-+*/]/.test(t) && !/^-?\d/.test(t)) {
    return evalExpr(`${current}${t}`, current);
  }
  if (!/^[\d\s.+\-*/()]+$/.test(t)) return null;
  const v = parseArithmetic(t);
  return v !== null && Number.isFinite(v) ? v : null;
}

/**
 * Evaluates + - * / ** and parentheses over decimal numbers. A small parser rather than
 * `Function()`, so the app runs under a Content Security Policy without 'unsafe-eval'.
 */
export function parseArithmetic(src: string): number | null {
  const tokens = src.match(/\d*\.?\d+\.?|\*\*|[-+*/()]|\S/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const num = (): number => {
    const tok = tokens[i++];
    if (tok === '(') {
      const v = sum();
      if (tokens[i++] !== ')') throw new Error('expected )');
      return v;
    }
    if (tok === '-') return -num();
    if (tok === '+') return num();
    if (tok === undefined || !/^\d*\.?\d*$/.test(tok) || tok === '.') throw new Error('expected number');
    return parseFloat(tok);
  };
  const power = (): number => {
    const base = num();
    if (peek() === '**') {
      i++;
      return base ** power();
    }
    return base;
  };
  const product = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/') v = tokens[i++] === '*' ? v * power() : v / power();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + product() : v - product();
    return v;
  };
  try {
    const v = sum();
    return i === tokens.length ? v : null;
  } catch {
    return null;
  }
}
