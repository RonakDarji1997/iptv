// Small in-memory navigation lock used to avoid navigation flooding / loops
let locked = false;

export function acquireNavLock(timeout = 1000) {
  if (locked) return false;
  locked = true;
  setTimeout(() => {
    locked = false;
  }, timeout);
  return true;
}

export function isNavLocked() {
  return locked;
}

export function releaseNavLock() {
  locked = false;
}
