// src/lib/back-stack.ts
//
// The layers a host's own Back control closes, newest first (see
// src/components/cabinet/back-stack.tsx for the React side). Pure, so the
// ordering rules are unit-tested without a DOM.

export interface BackStack {
  /** Add a layer; returns its removal. */
  push(handler: () => void): () => void;
  /** Close the newest layer. False when there is none. */
  back(): boolean;
  size(): number;
  subscribe(onChange: () => void): () => void;
}

export function createBackStack(): BackStack {
  const layers: Array<{ id: number; handler: () => void }> = [];
  const listeners = new Set<() => void>();
  let seq = 0;
  const emit = (): void => {
    for (const fn of [...listeners]) fn();
  };
  return {
    push(handler) {
      const id = ++seq;
      layers.push({ id, handler });
      emit();
      return () => {
        const i = layers.findIndex((l) => l.id === id);
        if (i >= 0) {
          layers.splice(i, 1);
          emit();
        }
      };
    },
    back() {
      const top = layers[layers.length - 1];
      if (!top) return false;
      top.handler();
      return true;
    },
    size: () => layers.length,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}
