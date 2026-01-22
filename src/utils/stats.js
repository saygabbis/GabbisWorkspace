// src/utils/stats.js

import { getGuildConfig } from "../state/guildConfigs.js";

/**
 * Inicializa stats de uma proteção se não existir
 */
function ensureProtectionStats(guildId, targetId, triggerId) {
  const config = getGuildConfig(guildId);
  const protection = config.protections.find(
    (p) => p.targetId === targetId && p.triggerId === triggerId
  );

  if (!protection) {
    return null;
  }

  if (!protection.stats) {
    protection.stats = {
      activationCount: 0,
      lastActivatedAt: null,
      totalDisconnects: 0,
    };
  }

  return protection.stats;
}

/**
 * Registra uma ativação de proteção
 */
export function recordActivation(guildId, targetId, triggerId) {
  const stats = ensureProtectionStats(guildId, targetId, triggerId);
  if (!stats) return false;

  stats.activationCount = (stats.activationCount || 0) + 1;
  stats.lastActivatedAt = Date.now();

  return true;
}

/**
 * Registra uma desconexão de trigger
 */
export function recordDisconnect(guildId, targetId, triggerId) {
  const stats = ensureProtectionStats(guildId, targetId, triggerId);
  if (!stats) return false;

  stats.totalDisconnects = (stats.totalDisconnects || 0) + 1;

  return true;
}

/**
 * Obtém estatísticas de uma proteção específica
 */
export function getProtectionStats(guildId, targetId, triggerId) {
  const stats = ensureProtectionStats(guildId, targetId, triggerId);
  if (!stats) return null;

  return {
    activationCount: stats.activationCount || 0,
    lastActivatedAt: stats.lastActivatedAt || null,
    totalDisconnects: stats.totalDisconnects || 0,
  };
}

/**
 * Obtém estatísticas gerais do servidor
 */
export function getGuildStats(guildId) {
  const config = getGuildConfig(guildId);
  const protections = config.protections || [];

  let totalActivations = 0;
  let totalDisconnects = 0;
  let lastActivation = null;

  protections.forEach((p) => {
    const stats = p.stats || {};
    totalActivations += stats.activationCount || 0;
    totalDisconnects += stats.totalDisconnects || 0;

    if (stats.lastActivatedAt) {
      if (!lastActivation || stats.lastActivatedAt > lastActivation) {
        lastActivation = stats.lastActivatedAt;
      }
    }
  });

  return {
    totalProtections: protections.length,
    totalActivations,
    totalDisconnects,
    lastActivation,
  };
}

/**
 * Obtém as proteções mais ativadas
 */
export function getTopProtections(guildId, limit = 5) {
  const config = getGuildConfig(guildId);
  const protections = config.protections || [];

  return protections
    .map((p) => ({
      targetId: p.targetId,
      triggerId: p.triggerId,
      timeWindow: p.timeWindow,
      activationCount: (p.stats?.activationCount || 0),
      lastActivatedAt: p.stats?.lastActivatedAt || null,
      totalDisconnects: p.stats?.totalDisconnects || 0,
    }))
    .sort((a, b) => b.activationCount - a.activationCount)
    .slice(0, limit);
}
