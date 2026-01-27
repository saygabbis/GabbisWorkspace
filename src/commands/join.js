import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { connectToChannel } from "../utils/voiceManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Faz o bot entrar no canal de voz que você está"),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const member = interaction.member;

      // Verifica se o usuário está em um canal de voz
      if (!member.voice?.channel) {
        return interaction.editReply(
          "❌ Você precisa estar em um canal de voz para usar este comando."
        );
      }

      // Verifica se o bot pode se conectar ao canal
      const channel = member.voice.channel;
      if (!channel.joinable) {
        return interaction.editReply(
          "❌ Não tenho permissão para entrar neste canal de voz."
        );
      }

      try {
        await connectToChannel(channel);
        console.log(`[VOICE] Join | Guild: ${interaction.guild.id} | User: ${interaction.user.id} | Channel: ${channel.name} (${channel.id})`);
        return interaction.editReply(
          `✅ Entrei no canal de voz: **${channel.name}**`
        );
      } catch (error) {
        console.error(`[VOICE] Join Error | Guild: ${interaction.guild.id} | User: ${interaction.user.id}:`, error);
        return interaction.editReply(
          `❌ Erro ao entrar no canal de voz: ${error.message}`
        );
      }
    } catch (error) {
      console.error("Erro no comando join:", error);
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
