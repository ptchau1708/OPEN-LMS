import { create } from 'zustand';
import type { MascotId } from '@openedu/contracts';

export interface Toast { id: number; text: string; tone: 'ok' | 'star' | 'try' }

interface UiState {
  unlockQueue: MascotId[];
  /** Tạm giữ màn chúc mừng (đang học bài) để không chen ngang. */
  holdUnlocks: boolean;
  queueUnlocks: (ids: MascotId[]) => void;
  shiftUnlock: () => void;
  setHoldUnlocks: (v: boolean) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone'], ms?: number) => void;
  dismissToast: (id: number) => void;
  parentGateOpen: boolean;
  setParentGate: (v: boolean) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  unlockQueue: [],
  holdUnlocks: false,
  queueUnlocks: (ids) => set((s) => ({ unlockQueue: s.unlockQueue.concat(ids.filter((i) => s.unlockQueue.indexOf(i) < 0)) })),
  shiftUnlock: () => set((s) => ({ unlockQueue: s.unlockQueue.slice(1) })),
  setHoldUnlocks: (v) => set({ holdUnlocks: v }),
  toasts: [],
  toast: (text, tone = 'ok', ms = 2800) => {
    const id = nextId++;
    set((s) => ({ toasts: s.toasts.slice(-2).concat({ id, text, tone }) }));
    window.setTimeout(() => get().dismissToast(id), ms);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  parentGateOpen: false,
  setParentGate: (v) => set({ parentGateOpen: v }),
}));
