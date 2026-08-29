type DailySelectionSaveQueueOptions = {
  save: (itemIds: string[]) => Promise<boolean>;
  onSavingChange?: (saving: boolean) => void;
  onError?: () => void;
  onIdle?: () => void;
};

/** Serializes writes while retaining only the newest selection queued by rapid taps. */
export function createDailySelectionSaveQueue({ save, onSavingChange, onError, onIdle }: DailySelectionSaveQueueOptions) {
  let active = false;
  let disposed = false;
  let failed = false;
  let pending: string[] | null = null;

  async function flush() {
    if (active || disposed) return;
    active = true;
    failed = false;
    onSavingChange?.(true);
    try {
      while (!disposed && pending) {
        const itemIds = pending;
        pending = null;
        if (!await save(itemIds)) {
          failed = true;
          pending = null;
          onError?.();
          break;
        }
      }
    } catch {
      failed = true;
      pending = null;
      onError?.();
    } finally {
      active = false;
      if (!disposed) {
        onSavingChange?.(false);
        if (pending) void flush();
        else if (!failed) onIdle?.();
      }
    }
  }

  return {
    push(itemIds: string[]) {
      pending = [...itemIds];
      void flush();
    },
    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
