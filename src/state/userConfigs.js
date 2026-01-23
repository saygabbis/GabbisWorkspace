// src/state/userConfigs.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, "../../data/userConfigs.json");

const userConfigs = new Map();

// Idioma padrão
const DEFAULT_LANGUAGE = "pt-BR";

// Carrega configurações do arquivo
function loadConfigs() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const configs = JSON.parse(data);

      for (const [userId, config] of Object.entries(configs)) {
        userConfigs.set(userId, config);
      }

      console.log(`✅ Configurações de usuário carregadas de ${CONFIG_FILE}`);
    } else {
      // Cria o diretório se não existir
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`📁 Arquivo de configuração de usuário será criado em ${CONFIG_FILE}`);
    }
  } catch (err) {
    console.error("❌ Erro ao carregar configurações de usuário:", err);
  }
}

// Salva configurações no arquivo
function saveConfigs() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const configs = Object.fromEntries(userConfigs);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Erro ao salvar configurações de usuário:", err);
  }
}

// Carrega na inicialização
loadConfigs();

/**
 * Garante que o usuário tenha uma config criada
 */
function ensureUser(userId) {
  if (!userConfigs.has(userId)) {
    userConfigs.set(userId, {
      language: DEFAULT_LANGUAGE,
    });
  }
  return userConfigs.get(userId);
}

/**
 * Retorna o idioma configurado do usuário
 * @param {string} userId - ID do usuário
 * @returns {string} Código do idioma (ex: "pt-BR", "en-US")
 */
export function getUserLanguage(userId) {
  const user = ensureUser(userId);
  return user.language || DEFAULT_LANGUAGE;
}

/**
 * Define o idioma do usuário
 * @param {string} userId - ID do usuário
 * @param {string} language - Código do idioma (ex: "pt-BR", "en-US")
 * @returns {boolean} true se foi atualizado, false se já estava no mesmo valor
 */
export function setUserLanguage(userId, language) {
  const user = ensureUser(userId);
  const wasChanged = user.language !== language;
  
  if (wasChanged) {
    user.language = language;
    saveConfigs();
  }
  
  return wasChanged;
}

/**
 * Retorna a config inteira do usuário
 */
export function getUserConfig(userId) {
  return ensureUser(userId);
}
