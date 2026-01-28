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
            .setName("type")
            .setDescription("Tipo de log a configurar")
            .setRequired(false)
            .addChoices(
              { name: "Comandos", value: "commands" },
              { name: "Proteção", value: "protection" },
              { name: "Todos (Comandos + Proteção)", value: "all" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Comando específico para logar (apenas para tipo Comandos, deixe vazio para logar tudo)")
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
            .setName("type")
            .setDescription("Tipo de log a remover")
            .setRequired(false)
            .addChoices(
              { name: "Comandos", value: "commands" },
              { name: "Proteção", value: "protection" },
              { name: "Todos", value: "all" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Comando específico para remover (apenas para tipo Comandos, deixe vazio para remover log geral)")
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
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const isUserOwner = isOwner(userId);
      const isUserAdmin = interaction.member.permissions.has(
        PermissionFlagsBits.Administrator
      );

      // /logs view deve ser público; os demais subcomandos podem ser ephemerais
      if (subcommand === "view") {
        await interaction.deferReply(); // resposta pública
      } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      if (!isUserOwner && !isUserAdmin) {
        return interaction.editReply(
          "❌ Você precisa ser **administrador** ou **owner do bot** para gerenciar logs."
        );
      }

      if (subcommand === "add") {
        const channel = interaction.options.getChannel("channel");
        const logType = interaction.options.getString("type") || "commands";
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

        // Validação: comando específico só é permitido para tipo 'commands'
        if (commandName && logType !== "commands") {
          return interaction.editReply(
            "❌ Logs por comando específico só são suportados para o tipo **Comandos**."
          );
        }

        let commands = null;
        if (commandName) {
          commands = [commandName];
        }

        const result = setCommandLogs(guildId, channel.id, commands, logType);

        if (!result.success) {
          return interaction.editReply(`❌ ${result.error || "Erro ao configurar logs."}`);
        }

        const typeNames = {
          commands: "Comandos",
          protection: "Proteção",
          all: "Todos (Comandos + Proteção)"
        };
        const typeName = typeNames[logType] || logType;

        if (commandName) {
          // Log específico
          if (result.replaced) {
            return interaction.editReply(
              `✅ Log específico configurado para <#${channel.id}>.\n` +
                `📌 Tipo: **${typeName}**\n` +
                `📌 Agora logando o comando **/${commandName}** (log geral anterior foi substituído).`
            );
          } else {
            return interaction.editReply(
              `✅ Log específico adicionado para <#${channel.id}>.\n` +
                `📌 Tipo: **${typeName}**\n` +
                `📌 Agora logando o comando **/${commandName}**.`
            );
          }
        } else {
          // Log geral
          return interaction.editReply(
            `✅ Canal de logs configurado para <#${channel.id}>.\n` +
              `📌 Tipo: **${typeName}**\n` +
              `📌 Agora logando ${logType === "commands" ? "**todos os comandos**" : logType === "protection" ? "**eventos de proteção**" : "**todos os eventos (comandos + proteção)**"} do bot${result.replaced ? " (logs anteriores foram substituídos)" : ""}.`
          );
        }
      }

      if (subcommand === "remove") {
        const logType = interaction.options.getString("type");
        const commandName = interaction.options.getString("command");

        // Validação: comando específico só é permitido para tipo 'commands'
        if (commandName && logType && logType !== "commands") {
          return interaction.editReply(
            "❌ Logs por comando específico só são suportados para o tipo **Comandos**."
          );
        }

        const removed = removeCommandLogs(guildId, commandName, logType || null);

        if (!removed) {
          const typeNames = {
            commands: "Comandos",
            protection: "Proteção",
            all: "Todos"
          };
          const typeText = logType ? ` do tipo **${typeNames[logType] || logType}**` : "";
          
          return interaction.editReply(
            commandName
              ? `❌ Não há log configurado para o comando **/${commandName}**${typeText}.`
              : `❌ Não há log geral configurado${typeText}.`
          );
        }

        const typeNames = {
          commands: "Comandos",
          protection: "Proteção",
          all: "Todos"
        };
        const typeText = logType ? ` do tipo **${typeNames[logType] || logType}**` : "";

        return interaction.editReply(
          commandName
            ? `✅ Log removido para o comando **/${commandName}**${typeText}.`
            : `✅ Log geral removido com sucesso${typeText}.`
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

          const typeNames = {
            commands: "Comandos",
            protection: "Proteção",
            all: "Todos (Comandos + Proteção)"
          };
          const typeName = typeNames[commandLogs.type] || commandLogs.type || "Desconhecido";

          embed.addFields({
            name: "📢 Canal",
            value: channel ? `<#${commandLogs.channelId}>` : `❌ Canal não encontrado (${commandLogs.channelId})`,
            inline: true,
          });

          embed.addFields({
            name: "🔖 Tipo",
            value: `**${typeName}**`,
            inline: true,
          });

          if (commandLogs.type === "commands" || commandLogs.type === "all") {
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
          } else if (commandLogs.type === "protection") {
            embed.addFields({
              name: "📝 Escopo",
              value: "**Eventos de proteção** (log geral)",
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
