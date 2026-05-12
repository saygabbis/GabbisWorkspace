import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  addSound,
  removeSound,
  getSound,
  getSoundByIndex,
  getSounds,
  getSoundCount,
  clearAllSounds,
} from "../state/soundboard.js";
import { createMediaCommand } from "../utils/mediaLibrary.js";

const mediaCommand = createMediaCommand({
  commandName: "sound",
  title: "📋 Soundboard do Servidor",
  libraryLabel: "Som",
  getItems: getSounds,
  getItem: getSound,
  getItemByIndex: getSoundByIndex,
  getItemCount: getSoundCount,
  addItem: addSound,
  removeItem: removeSound,
  clearItems: clearAllSounds,
});

export default {
  data: new SlashCommandBuilder()
    .setName("sound")
    .setDescription("Sistema de soundboard por servidor")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um som ao soundboard do servidor")
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome do som")
            .setRequired(true)
            .setMaxLength(50)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Emoji para o som")
            .setRequired(true)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("arquivo")
            .setDescription("Arquivo de áudio a adicionar")
        )
        .addStringOption((opt) =>
          opt
            .setName("link")
            .setDescription("URL do arquivo de áudio")
        )
        .addIntegerOption((opt) =>
          opt
            .setName("in")
            .setDescription("Ponto de início do áudio em milissegundos (opcional)")
            .setRequired(false)
            .setMinValue(0)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("out")
            .setDescription("Duração máxima a reproduzir em milissegundos (opcional)")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um som do soundboard")
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome do som a remover")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("numero")
            .setDescription("Número do som na lista (1, 2, 3...)")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Reproduz um som do soundboard")
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome do som a reproduzir")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("numero")
            .setDescription("Número do som na lista (1, 2, 3...)")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista todos os sons do servidor")
        .addIntegerOption((opt) =>
          opt
            .setName("pagina")
            .setDescription("Página da lista para abrir")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("Para a reprodução atual do soundboard")
    )
    .addSubcommand((sub) =>
      sub
        .setName("settings")
        .setDescription("Configurações do soundboard")
        .addIntegerOption((opt) =>
          opt
            .setName("duracao")
            .setDescription("Duração máxima em segundos")
            .setRequired(false)
            .setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("volume")
            .setDescription("Volume do soundboard (1-200)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(200)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("clear")
            .setDescription("Limpar todos os áudios (apenas admin)")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("timeout")
            .setDescription("Timeout dos botões da lista em segundos (30+ ou 0 para ilimitado)")
            .setRequired(false)
            .setMinValue(0)
        ),
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "add") {
        return mediaCommand.handleAdd(interaction);
      }

      if (subcommand === "remove") {
        return mediaCommand.handleRemove(interaction);
      }

      if (subcommand === "play") {
        return mediaCommand.handlePlay(interaction);
      }

      if (subcommand === "list") {
        return mediaCommand.handleList(interaction);
      }

      if (subcommand === "settings") {
        return mediaCommand.handleSettings(interaction);
      }

      if (subcommand === "stop") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return interaction.editReply("⏹️ Use o botão Parar da lista ou mantenha o fluxo atual deste comando depois, se quiser eu também espelho aqui.");
      }
    } catch (error) {
      console.error("Erro no comando sound:", error);
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
