// src/utils/soundboardManager.js

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Formatos de áudio suportados
const SUPPORTED_FORMATS = [
  "mp3",
  "wav",
  "m4a",
  "flac",
  "aac",
  "ogg",
  "wma",
  "opus",
  "webm",
];

// Duração máxima padrão em segundos (usado quando não há configuração customizada)
const DEFAULT_MAX_DURATION = 15;

// Bitrate para compressão (96kbps - balance entre qualidade e tamanho)
const AUDIO_BITRATE = "96k";

// Sample rate (48kHz - padrão Discord)
const SAMPLE_RATE = "48000";

/**
 * Valida se o formato do arquivo é suportado
 * @param {string} filename - Nome do arquivo ou URL
 * @returns {boolean}
 */
export function isValidAudioFormat(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return SUPPORTED_FORMATS.includes(ext);
}

/**
 * Baixa um arquivo de uma URL
 * @param {string} url - URL do arquivo
 * @param {string} outputPath - Caminho onde salvar
 * @returns {Promise<void>}
 */
export function downloadFromUrl(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(outputPath);

    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(outputPath, () => {});
          reject(
            new Error(
              `HTTP ${response.statusCode}: ${response.statusMessage}`
            )
          );
          return;
        }

        // Verifica Content-Type se disponível
        const contentType = response.headers["content-type"];
        if (
          contentType &&
          !contentType.startsWith("audio/") &&
          !contentType.startsWith("video/")
        ) {
          file.close();
          fs.unlink(outputPath, () => {});
          reject(new Error("URL não aponta para um arquivo de áudio/vídeo"));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
  });
}

/**
 * Baixa um attachment do Discord
 * @param {import("discord.js").Attachment} attachment - Attachment do Discord
 * @param {string} outputPath - Caminho onde salvar
 * @returns {Promise<void>}
 */
export async function downloadAttachment(attachment, outputPath) {
  if (!attachment.url) {
    throw new Error("Attachment não tem URL");
  }

  return downloadFromUrl(attachment.url, outputPath);
}

/**
 * Obtém a duração de um arquivo de áudio usando FFmpeg
 * @param {string} filePath - Caminho do arquivo
 * @returns {Promise<number>} Duração em segundos
 */
export async function getAudioDuration(filePath) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:118',message:'getAudioDuration entry',data:{filePath,fileExists:fs.existsSync(filePath)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:122',message:'Before FFmpeg exec',data:{ffmpegPath,command:`"${ffmpegPath}" -i "${filePath}" 2>&1`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // FFmpeg retorna código 1 quando usado apenas para obter info (sem output)
    // Precisamos capturar stderr que contém as informações
    const command = `"${ffmpegPath}" -i "${filePath}" 2>&1`;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:128',message:'Executing FFmpeg command',data:{command},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    let stdout, stderr;
    try {
      const result = await execAsync(command);
      stdout = result.stdout;
      stderr = result.stderr;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:136',message:'FFmpeg exec success',data:{stdoutLength:stdout?.length,stderrLength:stderr?.length,stdout:stdout?.substring(0,200),stderr:stderr?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (execError) {
      // FFmpeg retorna erro mesmo quando consegue mostrar info (código 1)
      // Mas o output está em stderr
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:143',message:'FFmpeg exec error (expected)',data:{code:execError.code,stdoutLength:stdout?.length,stderrLength:stderr?.length,stdout:stdout?.substring(0,500),stderr:stderr?.substring(0,500),fullError:execError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    // Combina stdout e stderr (FFmpeg envia info para stderr)
    const output = (stdout || '') + (stderr || '');
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:150',message:'Combined output',data:{outputLength:output.length,outputPreview:output.substring(0,1000)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Procura por padrão de duração: Duration: HH:MM:SS.mmm
    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:155',message:'Duration match result',data:{found:!!durationMatch,match:durationMatch},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    if (durationMatch) {
      const hours = parseFloat(durationMatch[1]);
      const minutes = parseFloat(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:162',message:'Duration calculated',data:{hours,minutes,seconds,totalSeconds},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return totalSeconds;
    }

    throw new Error("Não foi possível encontrar duração no output do FFmpeg");
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41872b57-c4a0-47d7-9087-49dc5ef47ae1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'soundboardManager.js:168',message:'getAudioDuration error',data:{errorMessage:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    throw new Error(`Erro ao obter duração: ${error.message}`);
  }
}

/**
 * Processa um arquivo de áudio com FFmpeg
 * Converte para Opus, limita a duração máxima especificada e comprime
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @param {string} outputPath - Caminho do arquivo de saída
 * @param {number|null} maxDuration - Duração máxima em segundos (null = sem limite)
 * @returns {Promise<number>} Duração final do áudio em segundos
 */
export async function processAudio(inputPath, outputPath, maxDuration = DEFAULT_MAX_DURATION) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  // Obtém duração do arquivo original
  const duration = await getAudioDuration(inputPath);
  
  // Se maxDuration for null, não limita (apenas para owner)
  const effectiveMaxDuration = maxDuration === null ? duration : maxDuration;
  const finalDuration = Math.min(duration, effectiveMaxDuration);

  // Comando FFmpeg para processar o áudio
  // -i: arquivo de entrada
  // -t: limita duração (se maxDuration não for null)
  // -c:a libopus: codec Opus
  // -b:a: bitrate 96kbps
  // -ar: sample rate 48kHz
  // -ac 2: estéreo
  // -y: sobrescreve arquivo de saída se existir
  const baseCommand = `"${ffmpegPath}" -i "${inputPath}"`;
  const durationFlag = maxDuration === null ? "" : `-t ${effectiveMaxDuration}`;
  const codecFlags = `-c:a libopus -b:a ${AUDIO_BITRATE} -ar ${SAMPLE_RATE} -ac 2 -y "${outputPath}"`;
  
  // Monta o comando com ou sem limitação de duração
  const ffmpegCommand = durationFlag 
    ? `${baseCommand} ${durationFlag} ${codecFlags}`
    : `${baseCommand} ${codecFlags}`;

  try {
    await execAsync(ffmpegCommand);
    return finalDuration;
  } catch (error) {
    // Remove arquivo de saída parcial se existir
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw new Error(`Erro ao processar áudio: ${error.message}`);
  }
}

