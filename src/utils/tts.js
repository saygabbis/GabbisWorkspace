// src/utils/tts.js

import { getAudioUrl } from "google-tts-api";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório temporário para arquivos de áudio
const TEMP_DIR = path.join(os.tmpdir(), "gabbis-tts");

// Cria o diretório temporário se não existir
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Limite de caracteres por requisição (Google TTS tem limite)
const MAX_TEXT_LENGTH = 200;

/**
 * Mapeia códigos de idioma para o formato do Google TTS
 * @param {string} languageCode - Código do idioma (ex: "pt-BR", "en-US")
 * @returns {string} Código do idioma para Google TTS
 */
function mapLanguageCode(languageCode) {
  const languageMap = {
    "pt-BR": "pt-BR",
    "pt": "pt-BR",
    "en-US": "en-US",
    "en": "en-US",
    "es-ES": "es-ES",
    "es": "es-ES",
    "fr-FR": "fr-FR",
    "fr": "fr-FR",
    "de-DE": "de-DE",
    "de": "de-DE",
    "it-IT": "it-IT",
    "it": "it-IT",
    "ja-JP": "ja-JP",
    "ja": "ja-JP",
    "ko-KR": "ko-KR",
    "ko": "ko-KR",
    "zh-CN": "zh-CN",
    "zh": "zh-CN",
  };

  return languageMap[languageCode] || "pt-BR";
}

/**
 * Divide texto longo em partes menores
 * @param {string} text - Texto a ser dividido
 * @returns {string[]} Array de partes do texto
 */
function splitText(text) {
  if (text.length <= MAX_TEXT_LENGTH) {
    return [text];
  }

  const parts = [];
  let currentPart = "";

  // Tenta dividir por pontuação primeiro
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    if (currentPart.length + sentence.length <= MAX_TEXT_LENGTH) {
      currentPart += sentence;
    } else {
      if (currentPart) {
        parts.push(currentPart.trim());
      }
      // Se a sentença sozinha é maior que o limite, divide por palavras
      if (sentence.length > MAX_TEXT_LENGTH) {
        const words = sentence.split(/\s+/);
        let wordPart = "";
        for (const word of words) {
          if (wordPart.length + word.length + 1 <= MAX_TEXT_LENGTH) {
            wordPart += (wordPart ? " " : "") + word;
          } else {
            if (wordPart) {
              parts.push(wordPart.trim());
            }
            wordPart = word;
          }
        }
        if (wordPart) {
          currentPart = wordPart;
        } else {
          currentPart = "";
        }
      } else {
        currentPart = sentence;
      }
    }
  }

  if (currentPart) {
    parts.push(currentPart.trim());
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Baixa um arquivo de áudio de uma URL
 * @param {string} url - URL do áudio
 * @param {string} outputPath - Caminho onde salvar o arquivo
 * @returns {Promise<void>}
 */
function downloadAudio(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(outputPath, () => {}); // Remove arquivo parcial
        reject(err);
      });
  });
}

/**
 * Gera áudio TTS a partir de um texto
 * @param {string} text - Texto a ser convertido em áudio
 * @param {string} language - Código do idioma (padrão: "pt-BR")
 * @returns {Promise<string>} Caminho do arquivo de áudio gerado
 */
export async function generateAudio(text, language = "pt-BR") {
  if (!text || text.trim().length === 0) {
    throw new Error("Texto não pode estar vazio");
  }

  const mappedLanguage = mapLanguageCode(language);
  const textParts = splitText(text.trim());

  // Se o texto foi dividido, precisamos gerar múltiplos áudios e concatená-los
  if (textParts.length > 1) {
    const audioFiles = [];
    const baseTimestamp = Date.now();

    try {
      // Gera áudio para cada parte
      for (let i = 0; i < textParts.length; i++) {
        const part = textParts[i];
        const audioUrl = getAudioUrl(part, {
          lang: mappedLanguage,
          slow: false,
          host: "https://translate.google.com",
        });

        const tempFile = path.join(TEMP_DIR, `tts_${baseTimestamp}_${i}.mp3`);
        await downloadAudio(audioUrl, tempFile);
        audioFiles.push(tempFile);
      }

      // Concatena os arquivos usando ffmpeg (se disponível)
      // Por enquanto, retorna o primeiro arquivo e os outros serão reproduzidos em sequência
      // O voiceManager pode lidar com a reprodução sequencial
      return audioFiles;
    } catch (error) {
      // Limpa arquivos em caso de erro
      audioFiles.forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch {}
      });
      throw error;
    }
  } else {
    // Texto único, gera um único áudio
    try {
      const audioUrl = getAudioUrl(textParts[0], {
        lang: mappedLanguage,
        slow: false,
        host: "https://translate.google.com",
      });

      const tempFile = path.join(TEMP_DIR, `tts_${Date.now()}.mp3`);
      await downloadAudio(audioUrl, tempFile);
      return tempFile;
    } catch (error) {
      throw new Error(`Erro ao gerar áudio TTS: ${error.message}`);
    }
  }
}

/**
 * Limpa arquivos temporários de áudio
 * @param {string|string[]} filePath - Caminho(s) do(s) arquivo(s) a ser(em) removido(s)
 */
export function cleanupAudio(filePath) {
  const files = Array.isArray(filePath) ? filePath : [filePath];
  files.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      // Ignora erros ao limpar
    }
  });
}

/**
 * Limpa todos os arquivos temporários antigos (mais de 1 hora)
 */
export function cleanupOldAudio() {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hora

    files.forEach((file) => {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        // Ignora erros
      }
    });
  } catch (error) {
    // Ignora erros
  }
}

// Limpa arquivos antigos na inicialização
cleanupOldAudio();
