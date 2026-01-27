// src/state/guildConfigs.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, "../../data/guildConfigs.json");

const guildConfigs = new Map();

// Migra configurações antigas para o novo formato
function migrateConfig(config) {
  let needsSave = false;

  // Garante que tem logChannelId
  if (config.logChannelId === undefined) {
    config.logChannelId = null;
    needsSave = true;
  }

  // Garante que tem soundboard
  if (config.soundboard === undefined) {
    config.soundboard = [];
    needsSave = true;
  }

  // Garante que tem maxSoundDuration (padrão 15 segundos)
  if (config.maxSoundDuration === undefined) {
    config.maxSoundDuration = 15;
    needsSave = true;
  }

  // Garante que tem soundboardVolume (padrão 60%)
  if (config.soundboardVolume === undefined) {
    config.soundboardVolume = 60;
    needsSave = true;
  }

  // Migra proteções antigas para incluir stats e mode
  if (config.protections && Array.isArray(config.protections)) {
    config.protections.forEach((protection) => {
      if (!protection.stats) {
        protection.stats = {
          activationCount: 0,
          lastActivatedAt: null,
          totalDisconnects: 0,
        };
        needsSave = true;
      }
      // Adiciona modo padrão se não existir
      if (!protection.mode) {
        protection.mode = "instant";
        needsSave = true;
      }
    });
  }

  return needsSave;
}

// Carrega configurações do arquivo
function loadConfigs() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const configs = JSON.parse(data);
      let needsSave = false;

      for (const [guildId, config] of Object.entries(configs)) {
        const migrated = migrateConfig(config);
        if (migrated) {
          needsSave = true;
        }
        guildConfigs.set(guildId, config);
      }

      if (needsSave) {
        saveConfigs();
        console.log(`🔄 Configurações migradas para novo formato`);
      }

      console.log(`✅ Configurações carregadas de ${CONFIG_FILE}`);
    } else {
      // Cria o diretório se não existir
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`📁 Arquivo de configuração será criado em ${CONFIG_FILE}`);
    }
  } catch (err) {
    console.error("❌ Erro ao carregar configurações:", err);
  }
}

// Salva configurações no arquivo
export function saveConfigs() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const configs = Object.fromEntries(guildConfigs);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Erro ao salvar configurações:", err);
  }
}

// Carrega na inicialização
loadConfigs();

/**
 * Garante que o servidor tenha uma config criada
 */
function ensureGuild(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      logChannelId: null,
      protections: [],
      soundboard: [],
      maxSoundDuration: 15, // Padrão: 15 segundos
      soundboardVolume: 60, // Padrão: 60%
    });
  } else {
    // Migra config existente se necessário
    const config = guildConfigs.get(guildId);
    if (migrateConfig(config)) {
      saveConfigs();
    }
  }
  return guildConfigs.get(guildId);
}

/**
 * Retorna a config inteira do servidor
 * (usado pelos comandos)
 */
export function getGuildConfig(guildId) {
  return ensureGuild(guildId);
}

/**
 * Salva a config do servidor
 * (por enquanto é só em memória, mas já deixa preparado)
 */
export function saveGuildConfig(guildId, config) {
  guildConfigs.set(guildId, config);
}

/**
 * Adiciona uma proteção target -> trigger
 */
export function addProtection(
  guildId,
  targetId,
  triggerId,
  timeWindow = 2000,
  mode = "instant"
) {
  const guild = ensureGuild(guildId);

  // Validação: verifica duplicata considerando target + trigger + mode
  const exists = guild.protections.some(
    (p) =>
      p.targetId === targetId &&
      p.triggerId === triggerId &&
      p.mode === mode
  );

  if (exists) {
    return false; // já existe (mesma combinação de target + trigger + mode)
  }

  guild.protections.push({
    targetId,
    triggerId,
    timeWindow,
    mode,
    stats: {
      activationCount: 0,
      lastActivatedAt: null,
      totalDisconnects: 0,
    },
  });

  saveConfigs(); // Salva após adicionar
  return true;
}

/**
 * Remove uma proteção
 * Se mode for fornecido, remove apenas a proteção do modo especificado
 * Se mode não for fornecido, remove todas as proteções com target + trigger (compatibilidade)
 */
export function removeProtection(guildId, targetId, triggerId, mode = null) {
  const guild = ensureGuild(guildId);

  const before = guild.protections.length;

  if (mode !== null) {
    // Remove apenas a proteção do modo especificado
    guild.protections = guild.protections.filter(
      (p) =>
        !(
          p.targetId === targetId &&
          p.triggerId === triggerId &&
          p.mode === mode
        )
    );
  } else {
    // Remove todas as proteções com target + trigger (comportamento antigo para compatibilidade)
    guild.protections = guild.protections.filter(
      (p) =>
        !(
          p.targetId === targetId &&
          p.triggerId === triggerId
        )
    );
  }

  const removed = guild.protections.length < before;
  if (removed) {
    saveConfigs(); // Salva após remover
  }
  return removed;
}

