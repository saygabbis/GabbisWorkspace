import { SlashCommandBuilder } from "discord.js";
import { addProtection, removeProtection, listProtections } from "../state/guildConfigs.js";

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
    ),

  async execute(interaction) {
    try {
      // 🔹 avisa o Discord que vai responder
      await interaction.deferReply({ ephemeral: true });

      const sub = interaction.options.getSubcommand();

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

        // Busca os usuários para mostrar nomes
        const list = await Promise.all(
          protections.map(async (p, i) => {
            try {
              const trigger = await interaction.client.users.fetch(p.triggerId);
              const target = await interaction.client.users.fetch(p.targetId);
              return `${i + 1}. **${target.username}** protegido de **${trigger.username}** (${p.timeWindow}ms)`;
            } catch (err) {
              // Fallback se não conseguir buscar o usuário
              return `${i + 1}. <@!${p.targetId}> protegido de <@!${p.triggerId}> (${p.timeWindow}ms)`;
            }
          })
        );

        return interaction.editReply(
          `📋 **Proteções ativas (${protections.length}):**\n${list.join("\n")}`
        );
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
