import type { Layout } from 'webcola';

/** Vendored extension: the same start phases, paused between solver iterations. */
export type SteppableLayout = Layout & {
  startSteps(unconstrained: number, user: number, all: number, snap: number,
    keepRunning: boolean): Generator<void, Layout>;
  tick(): boolean;
};

/** A task boundary, rather than rAF, also progresses in hidden/occluded panes. */
function yieldToHost(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const channel = typeof MessageChannel === 'function' ? new MessageChannel() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      signal.removeEventListener('abort', finish);
      channel?.port1.close();
      channel?.port2.close();
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
    else if (channel) {
      channel.port1.onmessage = finish;
      channel.port2.postMessage(null);
    } else timer = setTimeout(finish, 0);
  });
}

/** Drain without changing iteration order, thresholds, or the solved geometry. */
export async function runLayoutSteps(
  steps: Iterator<void>, signal: AbortSignal,
  scheduling: { now?: () => number; yieldToHost?: (signal: AbortSignal) => Promise<void>; budgetMs?: number } = {},
): Promise<boolean> {
  const now = scheduling.now ?? (() => performance.now());
  const yieldTask = scheduling.yieldToHost ?? yieldToHost;
  const budgetMs = scheduling.budgetMs ?? 12;
  try {
    // Rendering/translation may already have used most of this host task.
    // Start with a fresh task budget so setup and the first slice do not stack.
    await yieldTask(signal);
    let deadline = now() + budgetMs;
    while (!signal.aborted) {
      if (steps.next().done) return true;
      if (now() >= deadline) {
        await yieldTask(signal);
        deadline = now() + budgetMs;
      }
    }
    return false;
  } finally {
    // Closing the iterator also releases any nested group-start iterators.
    steps.return?.();
  }
}

/** Retain the existing decay cap and force the same final end event on a plateau. */
export function* layoutDecaySteps(layout: SteppableLayout, maxTicks: number): Generator<void> {
  let ticks = 0;
  while (!layout.tick() && ++ticks < maxTicks) yield;
  if (ticks >= maxTicks) {
    layout.stop();
    layout.tick();
  }
}
