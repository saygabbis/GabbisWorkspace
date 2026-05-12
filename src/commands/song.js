import { SlashCommandBuilder } from "discord.js";
import {
  addSong,
  removeSong,
  getSong,
  getSongByIndex,
  getSongs,
  getSongCount,
  clearAllSongs,
} from "../state/songboard.js";
import { createMediaCommand } from "../utils/mediaLibrary.js";

const mediaCommand = createMediaCommand({
  commandName: "song",
  title: "🎵 Lista de Músicas do Servidor",
  libraryLabel: "Música",
  getItems: getSongs,
  getItem: getSong,
  getItemByIndex: getSongByIndex,
  getItemCount: getSongCount,
  addItem: addSong,
  removeItem: removeSong,
  clearItems: clearAllSongs,
  unlimitedDuration: true,
});

export default {
  data: new SlashCommandBuilder()
    .setName("song")
    .setDescription("Sistema de músicas por servidor")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona uma música à lista do servidor")
        .addStringOption((opt) =>
          opt.setName("nome").setDescription("Nome da música").setRequired(true).setMaxLength(80)
        )
        .addStringOption((opt) =>
          opt.setName("emoji").setDescription("Emoji para a música").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("arquivo").setDescription("Arquivo MP3/áudio da música")
        )
        .addStringOption((opt) =>
          opt.setName("link").setDescription("Link da música ou do arquivo de áudio")
        )
        .addIntegerOption((opt) =>
          opt.setName("in").setDescription("Ponto de início em milissegundos").setRequired(false).setMinValue(0)
        )
        .addIntegerOption((opt) =>
          opt.setName("out").setDescription("Duração máxima em milissegundos").setRequired(false).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove uma música")
        .addStringOption((opt) =>
          opt.setName("nome").setDescription("Nome da música").setRequired(false).setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("numero").setDescription("Número da música na lista").setRequired(false).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Reproduz uma música")
        .addStringOption((opt) =>
          opt.setName("nome").setDescription("Nome da música").setRequired(false).setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("numero").setDescription("Número da música na lista").setRequired(false).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista as músicas do servidor")
        .addIntegerOption((opt) =>
          opt.setName("pagina").setDescription("Página da lista para abrir").setRequired(false).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("settings").setDescription("Configurações da lista de músicas")
        .addIntegerOption((opt) =>
          opt.setName("duracao").setDescription("Duração máxima em segundos").setRequired(false).setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt.setName("volume").setDescription("Volume (1-200)").setRequired(false).setMinValue(1).setMaxValue(200)
        )
        .addBooleanOption((opt) =>
          opt.setName("clear").setDescription("Limpar todas as músicas").setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt.setName("timeout").setDescription("Timeout dos botões em segundos (30+ ou 0)").setRequired(false).setMinValue(0)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "add") return mediaCommand.handleAdd(interaction);
    if (subcommand === "remove") return mediaCommand.handleRemove(interaction);
    if (subcommand === "play") return mediaCommand.handlePlay(interaction);
    if (subcommand === "list") return mediaCommand.handleList(interaction);
    if (subcommand === "settings") return mediaCommand.handleSettings(interaction);
  },
};
