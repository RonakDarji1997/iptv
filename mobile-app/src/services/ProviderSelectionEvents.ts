type SelectedProvidersCallback = (ids: string[]) => void;

const listeners = new Set<SelectedProvidersCallback>();

export function onSelectedProvidersChange(cb: SelectedProvidersCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitSelectedProvidersChange(ids: string[]) {
  try {
    listeners.forEach(cb => {
      try { cb(ids); } catch (e) { console.error('Error in selectedProviders listener:', e); }
    });
  } catch (err) {
    console.error('Error notifying selected providers listeners:', err);
  }
}
