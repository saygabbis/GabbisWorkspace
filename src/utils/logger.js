// src/utils/logger.js

import { getCommandLogs } from "../state/guildConfigs.js";
import { EmbedBuilder } from "discord.js";

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
 * Formata timestamp para console
 */
function formatConsoleTimestamp() {
  const now = new Date();
  return now.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Log de informação no console (melhorado)
 */
export function logInfo(message, data = null) {
  const timestamp = formatConsoleTimestamp();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : "";
  console.log(`[${timestamp}] ℹ️ INFO: ${message}${dataStr}`);
}

/**
 * Log de aviso no console (melhorado)
 */
export function logWarn(message, data = null) {
  const timestamp = formatConsoleTimestamp();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : "";
  console.warn(`[${timestamp}] ⚠️ WARN: ${message}${dataStr}`);
}

/**
 * Log de erro no console (melhorado)
 */
export function logError(message, error = null, data = null) {
  const timestamp = formatConsoleTimestamp();
  const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : "";
  const errorStr = error ? ` | Error: ${error.message || error}` : "";
  console.error(`[${timestamp}] ❌ ERROR: ${message}${dataStr}${errorStr}`);
  if (error && error.stack) {
    console.error(`Stack trace:`, error.stack);
  }
}

/**
 * Log de comando executado (console e Discord se configurado)
 * @param {import("discord.js").Client} client - Cliente do Discord
 * @param {string} guildId - ID do servidor
 * @param {string} commandName - Nome do comando
 * @param {import("discord.js").User} user - Usuário que executou
 * @param {Object} options - Opções do comando (opcional)
 * @param {string} result - Resultado/status do comando (opcional)
 */
export async function logCommand(client, guildId, commandName, user, options = null, result = null) {
  const timestamp = formatConsoleTimestamp();
  const optionsStr = options ? ` | Options: ${JSON.stringify(options)}` : "";
  const resultStr = result ? ` | Result: ${result}` : "";
  
  // Log no console
  console.log(`[${timestamp}] 📝 COMMAND: /${commandName} | User: ${user.tag} (${user.id}) | Guild: ${guildId}${optionsStr}${resultStr}`);

  // Verifica se deve logar no Discord (apenas tipo 'commands' ou 'all')
  const commandLogs = getCommandLogs(guildId, 'commands') || getCommandLogs(guildId, 'all');
  if (!commandLogs || !client) return;

  // Verifica se deve logar este comando específico
  // Se commands é null, loga tudo (geral)
  // Se commands é array, só loga se o comando estiver na lista
  if (commandLogs.commands !== null && !commandLogs.commands.includes(commandName)) {
    return; // Não deve logar este comando
  }

  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const logChannel = await guild.channels.fetch(commandLogs.channelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📝 Comando Executado: /${commandName}`)
      .addFields(
        {
          name: "👤 Usuário",
          value: `<@${user.id}> (${user.tag})`,
          inline: true,
        },
        {
          name: "🆔 ID",
          value: user.id,
          inline: true,
        },
        {
          name: "⏰ Timestamp",
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true,
        }
      )
      .setTimestamp();

    if (options && Object.keys(options).length > 0) {
      const optionsText = Object.entries(options)
        .map(([key, value]) => `**${key}**: ${value}`)
        .join("\n");
      embed.addFields({
        name: "⚙️ Opções",
        value: optionsText.substring(0, 1024) || "Nenhuma",
        inline: false,
      });
    }

    if (result) {
      embed.addFields({
        name: "📊 Resultado",
        value: result.substring(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] }).catch(() => {
      // Silenciosamente falha se não conseguir enviar
    });
  } catch (err) {
    // Silenciosamente falha se houver erro
  }
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

  // Log no canal do Discord (se configurado - tipo 'protection' ou 'all')
  const protectionLogs = getCommandLogs(guildId, 'protection') || getCommandLogs(guildId, 'all');
  if (protectionLogs && protectionLogs.channelId && client) {
    const logChannelId = protectionLogs.channelId;
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

  // Log no canal do Discord (se configurado - tipo 'protection' ou 'all')
  const protectionLogs = getCommandLogs(guildId, 'protection') || getCommandLogs(guildId, 'all');
  if (protectionLogs && protectionLogs.channelId && client) {
    const logChannelId = protectionLogs.channelId;
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

/**
 * Log de tentativa de bypass (trigger tentou entrar durante cooldown ou após proteção)
 */
export async function logBypassAttempt(
  client,
  guildId,
  target,
  trigger,
  channel,
  reason = "Tentativa de bypass"
) {
  const message = `⚠️ Tentativa de bypass: **${trigger.tag || trigger.username || trigger.id}** tentou entrar no canal <#${channel.id}> (${reason})`;

  // Log no console
  console.log(message);

  // Log no canal do Discord (se configurado - tipo 'protection' ou 'all')
  const protectionLogs = getCommandLogs(guildId, 'protection') || getCommandLogs(guildId, 'all');
  if (protectionLogs && protectionLogs.channelId && client) {
    const logChannelId = protectionLogs.channelId;
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const embed = {
        color: 0xffaa00, // Laranja
        title: "⚠️ Tentativa de Bypass",
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
            name: "🔍 Motivo",
            value: reason,
            inline: false,
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

/**
 * Log de interferência externa (bot desconectado por outro bot)
 */
export async function logExternalInterference(
  client,
  guildId,
  channelId,
  reason = "Bot desconectado inesperadamente"
) {
  const message = `🚨 Interferência Externa: ${reason} no canal <#${channelId}>`;

  // Log no console
  console.warn(message);

  // Log no canal do Discord (se configurado - tipo 'protection' ou 'all')
  const protectionLogs = getCommandLogs(guildId, 'protection') || getCommandLogs(guildId, 'all');
  if (protectionLogs && protectionLogs.channelId && client) {
    const logChannelId = protectionLogs.channelId;
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const embed = {
        color: 0xff0000, // Vermelho
        title: "🚨 Interferência Externa Detectada",
        description: message,
        fields: [
          {
            name: "📢 Canal",
            value: `<#${channelId}>`,
            inline: true,
          },
          {
            name: "🔍 Motivo",
            value: reason,
            inline: false,
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

/**
 * Log de recuperação automática (bot reconectou e retomou proteções)
 */
export async function logRecovery(
  client,
  guildId,
  channelId,
  protectionCount
) {
  const message = `✅ Recuperação Automática: Bot reconectou e retomou ${protectionCount} proteção(ões) no canal <#${channelId}>`;

  // Log no console
  console.log(message);

  // Log no canal do Discord (se configurado - tipo 'protection' ou 'all')
  const protectionLogs = getCommandLogs(guildId, 'protection') || getCommandLogs(guildId, 'all');
  if (protectionLogs && protectionLogs.channelId && client) {
    const logChannelId = protectionLogs.channelId;
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      const embed = {
        color: 0x00ff00, // Verde
        title: "✅ Recuperação Automática",
        description: message,
        fields: [
          {
            name: "📢 Canal",
            value: `<#${channelId}>`,
            inline: true,
          },
          {
            name: "🛡️ Proteções Retomadas",
            value: protectionCount.toString(),
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
