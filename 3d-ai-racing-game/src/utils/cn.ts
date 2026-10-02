/**
 * Tiny classname joiner. Accepts strings, falsy values and conditionals so JSX
 * can read `cn("base", active && "active")` without pulling in a dependency.
 */
export type ClassValue = string | number | null | undefined | false;

export function cn(...parts: ClassValue[]): string {
  let out = "";
  for (const p of parts) {
    if (!p && p !== 0) continue;
    const s = String(p).trim();
    if (!s) continue;
    out = out ? out + " " + s : s;
  }
  return out;
}

export default cn;
