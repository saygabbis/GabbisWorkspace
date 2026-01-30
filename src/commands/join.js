import { SlashCommandBuilder, MessageFlags, ChannelType } from "discord.js";
import { connectToChannel } from "../utils/voiceManager.js";
import { isOwner } from "../config/env.js";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Faz o bot entrar no canal de voz que você está")
    .addChannelOption((opt) =>
      opt
        .setName("canal")
        .setDescription("Canal de voz para o bot entrar (opcional)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildVoice)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const member = interaction.member;
      const channelOpt = interaction.options.getChannel("canal");

      // Opção "canal" preenchida: apenas owner pode usar (conectar bot na call escolhida sem estar nela)
      if (channelOpt) {
        if (!isOwner(interaction.user.id)) {
          return interaction.editReply(
            "❌ Você precisa estar em um canal de voz para usar este comando."
          );
        }
        if (!channelOpt.joinable) {
          return interaction.editReply(
            "❌ Não tenho permissão para entrar neste canal de voz."
          );
        }
        try {
          await connectToChannel(channelOpt);
          console.log(`[VOICE] Join (owner) | Guild: ${interaction.guild.id} | User: ${interaction.user.id} | Channel: ${channelOpt.name} (${channelOpt.id})`);
          return interaction.editReply(
            `✅ Entrei no canal de voz: **${channelOpt.name}**`
          );
        } catch (error) {
          console.error(`[VOICE] Join Error | Guild: ${interaction.guild.id} | User: ${interaction.user.id}:`, error);
          return interaction.editReply(
            `❌ Erro ao entrar no canal de voz: ${error.message}`
          );
        }
      }

      // Sem opção canal: usuário precisa estar em um canal de voz
      if (!member.voice?.channel) {
        return interaction.editReply(
          "❌ Você precisa estar em um canal de voz para usar este comando."
        );
      }

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
