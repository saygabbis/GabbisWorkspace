import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { disconnectFromChannel, isConnected } from "../utils/voiceManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Faz o bot sair do canal de voz atual"),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guildId = interaction.guild.id;

      if (!isConnected(guildId)) {
        return interaction.editReply(
          "⚠️ Não estou conectado a nenhum canal de voz."
        );
      }

      const disconnected = disconnectFromChannel(guildId);
      if (disconnected) {
        console.log(`[VOICE] Leave | Guild: ${guildId} | User: ${interaction.user.id}`);
        return interaction.editReply("✅ Saí do canal de voz.");
      } else {
        return interaction.editReply(
          "❌ Erro ao sair do canal de voz."
        );
      }
    } catch (error) {
      console.error("Erro no comando leave:", error);
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
