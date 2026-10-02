/** Yield to the browser so the loading UI can actually paint between stages. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export type ProgressFn = (fraction: number, label: string) => void;

/** Runs `work` in slices, yielding whenever a slice has used up its time budget. */
export async function timeSliced(
  total: number,
  budgetMs: number,
  work: (start: number, end: number) => void,
  onSlice?: (done: number) => void,
): Promise<void> {
  let i = 0;
  while (i < total) {
    const t0 = performance.now();
    let end = i;
    while (end < total && performance.now() - t0 < budgetMs) {
      const chunk = Math.min(total - end, 32);
      work(end, end + chunk);
      end += chunk;
    }
    i = end;
    onSlice?.(i);
    if (i < total) await nextFrame();
  }
}
