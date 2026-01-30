import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { connectToChannel, playTTS, isPlayingAudio, getCurrentChannel } from "../utils/voiceManager.js";
import { isOwner } from "../config/env.js";
import { getUserLanguage, setUserLanguage } from "../state/userConfigs.js";
import { getNarradorSayUser } from "../state/guildConfigs.js";

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
    )
    .addSubcommand(sub =>
      sub
        .setName("toggle")
        .setDescription("Ativa/desativa se o bot fala o nome de quem enviou a mensagem")
        .addStringOption(opt =>
          opt
            .setName("user")
            .setDescription("Toggle para falar nome do usuário")
            .setRequired(true)
            .addChoices(
              { name: "Ativado", value: "on" },
              { name: "Desativado", value: "off" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("info")
        .setDescription("Mostra configurações atuais do narrador")
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === "language") {
        const language = interaction.options.getString("idioma");
        const userId = interaction.user.id;

        const wasChanged = setUserLanguage(userId, language);
        const languageName = SUPPORTED_LANGUAGES.find(l => l.value === language)?.name || language;

        console.log(`[NARRADOR] Language | User: ${interaction.user.tag} (${userId}) | Language: ${language} (${languageName}) | Changed: ${wasChanged}`);

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
        const userId = interaction.user.id;
        const member = interaction.member;

        // Canal de voz: usuário em call OU owner usando canal onde o bot já está
        let channel = member.voice?.channel;
        if (!channel) {
          if (!isOwner(interaction.user.id)) {
            return interaction.editReply(
              "❌ Você precisa estar em um canal de voz para usar este comando."
            );
          }
          const currentChannelId = getCurrentChannel(guildId);
          if (!currentChannelId) {
            return interaction.editReply(
              "❌ O bot não está em nenhum canal. Use /join primeiro ou entre em um canal."
            );
          }
          // Owner: bot já está em um canal, não precisa conectar
        } else {
          if (!channel.joinable) {
            return interaction.editReply(
              "❌ Não tenho permissão para entrar neste canal de voz."
            );
          }
        }

        // Verifica se já está reproduzindo
        if (isPlayingAudio(guildId)) {
          return interaction.editReply(
            "⏳ Já estou narrando uma mensagem. Aguarde a conclusão."
          );
        }

        // Conecta ao canal do usuário (owner sem call: bot já conectado)
        if (channel) {
          try {
            await connectToChannel(channel);
          } catch (error) {
            console.error("Erro ao conectar ao canal:", error);
            return interaction.editReply(
              `❌ Erro ao entrar no canal de voz: ${error.message}`
            );
          }
        }

        // Busca idioma do usuário
        const language = getUserLanguage(userId);

        // Verifica se deve falar o nome do usuário
        const sayUser = getNarradorSayUser(guildId);
        let finalText = text;
        
        if (sayUser) {
          const userDisplayName = member.displayName || member.user.displayName || member.user.username;
          finalText = `${userDisplayName} disse: ${text}`;
        }

        try {
          // Responde que está processando
          await interaction.editReply(
            `🔊 Narrando mensagem em **${SUPPORTED_LANGUAGES.find(l => l.value === language)?.name || language}**...`
          );

          console.log(`[NARRADOR] Mensagem | Guild: ${guildId} | User: ${interaction.user.tag} (${userId}) | Language: ${language} | SayUser: ${sayUser} | TextLength: ${text.length} | FinalLength: ${finalText.length}`);

          // Reproduz TTS
          await playTTS(guildId, finalText, language);

          // Atualiza resposta com sucesso
          await interaction.editReply(
            `✅ Mensagem narrada com sucesso!`
          );
        } catch (error) {
          console.error(`[NARRADOR] Erro | Guild: ${guildId} | User: ${interaction.user.tag} (${userId}) | Error:`, error);
          return interaction.editReply(
            `❌ Erro ao narrar mensagem: ${error.message}`
          );
        }
      }

      if (subcommand === "toggle") {
        const toggleValue = interaction.options.getString("user");
        const enabled = toggleValue === "on";
        
        const { setNarradorSayUser } = await import("../state/guildConfigs.js");
        const wasChanged = setNarradorSayUser(guildId, enabled);
        
        console.log(`[NARRADOR] Toggle User | Guild: ${guildId} | User: ${interaction.user.tag} (${interaction.user.id}) | Enabled: ${enabled} | Changed: ${wasChanged}`);
        
        if (wasChanged) {
          return interaction.editReply(
            `✅ Narrador agora está ${enabled ? "**falando o nome**" : "**não falando o nome**"} de quem enviou a mensagem.`
          );
        } else {
          return interaction.editReply(
            `ℹ️ Narrador já estava configurado para ${enabled ? "**falar o nome**" : "**não falar o nome**"} do usuário.`
          );
        }
      }

      if (subcommand === "info") {
        const userId = interaction.user.id;
        const language = getUserLanguage(userId);
        const languageName = SUPPORTED_LANGUAGES.find(l => l.value === language)?.name || language;
        const sayUser = getNarradorSayUser(guildId);

        const embed = new EmbedBuilder()
          .setTitle("📋 Configurações do Narrador")
          .setColor(0x5865F2)
          .setTimestamp()
          .addFields(
            {
              name: "🌐 Seu Idioma",
              value: `**${languageName}**`,
              inline: true,
            },
            {
              name: "👤 Falar Nome do Usuário",
              value: sayUser ? "**Ativado**" : "**Desativado**",
              inline: true,
            }
          );

        return interaction.editReply({ embeds: [embed] });
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
