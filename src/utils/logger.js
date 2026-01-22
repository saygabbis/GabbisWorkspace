// src/utils/logger.js

import { getLogChannel } from "../state/guildConfigs.js";

/**
 * Formata timestamp para exibição
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "Nunca";
  const date = new Date(timestamp);
  return date.toLocaleString("pt-BR");
}

/**
 * Formata duração em milissegundos para exibição
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Log de informação no console
 */
export function logInfo(message) {
  console.log(`ℹ️ ${message}`);
}

/**
 * Log de aviso no console
 */
export function logWarn(message) {
  console.warn(`⚠️ ${message}`);
}

/**
 * Log de erro no console
 */
export function logError(message, error = null) {
  console.error(`❌ ${message}`, error ? error : "");
}

/**
 * Log de proteção ativada (console e Discord)
 */
export async function logProtectionActivation(
  client,
  guildId,
  target,
  trigger,
  channel,
  timeWindow,
  count = 1
) {
  const countText = count > 1 ? ` (${count}x)` : "";
  // Se timeWindow é 0, é modo Persistent
  const isPersistent = timeWindow === 0;
  const protectionText = isPersistent 
    ? "modo Persistent" 
    : `janela de proteção: ${formatDuration(timeWindow)}`;
  const message = `🚫 Trigger **${trigger.tag || trigger.username || trigger.id}** removido${countText} (${protectionText})`;

  // Log no console
  console.log(message);

  // Log no canal do Discord (se configurado)
  const logChannelId = getLogChannel(guildId);
  if (logChannelId && client) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel) {
        logWarn(`Canal de logs ${logChannelId} não encontrado no servidor ${guildId}`);
        return;
      }

      // Verifica se o canal permite enviar mensagens
      if (!logChannel.isTextBased()) {
        logWarn(`Canal de logs ${logChannelId} não é um canal de texto`);
        return;
      }

      const embed = {
        color: 0xff0000, // Vermelho
        title: "🛡️ Proteção Ativada",
        description: message,
        fields: [
          {
            name: "👤 Target",
            value: `<@${target.id}> (${target.tag || target.username || target.id})`,
            inline: true,
          },
          {
            name: "🤖 Trigger",
            value: `<@${trigger.id}> (${trigger.tag || trigger.username || trigger.id})`,
            inline: true,
          },
          {
            name: "📢 Canal",
            value: `<#${channel.id}>`,
            inline: true,
          },
          {
            name: isPersistent ? "🔄 Modo" : "⏱️ Janela de Proteção",
            value: isPersistent ? "Persistent (contínuo)" : formatDuration(timeWindow),
            inline: true,
          },
          {
            name: "🔢 Tentativas",
            value: count.toString(),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Servidor: ${guild.name}`,
        },
      };

      await logChannel.send({ embeds: [embed] }).catch((err) => {
        logError(`Erro ao enviar log para canal ${logChannelId}:`, err);
      });
    } catch (err) {
      logError(`Erro ao processar log de proteção:`, err);
    }
  }
}

/**
 * Log de target entrando em call (console e Discord)
 */
export async function logTargetEntered(
  client,
  guildId,
  target,
  channel,
  protectionCount
) {
  const message = `🟣 Target **${target.tag || target.username || target.id}** entrou/trocou de call no canal <#${channel.id}> (${protectionCount} proteção(ões) armada(s))`;

  // Log no console
  console.log(message);

  // Log no canal do Discord (se configurado)
  const logChannelId = getLogChannel(guildId);
  if (logChannelId && client) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const embed = {
        color: 0x9b59b6, // Roxo
        title: "🟣 Target Entrou em Call",
        description: `**${target.tag || target.username || target.id}** entrou/trocou de call`,
        fields: [
          {
            name: "👤 Target",
            value: `<@${target.id}>`,
            inline: true,
          },
          {
            name: "📢 Canal",
            value: `<#${channel.id}>`,
            inline: true,
          },
          {
            name: "🛡️ Proteções",
            value: `${protectionCount} ativa(s)`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Servidor: ${guild.name}`,
        },
      };

      await logChannel.send({ embeds: [embed] }).catch(() => {
        // Silenciosamente falha se não conseguir enviar
      });
    } catch (err) {
      // Silenciosamente falha se houver erro
    }
  }
}
