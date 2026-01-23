// src/state/voiceState.js

import { isConnected, getCurrentChannel, isPlayingAudio } from "../utils/voiceManager.js";

// Estado do voice controller (mantido para compatibilidade)
export const voiceController = {
  ownerId: null,        // quem "manda" no bot
  channelId: null,      // canal atual
  guildId: null,
  isConnected: false,
};

/**
 * Verifica se o narrador está conectado em um servidor
 * @param {string} guildId - ID do servidor
 * @returns {boolean}
 */
export function isNarratorConnected(guildId) {
  return isConnected(guildId);
}

/**
 * Retorna o canal de voz onde o narrador está conectado
 * @param {string} guildId - ID do servidor
 * @returns {string|null} ID do canal ou null
 */
export function getNarratorChannel(guildId) {
  return getCurrentChannel(guildId);
}

/**
 * Verifica se o narrador está reproduzindo áudio
 * @param {string} guildId - ID do servidor
 * @returns {boolean}
 */
export function isNarratorPlaying(guildId) {
  return isPlayingAudio(guildId);
}
