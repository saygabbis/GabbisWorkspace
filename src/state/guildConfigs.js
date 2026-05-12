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

  // Garante que tem songboard
  if (config.songboard === undefined) {
    config.songboard = [];
    needsSave = true;
  }

  // Garante que tem maxSoundDuration (padrão 15 segundos)
  if (config.maxSoundDuration === undefined) {
    config.maxSoundDuration = 15;
    needsSave = true;
  }

  // Garante que tem soundboardVolume (padrão 40%)
  if (config.soundboardVolume === undefined) {
    config.soundboardVolume = 40;
    needsSave = true;
  }

  // Garante que tem soundListButtonTimeout (padrão 300 segundos = 5 minutos, null = ilimitado)
  if (config.soundListButtonTimeout === undefined) {
    config.soundListButtonTimeout = 300; // 5 minutos padrão
    needsSave = true;
  }

  // Garante que tem narradorSayUser (padrão false)
  if (config.narradorSayUser === undefined) {
    config.narradorSayUser = false;
    needsSave = true;
  }

  // Garante que tem commandLogs (padrão null - sem logs específicos)
  if (config.commandLogs === undefined) {
    config.commandLogs = null; // null = sem logs, ou { channelId: string, type: 'commands'|'protection'|'all', commands?: string[]|null } = logs configurados
    needsSave = true;
  }

  // Migra logChannelId antigo para commandLogs com tipo "protection"
  // Esta migração acontece apenas se logChannelId existe e não foi migrado ainda
  if (config.logChannelId && config.logChannelId !== null) {
    if (!config.commandLogs) {
      // Não tinha commandLogs: cria novo com tipo 'protection' usando logChannelId
      config.commandLogs = {
        channelId: config.logChannelId,
        type: 'protection',
        commands: null
      };
      needsSave = true;
      console.log(`🔄 Migrado logChannelId (${config.logChannelId}) para commandLogs com tipo 'protection'`);
    } else if (config.commandLogs.channelId === config.logChannelId) {
      // Mesmo canal: se tipo é 'commands', muda para 'all' para incluir proteção também
      if (config.commandLogs.type === 'commands') {
        config.commandLogs.type = 'all';
        needsSave = true;
        console.log(`🔄 Migrado: commandLogs do mesmo canal agora é tipo 'all' (inclui proteção)`);
      } else if (config.commandLogs.type === 'protection') {
        // Já está configurado como protection, não precisa fazer nada
      } else if (config.commandLogs.type === 'all') {
        // Já está como 'all', não precisa fazer nada
      }
    } else {
      // Canais diferentes: logChannelId antigo será ignorado
      // O novo sistema usa apenas commandLogs
      console.log(`ℹ️ logChannelId (${config.logChannelId}) diferente de commandLogs.channelId (${config.commandLogs.channelId}), usando apenas commandLogs`);
    }
  }

  // Migra commandLogs antigo (sem type) para incluir type
  if (config.commandLogs && config.commandLogs.type === undefined) {
    // Se não tem type, assume que é 'commands' (comportamento antigo)
    config.commandLogs.type = 'commands';
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
      songboard: [],
      maxSoundDuration: 15, // Padrão: 15 segundos
      soundboardVolume: 40, // Padrão: 40%
      soundListButtonTimeout: 300, // Padrão: 300 segundos (5 minutos), null = ilimitado
      narradorSayUser: false, // Padrão: não fala nome do usuário
      commandLogs: null, // Padrão: sem logs de comandos
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
 * @param {string} guildId
 * @param {string} targetId
 * @param {string} triggerId
 * @param {number} [timeWindow=2000]
 * @param {string} [mode="instant"]
 * @param {string|null} [channelId=null] - Obrigatório quando mode === "channel" (canal de voz protegido)
 */
export function addProtection(
  guildId,
  targetId,
  triggerId,
  timeWindow = 2000,
  mode = "instant",
  channelId = null
) {
  const guild = ensureGuild(guildId);

  // channelId obrigatório quando mode === "channel"
  if (mode === "channel" && !channelId) {
    return false; // channelId é obrigatório para modo channel
  }

  // Validação: verifica duplicata considerando target + trigger + mode (e channelId para channel)
  const exists = guild.protections.some(
    (p) =>
      p.targetId === targetId &&
      p.triggerId === triggerId &&
      p.mode === mode &&
      (mode !== "channel" || p.channelId === channelId)
  );

  if (exists) {
    return false; // já existe (mesma combinação de target + trigger + mode [+ channel])
  }

  const protectionData = {
    targetId,
    triggerId,
    timeWindow: mode === "channel" ? 0 : timeWindow,
    mode,
    stats: {
      activationCount: 0,
      lastActivatedAt: null,
      totalDisconnects: 0,
    },
  };
  if (mode === "channel") {
    protectionData.channelId = channelId;
  }
  guild.protections.push(protectionData);

  saveConfigs(); // Salva após adicionar
  return true;
}

/**
 * Remove uma proteção
 * Se mode for fornecido, remove apenas a proteção do modo especificado (para channel, channelId é obrigatório)
 * Se mode não for fornecido, remove todas as proteções com target + trigger (compatibilidade)
 */
export function removeProtection(guildId, targetId, triggerId, mode = null, channelId = null) {
  const guild = ensureGuild(guildId);

  const before = guild.protections.length;

  if (mode !== null) {
    // Remove apenas a proteção do modo especificado (para channel, filtra por channelId)
    guild.protections = guild.protections.filter(
      (p) => {
        if (p.targetId !== targetId || p.triggerId !== triggerId || p.mode !== mode) return true;
        if (mode === "channel" && channelId != null) return p.channelId !== channelId;
        if (mode === "channel") return false; // remove qualquer channel se channelId não foi passado
        return false;
      }
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
  newTimeWindow = null,
  currentChannelId = null
) {
  const guild = ensureGuild(guildId);

  // Encontra a proteção específica (para channel, filtra por channelId)
  const protection = guild.protections.find(
    (p) =>
      p.targetId === targetId &&
      p.triggerId === triggerId &&
      p.mode === currentMode &&
      (currentMode !== "channel" || p.channelId === currentChannelId)
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
    // Se mudando para persistent ou channel, timeWindow deve ser 0
    if (newMode === "persistent" || newMode === "channel") {
      protection.timeWindow = 0;
    } else if (newMode === "instant") {
      // Se mudando para instant e timeWindow não fornecido, usar padrão ou manter atual se já for instant
      if (newTimeWindow === null) {
        protection.timeWindow = protection.mode === "instant" 
          ? protection.timeWindow 
          : 2000; // Padrão se mudando de persistent/channel para instant
      }
    }
    protection.mode = newMode;
    if (newMode !== "channel" && protection.channelId !== undefined) {
      delete protection.channelId;
    }
  }

  // Atualiza timeWindow se fornecido (apenas para modo instant)
  if (newTimeWindow !== null) {
    if (protection.mode === "persistent" || protection.mode === "channel") {
      // Não permite cooldown em modo persistent ou channel
      return { 
        success: false, 
        error: "Modo Persistent e Channel não aceitam cooldown" 
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
 * Retorna proteções do tipo "channel" para um canal de voz específico.
 * Usado quando alguém entra no canal: verificar se é target de alguma proteção channel desse canal.
 */
export function getProtectionsForChannel(guildId, channelId) {
  const guild = ensureGuild(guildId);
  return guild.protections.filter(
    (p) => p.mode === "channel" && p.channelId === channelId
  );
}

/**
 * Obtém a duração máxima de áudio configurada para o servidor
 * @param {string} guildId - ID do servidor
 * @returns {number} Duração máxima em segundos (padrão: 15)
 */
export function getMaxSoundDuration(guildId) {
  const guild = ensureGuild(guildId);
  const duration = guild.maxSoundDuration || 15;
  return duration;
}

/**
 * Define a duração máxima de áudio para o servidor
 * @param {string} guildId - ID do servidor
 * @param {number} duration - Duração máxima em segundos (>=1)
 * @returns {Object} { success: boolean, error?: string }
 */
export function setMaxSoundDuration(guildId, duration) {
  if (typeof duration !== "number" || duration < 1) {
    return {
      success: false,
      error: "Duração deve ser um número maior ou igual a 1 segundo.",
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
 * @returns {number} Volume em porcentagem (1-200, padrão: 40)
 */
export function getSoundboardVolume(guildId) {
  const guild = ensureGuild(guildId);
  return guild.soundboardVolume || 40;
}

/**
 * Define o volume do soundboard para o servidor
 * @param {string} guildId - ID do servidor
 * @param {number} volume - Volume em porcentagem (1-200)
 * @returns {Object} { success: boolean, error?: string }
 */
export function setSoundboardVolume(guildId, volume) {
  if (typeof volume !== "number" || volume < 1 || volume > 200) {
    return {
      success: false,
      error: "Volume deve ser um número entre 1 e 200.",
    };
  }

  const guild = ensureGuild(guildId);
  guild.soundboardVolume = volume;
  saveConfigs();

  return { success: true };
}

/**
 * Obtém se o narrador deve falar o nome do usuário antes da mensagem
 * @param {string} guildId - ID do servidor
 * @returns {boolean} true se deve falar nome do usuário
 */
export function getNarradorSayUser(guildId) {
  const guild = ensureGuild(guildId);
  return guild.narradorSayUser || false;
}

/**
 * Define se o narrador deve falar o nome do usuário antes da mensagem
 * @param {string} guildId - ID do servidor
 * @param {boolean} enabled - true para falar nome do usuário
 * @returns {boolean} true se foi atualizado
 */
export function setNarradorSayUser(guildId, enabled) {
  const guild = ensureGuild(guildId);
  const wasChanged = guild.narradorSayUser !== enabled;
  guild.narradorSayUser = enabled === true;
  if (wasChanged) {
    saveConfigs();
  }
  return wasChanged;
}

/**
 * Obtém configuração de logs de comandos
 * @param {string} guildId - ID do servidor
 * @param {string} type - Tipo de log a buscar: 'commands', 'protection', ou 'all' (opcional, retorna qualquer tipo se não especificado)
 * @returns {Object|null} { channelId: string, type: string, commands: string[]|null } ou null se não configurado
 */
export function getCommandLogs(guildId, type = null) {
  const guild = ensureGuild(guildId);
  const logs = guild.commandLogs;
  
  if (!logs) return null;
  
  // Se type não foi especificado, retorna qualquer log
  if (!type) return logs;
  
  // Se type foi especificado, verifica se corresponde
  if (logs.type === type || logs.type === 'all') {
    return logs;
  }
  
  return null;
}

/**
 * Define logs de comandos (geral ou por comando específico)
 * @param {string} guildId - ID do servidor
 * @param {string} channelId - ID do canal de logs
 * @param {string[]|null} commands - Array de nomes de comandos ou null para logs gerais
 * @param {string} type - Tipo de log: 'commands', 'protection', ou 'all' (padrão: 'commands')
 * @returns {Object} { success: boolean, replaced: boolean, error?: string }
 */
export function setCommandLogs(guildId, channelId, commands = null, type = 'commands') {
  const guild = ensureGuild(guildId);
  
  // Valida tipo
  if (!['commands', 'protection', 'all'].includes(type)) {
    return {
      success: false,
      replaced: false,
      error: "Tipo de log inválido. Use 'commands', 'protection' ou 'all'."
    };
  }
  
  const hadLogs = guild.commandLogs !== null;
  const existingType = hadLogs ? guild.commandLogs.type : null;
  const wasGeneral = hadLogs && guild.commandLogs.commands === null;
  
  // Se commands é null, é log geral - substitui qualquer log específico
  if (commands === null) {
    // Se já tinha logs do mesmo tipo ou tipo 'all', substitui
    if (hadLogs && (existingType === type || existingType === 'all' || type === 'all')) {
      // Se tipo é 'all', substitui qualquer configuração anterior
      if (type === 'all') {
        guild.commandLogs = {
          channelId,
          type: 'all',
          commands: null, // Log geral
        };
      } else if (existingType === 'all') {
        // Se tinha 'all' e está configurando tipo específico, mantém 'all' mas atualiza canal se diferente
        if (guild.commandLogs.channelId !== channelId) {
          guild.commandLogs.channelId = channelId;
        }
        // Mantém type: 'all'
      } else {
        // Atualiza tipo e canal
        guild.commandLogs.type = type;
        guild.commandLogs.channelId = channelId;
        guild.commandLogs.commands = null;
      }
    } else {
      // Novo log ou tipo diferente
      guild.commandLogs = {
        channelId,
        type: type,
        commands: null, // Log geral
      };
    }
    saveConfigs();
    return {
      success: true,
      replaced: hadLogs, // Sempre substitui quando é geral
    };
  }
  
  // Se commands é array, é log por comando específico (apenas para tipo 'commands')
  if (type !== 'commands') {
    return {
      success: false,
      replaced: false,
      error: "Logs por comando específico só são suportados para tipo 'commands'."
    };
  }
  
  const commandsArray = Array.isArray(commands) ? commands : [commands];
  
  // Se já tinha log geral, substitui pelo específico
  // Se já tinha log específico, adiciona os novos comandos (sem duplicatas)
  if (wasGeneral && existingType === 'commands') {
    // Substitui geral por específico
    guild.commandLogs = {
      channelId,
      type: 'commands',
      commands: [...new Set(commandsArray)], // Remove duplicatas
    };
  } else if (hadLogs && guild.commandLogs.channelId === channelId && existingType === 'commands') {
    // Mesmo canal e tipo: adiciona comandos à lista existente (sem duplicatas)
    const existingCommands = guild.commandLogs.commands || [];
    guild.commandLogs.commands = [...new Set([...existingCommands, ...commandsArray])];
  } else {
    // Novo canal ou não tinha logs: cria nova configuração
    guild.commandLogs = {
      channelId,
      type: 'commands',
      commands: [...new Set(commandsArray)],
    };
  }
  
  saveConfigs();
  
  return {
    success: true,
    replaced: wasGeneral && existingType === 'commands', // Só substituiu se tinha log geral antes
  };
}

/**
 * Obtém o timeout dos botões da lista de sons (em milissegundos)
 * @param {string} guildId - ID do servidor
 * @returns {number|null} Timeout em milissegundos (null = ilimitado, padrão: 300000 = 5 minutos)
 */
export function getSoundListButtonTimeout(guildId) {
  const guild = ensureGuild(guildId);
  const timeoutSeconds = guild.soundListButtonTimeout;
  if (timeoutSeconds === null) {
    return null; // Ilimitado
  }
  // Converte segundos para milissegundos
  return (timeoutSeconds || 300) * 1000;
}

/**
 * Define o timeout dos botões da lista de sons
 * @param {string} guildId - ID do servidor
 * @param {number|null} timeoutSeconds - Timeout em segundos (null = ilimitado, mínimo: 30 segundos)
 * @returns {Object} { success: boolean, error?: string }
 */
export function setSoundListButtonTimeout(guildId, timeoutSeconds) {
  if (timeoutSeconds !== null && (typeof timeoutSeconds !== "number" || timeoutSeconds < 30)) {
    return {
      success: false,
      error: "Timeout deve ser null (ilimitado) ou um número maior ou igual a 30 segundos.",
    };
  }

  const guild = ensureGuild(guildId);
  guild.soundListButtonTimeout = timeoutSeconds;
  saveConfigs();

  return { success: true };
}

/**
 * Remove logs de comandos (geral ou de um comando específico)
 * @param {string} guildId - ID do servidor
 * @param {string|null} commandName - Nome do comando para remover log específico, ou null para remover log geral
 * @param {string} type - Tipo de log a remover: 'commands', 'protection', ou 'all' (opcional, remove qualquer tipo se não especificado)
 * @returns {boolean} true se removeu algo
 */
export function removeCommandLogs(guildId, commandName = null, type = null) {
  const guild = ensureGuild(guildId);
  
  if (!guild.commandLogs) {
    return false; // Não tinha logs configurados
  }
  
  const logsType = guild.commandLogs.type;
  
  // Se type foi especificado, verifica se corresponde
  if (type && logsType !== type && logsType !== 'all') {
    return false; // Tipo não corresponde
  }
  
  // Se type é 'all' e logsType é específico, não remove (só remove se logsType também for 'all')
  if (type === 'all' && logsType !== 'all') {
    return false;
  }
  
  if (commandName === null) {
    // Remove log geral do tipo especificado
    if (guild.commandLogs.commands === null) {
      // Se type foi especificado e logsType é 'all', não remove tudo, apenas o tipo específico
      // Por enquanto, se type é especificado e logsType é 'all', não fazemos nada
      // (seria necessário manter 'all' mas remover um tipo específico, o que não faz sentido)
      if (type && logsType === 'all') {
        return false; // Não pode remover tipo específico de 'all'
      }
      
      guild.commandLogs = null;
      saveConfigs();
      return true;
    }
    return false; // Não tinha log geral
  }
  
  // Remove log de comando específico (apenas para tipo 'commands')
  if (logsType !== 'commands' && logsType !== 'all') {
    return false; // Só pode remover comando específico se tipo for 'commands'
  }
  
  if (guild.commandLogs.commands === null) {
    return false; // É log geral, não tem comando específico para remover
  }
  
  const index = guild.commandLogs.commands.indexOf(commandName);
  if (index === -1) {
    return false; // Comando não estava na lista
  }
  
  guild.commandLogs.commands.splice(index, 1);
  
  // Se não sobrou nenhum comando, remove a configuração inteira
  if (guild.commandLogs.commands.length === 0) {
    guild.commandLogs = null;
  }
  
  saveConfigs();
  return true;
}
