// src/state/guildConfigs.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, "../../data/guildConfigs.json");

const guildConfigs = new Map();

// Carrega configurações do arquivo
function loadConfigs() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const configs = JSON.parse(data);
      for (const [guildId, config] of Object.entries(configs)) {
        guildConfigs.set(guildId, config);
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
function saveConfigs() {
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
      protections: [],
    });
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

  saveConfigs(); // Salva após adicionar
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

  const removed = guild.protections.length < before;
  if (removed) {
    saveConfigs(); // Salva após remover
  }
  return removed;
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
