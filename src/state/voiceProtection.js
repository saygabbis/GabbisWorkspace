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

// ============================================
// SISTEMA DE RATE LIMITING E COOLDOWN
// ============================================

// Rate limiting APENAS por par target+trigger específico
// Formato: "guildId:targetId:triggerId" -> { lastDisconnect, attempts, cooldownUntil, lastAttemptAt }
const triggerCooldowns = new Map();

// Constantes de cooldown
const BASE_COOLDOWN = 5000; // 5 segundos
const PROGRESSIVE_MULTIPLIERS = [1, 2, 6, 12, 60]; // 5s, 10s, 30s, 1min, 5min
const MAX_ATTEMPTS = PROGRESSIVE_MULTIPLIERS.length;
const COOLDOWN_RESET_TIME = 300000; // 5 minutos sem tentativas = reset

/**
 * Cria chave única para cooldown (apenas para par específico)
 */
function makeCooldownKey(guildId, targetId, triggerId) {
  return `${guildId}:${targetId}:${triggerId}`;
}

/**
 * Verifica se trigger está em cooldown
 * Retorna { inCooldown: boolean, remainingMs: number }
 */
export function isTriggerInCooldown(guildId, targetId, triggerId) {
  const key = makeCooldownKey(guildId, targetId, triggerId);
  const cooldown = triggerCooldowns.get(key);
  
  if (!cooldown) {
    return { inCooldown: false, remainingMs: 0 };
  }
  
  const now = Date.now();
  
  // Se passou muito tempo desde última tentativa, reseta
  if (now - cooldown.lastAttemptAt > COOLDOWN_RESET_TIME) {
    triggerCooldowns.delete(key);
    return { inCooldown: false, remainingMs: 0 };
  }
  
  // Verifica se ainda está em cooldown
  if (now < cooldown.cooldownUntil) {
    return {
      inCooldown: true,
      remainingMs: cooldown.cooldownUntil - now,
    };
  }
  
  return { inCooldown: false, remainingMs: 0 };
}

/**
 * Registra desconexão e aplica cooldown progressivo
 */
export function recordDisconnectAndApplyCooldown(guildId, targetId, triggerId) {
  const key = makeCooldownKey(guildId, targetId, triggerId);
  const now = Date.now();
  
  const existing = triggerCooldowns.get(key);
  
  if (!existing) {
    // Primeira desconexão - cooldown base
    triggerCooldowns.set(key, {
      lastDisconnect: now,
      attempts: 1,
      cooldownUntil: now + BASE_COOLDOWN * PROGRESSIVE_MULTIPLIERS[0],
      lastAttemptAt: now,
    });
    return { cooldownMs: BASE_COOLDOWN * PROGRESSIVE_MULTIPLIERS[0], attempts: 1 };
  }
  
  // Incrementa tentativas
  const attempts = Math.min(existing.attempts + 1, MAX_ATTEMPTS);
  const multiplierIndex = attempts - 1;
  const cooldownMs = BASE_COOLDOWN * PROGRESSIVE_MULTIPLIERS[multiplierIndex];
  
  triggerCooldowns.set(key, {
    lastDisconnect: now,
    attempts,
    cooldownUntil: now + cooldownMs,
    lastAttemptAt: now,
  });
  
  return { cooldownMs, attempts };
}

/**
 * Limpa cooldowns expirados (chamado periodicamente)
 */
export function cleanupExpiredCooldowns() {
  const now = Date.now();
  const expired = [];
  
  for (const [key, cooldown] of triggerCooldowns.entries()) {
    // Remove se passou muito tempo desde última tentativa
    if (now - cooldown.lastAttemptAt > COOLDOWN_RESET_TIME) {
      expired.push(key);
    }
  }
  
  expired.forEach(key => triggerCooldowns.delete(key));
  
  return expired.length;
}

// ============================================
// SISTEMA DE RASTREAMENTO DE PROTEÇÕES ATIVAS
// ============================================

// Rastreia proteções ativas por canal para recuperação
// Formato: channelId -> Set de keys de proteção
const activeProtectionsByChannel = new Map();

/**
 * Registra proteção ativa em um canal
 */
export function registerActiveProtection(channelId, protectionKey) {
  if (!activeProtectionsByChannel.has(channelId)) {
    activeProtectionsByChannel.set(channelId, new Set());
  }
  activeProtectionsByChannel.get(channelId).add(protectionKey);
}

/**
 * Remove proteção ativa de um canal
 */
export function unregisterActiveProtection(channelId, protectionKey) {
  const protections = activeProtectionsByChannel.get(channelId);
  if (protections) {
    protections.delete(protectionKey);
    if (protections.size === 0) {
      activeProtectionsByChannel.delete(channelId);
    }
  }
}

/**
 * Retorna todas as proteções ativas em um canal
 */
export function getActiveProtectionsForChannel(channelId) {
  return activeProtectionsByChannel.get(channelId) || new Set();
}

/**
 * Limpa todas as proteções de um canal
 */
export function clearProtectionsForChannel(channelId) {
  activeProtectionsByChannel.delete(channelId);
}
