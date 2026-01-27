import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import {
  setCommandLogs,
  removeCommandLogs,
  getCommandLogs,
} from "../state/guildConfigs.js";
import { isOwner } from "../config/env.js";

export default {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Gerencia logs de comandos do bot")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um canal para logs")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Canal para enviar os logs")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Comando específico para logar (deixe vazio para logar tudo)")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove logs de comandos")
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Comando específico para remover (deixe vazio para remover log geral)")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Visualiza configuração atual de logs")
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const isUserOwner = isOwner(userId);
      const isUserAdmin = interaction.member.permissions.has(
        PermissionFlagsBits.Administrator
      );

      if (!isUserOwner && !isUserAdmin) {
        return interaction.editReply(
          "❌ Você precisa ser **administrador** ou **owner do bot** para gerenciar logs."
        );
      }

      if (subcommand === "add") {
        const channel = interaction.options.getChannel("channel");
        const commandName = interaction.options.getString("command");

        if (!channel.isTextBased()) {
          return interaction.editReply(
            "❌ O canal precisa ser um canal de texto."
          );
        }

        // Verifica permissões do bot no canal
        const botMember = interaction.guild.members.me;
        const permissions = channel.permissionsFor(botMember);
        if (!permissions.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
          return interaction.editReply(
            "❌ Não tenho permissão para enviar mensagens neste canal. Preciso de: Ver Canal, Enviar Mensagens e Incorporar Links."
          );
        }

        let commands = null;
        if (commandName) {
          commands = [commandName];
        }

        const result = setCommandLogs(guildId, channel.id, commands);

        if (commandName) {
          // Log específico
          if (result.replaced) {
            return interaction.editReply(
              `✅ Log específico configurado para <#${channel.id}>.\n` +
                `📌 Agora logando o comando **/${commandName}** (log geral anterior foi substituído).`
            );
          } else {
            return interaction.editReply(
              `✅ Log específico adicionado para <#${channel.id}>.\n` +
                `📌 Agora logando o comando **/${commandName}**.`
            );
          }
        } else {
          // Log geral
          return interaction.editReply(
            `✅ Canal de logs configurado para <#${channel.id}>.\n` +
              `📌 Agora logando **todos os comandos** do bot${result.replaced ? " (logs específicos anteriores foram substituídos)" : ""}.`
          );
        }
      }

      if (subcommand === "remove") {
        const commandName = interaction.options.getString("command");

        const removed = removeCommandLogs(guildId, commandName);

        if (!removed) {
          return interaction.editReply(
            commandName
              ? `❌ Não há log configurado para o comando **/${commandName}**.`
              : `❌ Não há log geral configurado.`
          );
        }

        return interaction.editReply(
          commandName
            ? `✅ Log removido para o comando **/${commandName}**.`
            : `✅ Log geral removido com sucesso.`
        );
      }

      if (subcommand === "view") {
        const commandLogs = getCommandLogs(guildId);

        const embed = new EmbedBuilder()
          .setTitle("📋 Configuração de Logs")
          .setColor(0x5865F2)
          .setTimestamp();

        if (!commandLogs) {
          embed.setDescription("❌ Nenhum log configurado.");
        } else {
          const channel = await interaction.guild.channels
            .fetch(commandLogs.channelId)
            .catch(() => null);

          embed.addFields({
            name: "📢 Canal",
            value: channel ? `<#${commandLogs.channelId}>` : `❌ Canal não encontrado (${commandLogs.channelId})`,
            inline: false,
          });

          if (commandLogs.commands === null) {
            embed.addFields({
              name: "📝 Escopo",
              value: "**Todos os comandos** (log geral)",
              inline: false,
            });
          } else if (commandLogs.commands.length === 0) {
            embed.setDescription("⚠️ Configuração inválida: canal configurado mas sem comandos.");
          } else {
            embed.addFields({
              name: "📝 Comandos Logados",
              value: commandLogs.commands.map((c) => `\`/${c}\``).join(", "),
              inline: false,
            });
          }
        }

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Erro no comando logs:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Erro interno ao executar o comando.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply("❌ Erro interno ao executar o comando.");
      }
    }
  },
};
