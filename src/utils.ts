export function trimStringStartBy(s: string, c : string, atMost: number = -1) : string {
  if (c.length < 1) {
    return s;
  }
  const arr = Array.from(s);
  let first = arr.findIndex(char => char !== c[0]);
  if (first > 0 && atMost >= 0) {
    first = Math.min(first, atMost);
  }
  return first === -1 ? '' : s.substring(first);
}

export const readEnv = (env: string): string | undefined => {
  if (typeof (globalThis as any).process !== 'undefined') {
    return (globalThis as any).process.env?.[env]?.trim() ?? undefined;
  }
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return (globalThis as any).Deno.env?.get?.(env)?.trim();
  }
  return undefined;
};