/**
 * Processa e salva um som do soundboard
 * @param {string} guildId - ID do servidor
 * @param {string} inputPath - Caminho do arquivo de entrada (temporário)
 * @param {string} soundId - ID único do som
 * @param {number|null} maxDuration - Duração máxima em segundos (null = sem limite)
 * @returns {Promise<{outputPath: string, duration: number}>}
 */
export async function processAndSaveSound(guildId, inputPath, soundId, maxDuration = DEFAULT_MAX_DURATION) {
  // Cria diretório de sons do servidor se não existir
  const soundsDir = path.join(__dirname, "../../data/sounds", guildId);
  if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
  }

  // Caminho do arquivo processado
  const outputPath = path.join(soundsDir, `${soundId}.opus`);

  // Processa o áudio
  const duration = await processAudio(inputPath, outputPath, maxDuration);

  return {
    outputPath,
    duration,
  };
}

/**
 * Remove arquivo de som do servidor
 * @param {string} guildId - ID do servidor
 * @param {string} soundId - ID do som
 */
export function deleteSoundFile(guildId, soundId) {
  const soundPath = path.join(
    __dirname,
    "../../data/sounds",
    guildId,
    `${soundId}.opus`
  );

  if (fs.existsSync(soundPath)) {
    fs.unlinkSync(soundPath);
  }
}

/**
 * Obtém o caminho do arquivo de som
 * @param {string} guildId - ID do servidor
 * @param {string} soundId - ID do som
 * @returns {string} Caminho do arquivo
 */
export function getSoundFilePath(guildId, soundId) {
  return path.join(__dirname, "../../data/sounds", guildId, `${soundId}.opus`);
}

/**
 * Deleta todos os arquivos de áudio do servidor
 * @param {string} guildId - ID do servidor
 */
export function deleteAllSoundFiles(guildId) {
  const soundsDir = path.join(__dirname, "../../data/sounds", guildId);
  
  if (!fs.existsSync(soundsDir)) {
    return; // Diretório não existe, nada para deletar
  }
  
  try {
    const files = fs.readdirSync(soundsDir);
    for (const file of files) {
      const filePath = path.join(soundsDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Remove o diretório se estiver vazio
    try {
      fs.rmdirSync(soundsDir);
    } catch (err) {
      // Ignora erro se diretório não estiver vazio
    }
  } catch (error) {
    console.error(`Erro ao deletar arquivos de som do servidor ${guildId}:`, error);
    throw error;
  }
}
