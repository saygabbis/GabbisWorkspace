// src/state/blacklist.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, "../../data/blacklist.json");

const blacklistData = new Map();

// Carrega blacklist do arquivo
function loadBlacklist() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const configs = JSON.parse(data);

      for (const [guildId, config] of Object.entries(configs)) {
        blacklistData.set(guildId, config);
      }

      console.log(`✅ Blacklist carregada de ${CONFIG_FILE}`);
    } else {
      // Cria o diretório se não existir
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`📁 Arquivo de blacklist será criado em ${CONFIG_FILE}`);
    }
  } catch (err) {
    console.error("❌ Erro ao carregar blacklist:", err);
  }
}

// Salva blacklist no arquivo
function saveBlacklist() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const configs = Object.fromEntries(blacklistData);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Erro ao salvar blacklist:", err);
  }
}

// Carrega na inicialização
loadBlacklist();

/**
 * Garante que o servidor tenha uma config criada
 */
function ensureGuild(guildId) {
  if (!blacklistData.has(guildId)) {
    blacklistData.set(guildId, {
      users: [],
      commands: {},
    });
  }
  return blacklistData.get(guildId);
}

/**
 * Adiciona usuário à blacklist completa
 */
export function addUserBlacklist(guildId, userId) {
  const guild = ensureGuild(guildId);

  if (guild.users.includes(userId)) {
    return false; // já está na blacklist
  }

  guild.users.push(userId);
  saveBlacklist();
  return true;
}

/**
 * Remove usuário da blacklist completa
 */
export function removeUserBlacklist(guildId, userId) {
  const guild = ensureGuild(guildId);

  const index = guild.users.indexOf(userId);
  if (index === -1) {
    return false; // não estava na blacklist
  }

  guild.users.splice(index, 1);
  saveBlacklist();
  return true;
}

/**
 * Adiciona comando específico à blacklist do usuário
 */
export function addCommandBlacklist(guildId, userId, commandName) {
  const guild = ensureGuild(guildId);

  if (!guild.commands[userId]) {
    guild.commands[userId] = [];
  }

  if (guild.commands[userId].includes(commandName)) {
    return false; // comando já está bloqueado
  }

  guild.commands[userId].push(commandName);
  saveBlacklist();
  return true;
}

/**
 * Remove comando específico da blacklist do usuário
 */
export function removeCommandBlacklist(guildId, userId, commandName) {
  const guild = ensureGuild(guildId);

  if (!guild.commands[userId]) {
    return false; // usuário não tem comandos bloqueados
  }

  const index = guild.commands[userId].indexOf(commandName);
  if (index === -1) {
    return false; // comando não estava bloqueado
  }

  guild.commands[userId].splice(index, 1);

  // Remove a entrada se não houver mais comandos bloqueados
  if (guild.commands[userId].length === 0) {
    delete guild.commands[userId];
  }

  saveBlacklist();
  return true;
}

/**
 * Verifica se usuário está completamente bloqueado
 */
export function isUserBlacklisted(guildId, userId) {
  const guild = ensureGuild(guildId);
  return guild.users.includes(userId);
}

/**
 * Verifica se comando está bloqueado para o usuário
 */
export function isCommandBlacklisted(guildId, userId, commandName) {
  const guild = ensureGuild(guildId);
  return guild.commands[userId]?.includes(commandName) || false;
}

/**
 * Retorna lista completa da blacklist do servidor
 */
export function listBlacklist(guildId) {
  const guild = ensureGuild(guildId);
  return {
    users: [...guild.users],
    commands: { ...guild.commands },
  };
}

/**
 * Remove todos os comandos bloqueados de um usuário (útil quando usuário é removido da blacklist completa)
 */
export function clearUserCommands(guildId, userId) {
  const guild = ensureGuild(guildId);
  
  if (guild.commands[userId]) {
    delete guild.commands[userId];
    saveBlacklist();
    return true;
  }
  
  return false;
}
