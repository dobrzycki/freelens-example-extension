/**
 * Tiny pub-sub store to hand the selected pod from the menu item
 * to the cluster page on navigation. Plain JS — avoids mobx
 * because vite-plugin-external doesn't expose named exports of mobx
 * in a way rolldown likes.
 */

export interface PodSelection {
  namespace: string;
  name: string;
}

let value: PodSelection | null = null;
const listeners = new Set<() => void>();

export const podJsonLogsSelection = {
  get(): PodSelection | null {
    return value;
  },
  set(next: PodSelection | null) {
    value = next;
    for (const l of listeners) l();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
