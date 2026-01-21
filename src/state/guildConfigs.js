// src/state/guildConfigs.js

const guildConfigs = new Map();

/**
 * Garante que o servidor tenha uma config criada
 */
function ensureGuild(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      protections: [],
    });
  }
  return guildConfigs.get(guildId);
}

/**
 * Adiciona uma proteção target -> trigger
 */
export function addProtection(
  guildId,
  targetId,
  triggerId,
  timeWindow = 2000
) {
  const guild = ensureGuild(guildId);

  const exists = guild.protections.some(
    (p) =>
      p.targetId === targetId &&
      p.triggerId === triggerId
  );

  if (exists) {
    return false; // já existe
  }

  guild.protections.push({
    targetId,
    triggerId,
    timeWindow,
  });

  return true;
}

/**
 * Remove uma proteção
 */
export function removeProtection(guildId, targetId, triggerId) {
  const guild = ensureGuild(guildId);

  const before = guild.protections.length;

  guild.protections = guild.protections.filter(
    (p) =>
      !(
        p.targetId === targetId &&
        p.triggerId === triggerId
      )
  );

  return guild.protections.length < before;
}

/**
 * Retorna TODAS as proteções de um servidor
 */
export function listProtections(guildId) {
  const guild = ensureGuild(guildId);
  return guild.protections;
}

/**
 * Retorna proteções onde esse usuário é target
 */
export function getProtectionsForTarget(guildId, targetId) {
  const guild = ensureGuild(guildId);

  return guild.protections.filter(
    (p) => p.targetId === targetId
  );
}