/**
 * Atualiza uma proteção existente
 * Retorna objeto com { success: boolean, oldValues: {...}, newValues: {...} } ou null se não encontrada
 */
export function updateProtection(
  guildId,
  targetId,
  triggerId,
  currentMode,
  newMode = null,
  newTimeWindow = null
) {
  const guild = ensureGuild(guildId);

  // Encontra a proteção específica
  const protection = guild.protections.find(
    (p) =>
      p.targetId === targetId &&
      p.triggerId === triggerId &&
      p.mode === currentMode
  );

  if (!protection) {
    return null; // Proteção não encontrada
  }

  // Guarda valores antigos para retorno
  const oldValues = {
    mode: protection.mode,
    timeWindow: protection.timeWindow,
  };

  // Atualiza modo se fornecido
  if (newMode !== null && newMode !== protection.mode) {
    // Se mudando para persistent, timeWindow deve ser 0
    if (newMode === "persistent") {
      protection.timeWindow = 0;
    } else if (newMode === "instant") {
      // Se mudando para instant e timeWindow não fornecido, usar padrão ou manter atual se já for instant
      if (newTimeWindow === null) {
        protection.timeWindow = protection.mode === "instant" 
          ? protection.timeWindow 
          : 2000; // Padrão se mudando de persistent para instant
      }
    }
    protection.mode = newMode;
  }

  // Atualiza timeWindow se fornecido (apenas para modo instant)
  if (newTimeWindow !== null) {
    if (protection.mode === "persistent") {
      // Não permite cooldown em modo persistent
      return { 
        success: false, 
        error: "Modo Persistent não aceita cooldown" 
      };
    }
    protection.timeWindow = newTimeWindow * 1000; // Converte segundos para ms
  }

  // Guarda valores novos para retorno
  const newValues = {
    mode: protection.mode,
    timeWindow: protection.timeWindow,
  };

  // Salva após atualizar
  saveConfigs();

  return {
    success: true,
    oldValues,
    newValues,
  };
}

/**
 * Retorna proteções com target + trigger específicos (pode retornar múltiplas se houver diferentes modos)
 */
export function getProtectionsByTargetAndTrigger(guildId, targetId, triggerId) {
  const guild = ensureGuild(guildId);
  return guild.protections.filter(
    (p) => p.targetId === targetId && p.triggerId === triggerId
  );
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

/**
 * Define o canal de logs para um servidor
 */
export function setLogChannel(guildId, channelId) {
  const guild = ensureGuild(guildId);
  guild.logChannelId = channelId;
  saveConfigs();
  return true;
}

/**
 * Remove o canal de logs de um servidor
 */
export function removeLogChannel(guildId) {
  const guild = ensureGuild(guildId);
  const hadChannel = guild.logChannelId !== null;
  guild.logChannelId = null;
  if (hadChannel) {
    saveConfigs();
  }
  return hadChannel;
}

/**
 * Obtém o canal de logs configurado para um servidor
 */
export function getLogChannel(guildId) {
  const guild = ensureGuild(guildId);
  return guild.logChannelId || null;
}

/**
 * Obtém a duração máxima de áudio configurada para o servidor
 * @param {string} guildId - ID do servidor
 * @returns {number} Duração máxima em segundos (padrão: 15, máximo: 60)
 */
export function getMaxSoundDuration(guildId) {
  const guild = ensureGuild(guildId);
  const duration = guild.maxSoundDuration || 15;
  // Limita a 60 segundos para admins
  return Math.min(duration, 60);
}

/**
 * Define a duração máxima de áudio para o servidor
 * @param {string} guildId - ID do servidor
 * @param {number} duration - Duração máxima em segundos (1-60)
 * @returns {Object} { success: boolean, error?: string }
 */
export function setMaxSoundDuration(guildId, duration) {
  if (typeof duration !== "number" || duration < 1 || duration > 60) {
    return {
      success: false,
      error: "Duração deve ser um número entre 1 e 60 segundos.",
    };
  }

  const guild = ensureGuild(guildId);
  guild.maxSoundDuration = duration;
  saveConfigs();

  return { success: true };
}

/**
 * Obtém o volume do soundboard configurado para o servidor
 * @param {string} guildId - ID do servidor
 * @returns {number} Volume em porcentagem (1-100, padrão: 60)
 */
export function getSoundboardVolume(guildId) {
  const guild = ensureGuild(guildId);
  return guild.soundboardVolume || 60;
}

/**
 * Define o volume do soundboard para o servidor
 * @param {string} guildId - ID do servidor
 * @param {number} volume - Volume em porcentagem (1-100)
 * @returns {Object} { success: boolean, error?: string }
 */
export function setSoundboardVolume(guildId, volume) {
  if (typeof volume !== "number" || volume < 1 || volume > 100) {
    return {
      success: false,
      error: "Volume deve ser um número entre 1 e 100.",
    };
  }

  const guild = ensureGuild(guildId);
  guild.soundboardVolume = volume;
  saveConfigs();

  return { success: true };
}
