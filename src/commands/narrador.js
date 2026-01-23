import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { connectToChannel, disconnectFromChannel, playTTS, isConnected, getCurrentChannel, isPlayingAudio } from "../utils/voiceManager.js";
import { getUserLanguage, setUserLanguage } from "../state/userConfigs.js";

// Lista de idiomas suportados
const SUPPORTED_LANGUAGES = [
  { name: "Português (Brasil)", value: "pt-BR" },
  { name: "English (US)", value: "en-US" },
  { name: "Español", value: "es-ES" },
  { name: "Français", value: "fr-FR" },
  { name: "Deutsch", value: "de-DE" },
  { name: "Italiano", value: "it-IT" },
  { name: "日本語", value: "ja-JP" },
  { name: "한국어", value: "ko-KR" },
  { name: "中文", value: "zh-CN" },
];

export default {
  data: new SlashCommandBuilder()
    .setName("narrador")
    .setDescription("Sistema de narração de texto em canais de voz")
    .addSubcommand(sub =>
      sub
        .setName("join")
        .setDescription("Entra no canal de voz atual do usuário")
    )
    .addSubcommand(sub =>
      sub
        .setName("leave")
        .setDescription("Sai do canal de voz atual")
    )
    .addSubcommand(sub =>
      sub
        .setName("language")
        .setDescription("Define o idioma de narração")
        .addStringOption(opt =>
          opt
            .setName("idioma")
            .setDescription("Idioma para narração")
            .setRequired(true)
            .addChoices(...SUPPORTED_LANGUAGES)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("mensagem")
        .setDescription("Narra uma mensagem de texto no canal de voz")
        .addStringOption(opt =>
          opt
            .setName("texto")
            .setDescription("Texto a ser narrado")
            .setRequired(true)
            .setMaxLength(500)
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "join") {
        // Verifica se o usuário está em um canal de voz
        const member = interaction.member;
        if (!member.voice.channel) {
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
          return interaction.editReply(
            `✅ Entrei no canal de voz: **${channel.name}**`
          );
        } catch (error) {
          console.error("Erro ao conectar ao canal:", error);
          return interaction.editReply(
            `❌ Erro ao entrar no canal de voz: ${error.message}`
          );
        }
      }

      if (subcommand === "leave") {
        const guildId = interaction.guild.id;
        
        if (!isConnected(guildId)) {
          return interaction.editReply(
            "⚠️ Não estou conectado a nenhum canal de voz."
          );
        }

        const disconnected = disconnectFromChannel(guildId);
        if (disconnected) {
          return interaction.editReply("✅ Saí do canal de voz.");
        } else {
          return interaction.editReply(
            "❌ Erro ao sair do canal de voz."
          );
        }
      }

      if (subcommand === "language") {
        const language = interaction.options.getString("idioma");
        const userId = interaction.user.id;

        const wasChanged = setUserLanguage(userId, language);
        const languageName = SUPPORTED_LANGUAGES.find(l => l.value === language)?.name || language;

        if (wasChanged) {
          return interaction.editReply(
            `✅ Idioma de narração definido para: **${languageName}**`
          );
        } else {
          return interaction.editReply(
            `ℹ️ Seu idioma já estava configurado como: **${languageName}**`
          );
        }
      }

      if (subcommand === "mensagem") {
        const text = interaction.options.getString("texto");
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Verifica se o bot está conectado
        if (!isConnected(guildId)) {
          return interaction.editReply(
            "❌ Não estou conectado a um canal de voz. Use `/narrador join` primeiro."
          );
        }

        // Verifica se já está reproduzindo
        if (isPlayingAudio(guildId)) {
          return interaction.editReply(
            "⏳ Já estou narrando uma mensagem. Aguarde a conclusão."
          );
        }

        // Busca idioma do usuário
        const language = getUserLanguage(userId);

        try {
          // Responde que está processando
          await interaction.editReply(
            `🔊 Narrando mensagem em **${SUPPORTED_LANGUAGES.find(l => l.value === language)?.name || language}**...`
          );

          // Reproduz TTS
          await playTTS(guildId, text, language);

          // Atualiza resposta com sucesso
          await interaction.editReply(
            `✅ Mensagem narrada com sucesso!`
          );
        } catch (error) {
          console.error("Erro ao narrar mensagem:", error);
          return interaction.editReply(
            `❌ Erro ao narrar mensagem: ${error.message}`
          );
        }
      }
    } catch (error) {
      console.error("Erro no comando narrador:", error);
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
