// guarda o timestamp da última entrada/movimento do target
let lastTargetActivityAt = null;

export function armProtection(now) {
  lastTargetActivityAt = now;
}

export function consumeProtection() {
  lastTargetActivityAt = null;
}

export function isProtectionActive(now, timeWindow) {
  if (!lastTargetActivityAt) return false;
  return now - lastTargetActivityAt <= timeWindow;
}
