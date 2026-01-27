// src/state/soundboard.js

import { getGuildConfig, saveConfigs } from "./guildConfigs.js";

// Limite máximo de sons por servidor
const MAX_SOUNDS_PER_GUILD = 50;

/**
 * Garante que o servidor tenha um array de soundboard
 */
function ensureSoundboard(guildId) {
  const config = getGuildConfig(guildId);
  if (!config.soundboard) {
    config.soundboard = [];
    saveConfigs();
  }
  return config.soundboard;
}

/**
 * Retorna todos os sons do servidor
 */
export function getSounds(guildId) {
  return ensureSoundboard(guildId);
}

/**
 * Adiciona um som ao soundboard do servidor
 * @param {string} guildId - ID do servidor
 * @param {Object} soundData - Dados do som { id, name, filename, addedBy, addedAt, duration }
 * @returns {Object} { success: boolean, error?: string }
 */
export function addSound(guildId, soundData) {
  const soundboard = ensureSoundboard(guildId);

  // Verifica limite
  if (soundboard.length >= MAX_SOUNDS_PER_GUILD) {
    return {
      success: false,
      error: `Limite máximo de ${MAX_SOUNDS_PER_GUILD} sons por servidor atingido.`,
    };
  }

  // Verifica se já existe um som com o mesmo nome
  const existingSound = soundboard.find(
    (s) => s.name.toLowerCase() === soundData.name.toLowerCase()
  );
  if (existingSound) {
    return {
      success: false,
      error: `Já existe um som com o nome "${soundData.name}".`,
    };
  }

  // Adiciona o som
  soundboard.push(soundData);
  saveConfigs();

  return { success: true };
}

/**
 * Remove um som do soundboard
 * @param {string} guildId - ID do servidor
 * @param {string} soundName - Nome do som a remover
 * @returns {Object} { success: boolean, sound?: Object, error?: string }
 */
export function removeSound(guildId, soundName) {
  const soundboard = ensureSoundboard(guildId);

  const index = soundboard.findIndex(
    (s) => s.name.toLowerCase() === soundName.toLowerCase()
  );

  if (index === -1) {
    return {
      success: false,
      error: `Som "${soundName}" não encontrado.`,
    };
  }

  const removedSound = soundboard.splice(index, 1)[0];
  saveConfigs();

  return { success: true, sound: removedSound };
}

/**
 * Busca um som pelo nome
 * @param {string} guildId - ID do servidor
 * @param {string} soundName - Nome do som
 * @returns {Object|null} Dados do som ou null se não encontrado
 */
export function getSound(guildId, soundName) {
  const soundboard = ensureSoundboard(guildId);
  return (
    soundboard.find((s) => s.name.toLowerCase() === soundName.toLowerCase()) ||
    null
  );
}

/**
 * Retorna o número de sons no servidor
 */
export function getSoundCount(guildId) {
  return ensureSoundboard(guildId).length;
}

/**
 * Busca um som por índice (1-based)
 * @param {string} guildId - ID do servidor
 * @param {number} index - Índice do som (1-based)
 * @returns {Object|null} Dados do som ou null se não encontrado
 */
export function getSoundByIndex(guildId, index) {
  const soundboard = ensureSoundboard(guildId);
  const arrayIndex = index - 1; // Converte de 1-based para 0-based
  
  if (arrayIndex < 0 || arrayIndex >= soundboard.length) {
    return null;
  }
  
  return soundboard[arrayIndex];
}

/**
 * Atualiza o emoji de um som
 * @param {string} guildId - ID do servidor
 * @param {string} soundName - Nome do som
 * @param {string|null} emoji - Novo emoji (ou null para remover)
 * @returns {Object} { success: boolean, error?: string }
 */
export function updateSoundEmoji(guildId, soundName, emoji) {
  const soundboard = ensureSoundboard(guildId);
  
  const sound = soundboard.find(
    (s) => s.name.toLowerCase() === soundName.toLowerCase()
  );
  
  if (!sound) {
    return {
      success: false,
      error: `Som "${soundName}" não encontrado.`,
    };
  }
  
  sound.emoji = emoji || null;
  saveConfigs();
  
  return { success: true };
}

/**
 * Remove todos os sons do soundboard
 * @param {string} guildId - ID do servidor
 * @returns {Array} Lista de sons removidos (para deletar arquivos)
 */
export function clearAllSounds(guildId) {
  const soundboard = ensureSoundboard(guildId);
  const removedSounds = [...soundboard]; // Cópia da lista
  
  soundboard.length = 0; // Limpa o array
  saveConfigs();
  
  return removedSounds;
}
