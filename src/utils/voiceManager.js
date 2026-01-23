// src/utils/voiceManager.js

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { generateAudio, cleanupAudio } from "./tts.js";
import fs from "fs";

// Armazena conexões e players por guild
const connections = new Map(); // guildId -> VoiceConnection
const players = new Map(); // guildId -> AudioPlayer
const isPlaying = new Map(); // guildId -> boolean

/**
 * Conecta o bot a um canal de voz
 * @param {import("discord.js").VoiceChannel} channel - Canal de voz
 * @returns {Promise<import("@discordjs/voice").VoiceConnection>} Conexão de voz
 */
export async function connectToChannel(channel) {
  const guildId = channel.guild.id;

  // Verifica se já está conectado
  const existingConnection = getVoiceConnection(channel.guild.id);
  if (existingConnection) {
    // Se já está conectado ao mesmo canal, retorna a conexão existente
    if (existingConnection.joinConfig.channelId === channel.id) {
      return existingConnection;
    }
    // Se está em outro canal, desconecta primeiro
    existingConnection.destroy();
  }

  // Cria nova conexão
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  // Cria player de áudio para esta guild
  const player = createAudioPlayer();
  players.set(guildId, player);

  // Conecta o player à conexão
  connection.subscribe(player);

  // Event listeners para limpeza
  connection.on("stateChange", (oldState, newState) => {
    if (newState.status === "disconnected") {
      cleanup(guildId);
    }
  });

  player.on(AudioPlayerStatus.Idle, () => {
    isPlaying.set(guildId, false);
  });

  player.on("error", (error) => {
    console.error(`Erro no player de áudio (guild ${guildId}):`, error);
    isPlaying.set(guildId, false);
  });

  connections.set(guildId, connection);
  isPlaying.set(guildId, false);

  return connection;
}

/**
 * Desconecta o bot do canal de voz atual
 * @param {string} guildId - ID do servidor
 * @returns {boolean} true se desconectou, false se não estava conectado
 */
export function disconnectFromChannel(guildId) {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    cleanup(guildId);
    return true;
  }
  return false;
}

/**
 * Limpa recursos de uma guild
 * @param {string} guildId - ID do servidor
 */
function cleanup(guildId) {
  const connection = connections.get(guildId);
  if (connection) {
    try {
      connection.destroy();
    } catch (error) {
      // Ignora erros ao destruir conexão
    }
    connections.delete(guildId);
  }

  const player = players.get(guildId);
  if (player) {
    try {
      player.stop();
    } catch (error) {
      // Ignora erros ao parar player
    }
    players.delete(guildId);
  }

  isPlaying.delete(guildId);
}

/**
 * Reproduz áudio TTS no canal conectado
 * @param {string} guildId - ID do servidor
 * @param {string} text - Texto a ser narrado
 * @param {string} language - Idioma (padrão: "pt-BR")
 * @returns {Promise<void>}
 */
export async function playTTS(guildId, text, language = "pt-BR") {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    throw new Error("Bot não está conectado a um canal de voz");
  }

  const player = players.get(guildId);
  if (!player) {
    throw new Error("Player de áudio não encontrado");
  }

  // Se já está reproduzindo, aguarda terminar
  if (isPlaying.get(guildId)) {
    // Aguarda o player ficar idle
    await new Promise((resolve) => {
      const checkIdle = () => {
        if (player.state.status === AudioPlayerStatus.Idle) {
          player.off(AudioPlayerStatus.Idle, checkIdle);
          resolve();
        }
      };
      player.on(AudioPlayerStatus.Idle, checkIdle);
    });
  }

  try {
    // Gera áudio TTS
    const audioFiles = await generateAudio(text, language);
    const filesToPlay = Array.isArray(audioFiles) ? audioFiles : [audioFiles];

    // Reproduz cada arquivo em sequência
    for (let i = 0; i < filesToPlay.length; i++) {
      const file = filesToPlay[i];

      if (!fs.existsSync(file)) {
        console.error(`Arquivo de áudio não encontrado: ${file}`);
        continue;
      }

      isPlaying.set(guildId, true);

      // Cria recurso de áudio
      const resource = createAudioResource(file, {
        inlineVolume: true,
      });

      // Reproduz
      player.play(resource);

      // Aguarda terminar (exceto no último arquivo)
      if (i < filesToPlay.length - 1) {
        await new Promise((resolve) => {
          const onIdle = () => {
            player.off(AudioPlayerStatus.Idle, onIdle);
            resolve();
          };
          player.on(AudioPlayerStatus.Idle, onIdle);
        });
      } else {
        // No último arquivo, aguarda terminar antes de limpar
        await new Promise((resolve) => {
          const onIdle = () => {
            player.off(AudioPlayerStatus.Idle, onIdle);
            resolve();
          };
          player.on(AudioPlayerStatus.Idle, onIdle);
        });
      }

      // Limpa arquivo após reproduzir
      cleanupAudio(file);
    }

    isPlaying.set(guildId, false);
  } catch (error) {
    isPlaying.set(guildId, false);
    throw error;
  }
}

/**
 * Verifica se o bot está conectado a um canal de voz
 * @param {string} guildId - ID do servidor
 * @returns {boolean}
 */
export function isConnected(guildId) {
  return getVoiceConnection(guildId) !== null;
}

/**
 * Retorna o canal de voz atual
 * @param {string} guildId - ID do servidor
 * @returns {string|null} ID do canal ou null
 */
export function getCurrentChannel(guildId) {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    return connection.joinConfig.channelId;
  }
  return null;
}

/**
 * Verifica se está reproduzindo áudio
 * @param {string} guildId - ID do servidor
 * @returns {boolean}
 */
export function isPlayingAudio(guildId) {
  return isPlaying.get(guildId) || false;
}
