import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { 
  addProtection, 
  removeProtection, 
  listProtections,
  setLogChannel,
  removeLogChannel
} from "../state/guildConfigs.js";
import { getGuildStats, getTopProtections } from "../utils/stats.js";

export default {
  data: new SlashCommandBuilder()
    .setName("protect")
    .setDescription("Sistema de proteção")
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Adiciona uma proteção")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Usuário protegido")
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Quem dispara a proteção")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove uma proteção")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Usuário protegido")
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Quem dispara a proteção")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Lista todas as proteções do servidor")
    )
    .addSubcommand(sub =>
      sub
        .setName("stats")
        .setDescription("Mostra estatísticas das proteções")
    )
    .addSubcommandGroup(group =>
      group
        .setName("logs")
        .setDescription("Gerencia canal de logs")
        .addSubcommand(sub =>
          sub
            .setName("add")
            .setDescription("Define o canal onde os logs aparecerão")
            .addChannelOption(opt =>
              opt
                .setName("channel")
                .setDescription("Canal de logs")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("remove")
            .setDescription("Remove o canal de logs configurado")
        )
    ),

  async execute(interaction) {
    try {
      // 🔹 avisa o Discord que vai responder
      await interaction.deferReply({ ephemeral: true });

      const sub = interaction.options.getSubcommand();
      const group = interaction.options.getSubcommandGroup();

      // Comandos de logs (apenas admins) - verificar primeiro para evitar conflito com subcomandos
      if (group === "logs") {
        // Verifica permissões de administrador
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.editReply(
            "❌ Você precisa ser administrador para usar este comando."
          );
        }

        const logsSub = interaction.options.getSubcommand();

        if (logsSub === "add") {
          const channel = interaction.options.getChannel("channel");

          if (!channel.isTextBased()) {
            return interaction.editReply(
              "❌ O canal deve ser um canal de texto."
            );
          }

          setLogChannel(interaction.guild.id, channel.id);

          return interaction.editReply(
            `✅ Canal de logs definido: ${channel}`
          );
        }

        if (logsSub === "remove") {
          const removed = removeLogChannel(interaction.guild.id);

          if (!removed) {
            return interaction.editReply(
              "⚠️ Nenhum canal de logs estava configurado."
            );
          }

          return interaction.editReply(
            "✅ Canal de logs removido."
          );
        }

        return interaction.editReply("❓ Subcomando de logs desconhecido.");
      }

      // Subcomandos principais
      if (sub === "add") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");

        const success = addProtection(
          interaction.guild.id,
          target.id,
          trigger.id
        );

        if (!success) {
          return interaction.editReply(
            "⚠️ Essa proteção já existe."
          );
        }

        return interaction.editReply(
          `✅ Proteção criada: **${target.username}** protegido de **${trigger.username}**`
        );
      }

      if (sub === "remove") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");

        const success = removeProtection(
          interaction.guild.id,
          target.id,
          trigger.id
        );

        if (!success) {
          return interaction.editReply(
            "⚠️ Essa proteção não existe."
          );
        }

        return interaction.editReply(
          `✅ Proteção removida: **${target.username}** protegido de **${trigger.username}**`
        );
      }

      if (sub === "list") {
        const protections = listProtections(interaction.guild.id);

        if (protections.length === 0) {
          return interaction.editReply(
            "📋 Nenhuma proteção configurada neste servidor."
          );
        }

        // Busca os usuários para mostrar nomes e estatísticas
        const list = await Promise.all(
          protections.map(async (p, i) => {
            try {
              const trigger = await interaction.client.users.fetch(p.triggerId);
              const target = await interaction.client.users.fetch(p.targetId);
              const stats = p.stats || {};
              const activationCount = stats.activationCount || 0;
              const statsText = activationCount > 0 
                ? ` • ${activationCount} ativação(ões)`
                : "";
              return `${i + 1}. **${target.username}** protegido de **${trigger.username}** (${p.timeWindow}ms)${statsText}`;
            } catch (err) {
              // Fallback se não conseguir buscar o usuário
              const stats = p.stats || {};
              const activationCount = stats.activationCount || 0;
              const statsText = activationCount > 0 
                ? ` • ${activationCount} ativação(ões)`
                : "";
              return `${i + 1}. <@!${p.targetId}> protegido de <@!${p.triggerId}> (${p.timeWindow}ms)${statsText}`;
            }
          })
        );

        return interaction.editReply(
          `📋 **Proteções ativas (${protections.length}):**\n${list.join("\n")}`
        );
      }

      if (sub === "stats") {
        const guildStats = getGuildStats(interaction.guild.id);
        const topProtections = getTopProtections(interaction.guild.id, 5);

        let statsText = `📊 **Estatísticas do Servidor**\n\n`;
        statsText += `**Total de Proteções:** ${guildStats.totalProtections}\n`;
        statsText += `**Total de Ativações:** ${guildStats.totalActivations}\n`;
        statsText += `**Total de Desconexões:** ${guildStats.totalDisconnects}\n`;

        if (guildStats.lastActivation) {
          const lastActivationDate = new Date(guildStats.lastActivation);
          statsText += `**Última Ativação:** ${lastActivationDate.toLocaleString("pt-BR")}\n`;
        } else {
          statsText += `**Última Ativação:** Nunca\n`;
        }

        if (topProtections.length > 0) {
          statsText += `\n**🔝 Top 5 Proteções Mais Ativadas:**\n`;
          
          const topList = await Promise.all(
            topProtections.map(async (p, i) => {
              try {
                const trigger = await interaction.client.users.fetch(p.triggerId);
                const target = await interaction.client.users.fetch(p.targetId);
                return `${i + 1}. **${target.username}** → **${trigger.username}**: ${p.activationCount} ativação(ões)`;
              } catch (err) {
                return `${i + 1}. <@!${p.targetId}> → <@!${p.triggerId}>: ${p.activationCount} ativação(ões)`;
              }
            })
          );
          
          statsText += topList.join("\n");
        }

        return interaction.editReply(statsText);
      }

      await interaction.editReply("❓ Subcomando desconhecido.");

    } catch (err) {
      console.error("Erro no comando /protect:", err);

      // 🔴 fallback ABSOLUTO
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Erro interno no comando.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply("❌ Erro interno no comando.");
      }
    }
  },
};
