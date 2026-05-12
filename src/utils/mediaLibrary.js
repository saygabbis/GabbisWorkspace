import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { isOwner } from "../config/env.js";
import {
  connectToChannel,
  getCurrentChannel,
  isPlayingAudio,
  playSoundFileImmediate,
  stopSound,
} from "./voiceManager.js";
import {
  downloadAttachment,
  downloadFromUrl,
  isValidAudioFormat,
  processAndSaveSound,
  deleteSoundFile,
  deleteAllSoundFiles,
  getSoundFilePath,
} from "./soundboardManager.js";
import {
  getMaxSoundDuration,
  getSoundboardVolume,
  getSoundListButtonTimeout,
  setMaxSoundDuration,
  setSoundboardVolume,
  setSoundListButtonTimeout,
} from "../state/guildConfigs.js";

const TEMP_DIR = path.join(os.tmpdir(), "gabbis-soundboard");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const ITEMS_PER_PAGE = 10;

function createListEmbed({ title, items, count, totalPages, page }) {
  const startIndex = page * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, count);
  const pageItems = items.slice(startIndex, endIndex);

  const itemList = pageItems
    .map((item, index) => {
      const globalIndex = startIndex + index;
      const duration = item.duration ? `${item.duration.toFixed(1)}s` : "N/A";
      const emojiDisplay = item.emoji ? `${item.emoji} ` : "";
      return `${globalIndex + 1}. ${emojiDisplay}**${item.name}** (${duration})`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(itemList || "Nenhum item")
    .setColor(0x5865F2)
    .setFooter({
      text: `Página ${page + 1} de ${totalPages} • Total: ${count} item${count !== 1 ? "s" : ""}`,
    })
    .setTimestamp();
}

function createPageComponents({ prefix, items, count, totalPages, page }) {
  const startIndex = page * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, count);
  const pageItems = items.slice(startIndex, endIndex);
  const rows = [];
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  pageItems.forEach((item, idx) => {
    const globalIndex = startIndex + idx;
    const labelNumber = globalIndex + 1;
    const button = new ButtonBuilder()
      .setCustomId(`${prefix}_list_play_${globalIndex}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(labelNumber.toString());

    if (idx < 5) {
      row1.addComponents(button);
    } else {
      row2.addComponents(button);
    }
  });

  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);

  const navRow = new ActionRowBuilder();

  if (totalPages > 1) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_list_first`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⏮️")
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${prefix}_list_prev`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⬅️")
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${prefix}_list_next`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("➡️")
        .setDisabled(page === totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`${prefix}_list_last`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⏭️")
        .setDisabled(page === totalPages - 1)
    );
  }

  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_list_stop`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⏹️")
      .setLabel("Parar")
  );

  rows.push(navRow);
  return rows;
}

export function createMediaCommand({
  commandName,
  title,
  libraryLabel,
  getItems,
  getItem,
  getItemByIndex,
  getItemCount,
  addItem,
  removeItem,
  clearItems,
  unlimitedDuration = false,
}) {
  return {
    async handleAdd(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const nome = interaction.options.getString("nome");
      const emoji = interaction.options.getString("emoji");
      const attachment = interaction.options.getAttachment("arquivo");
      const link = interaction.options.getString("link");
      const inMs = interaction.options.getInteger("in");
      const outMs = interaction.options.getInteger("out");

      if (!attachment && !link) {
        return interaction.editReply("❌ Você precisa fornecer um arquivo ou um link.");
      }

      if (getItem(guildId, nome)) {
        return interaction.editReply(`❌ Já existe um item com o nome "${nome}". Use outro nome.`);
      }

      if (attachment) {
        if (!isValidAudioFormat(attachment.name)) {
          return interaction.editReply(
            "❌ Formato de arquivo não suportado. Formatos aceitos: MP3, WAV, M4A, FLAC, AAC, OGG, WMA, OPUS, WEBM"
          );
        }

        if (attachment.size > 25 * 1024 * 1024) {
          return interaction.editReply("❌ Arquivo muito grande. Tamanho máximo: 25MB");
        }
      }

      if (link) {
        const hasAudioExtension = /\.(mp3|wav|m4a|flac|aac|ogg|wma|opus|webm|mpeg)(\?|$)/i.test(link);
        const supportedDomains = ["youtube.com", "youtu.be", "spotify.com", "open.spotify.com"];
        const hasSupportedDomain = supportedDomains.some((domain) => link.toLowerCase().includes(domain));

        if (!isValidAudioFormat(link) && !hasAudioExtension && !hasSupportedDomain) {
          return interaction.editReply(
            "❌ Link inválido. Envie um arquivo de áudio direto ou um link de YouTube/Spotify."
          );
        }
      }

      const serverMaxDuration = getMaxSoundDuration(guildId);
      let maxDuration = unlimitedDuration ? null : serverMaxDuration;
      const isUserOwner = isOwner(userId);
      const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!unlimitedDuration && !isUserOwner && !isUserAdmin) {
        maxDuration = Math.min(serverMaxDuration, 15);
      }

      let startTimeSeconds = null;
      let maxDurationSeconds = maxDuration;

      if (inMs !== null) {
        startTimeSeconds = inMs / 1000;
      }

      if (outMs !== null) {
        const outSeconds = outMs / 1000;
        if (maxDuration !== null && outSeconds > maxDuration) {
          return interaction.editReply(
            `❌ A duração solicitada (${outSeconds.toFixed(2)}s) ultrapassa o limite permitido de ${maxDuration}s.`
          );
        }
        maxDurationSeconds = maxDuration === null ? outSeconds : Math.min(maxDuration, outSeconds);
      }

      if (inMs !== null && outMs === null) {
        maxDurationSeconds = maxDuration;
      }

      try {
        await interaction.editReply("⏳ Processando arquivo de áudio... Isso pode levar alguns segundos.");

        const itemId = randomUUID();
        const tempInputPath = path.join(
          TEMP_DIR,
          `${commandName}_${itemId}_${Date.now()}${attachment ? path.extname(attachment.name) : ".tmp"}`
        );

        if (attachment) {
          await downloadAttachment(attachment, tempInputPath);
        } else {
          await downloadFromUrl(link, tempInputPath);
        }

        const { duration } = await processAndSaveSound(
          guildId,
          tempInputPath,
          itemId,
          maxDurationSeconds,
          startTimeSeconds
        );

        if (fs.existsSync(tempInputPath)) {
          fs.unlinkSync(tempInputPath);
        }

        const itemData = {
          id: itemId,
          name: nome,
          emoji: emoji || null,
          filename: `${itemId}.opus`,
          addedBy: userId,
          addedAt: Date.now(),
          duration,
          sourceUrl: link || null,
        };

        const result = addItem(guildId, itemData);
        if (!result.success) {
          deleteSoundFile(guildId, itemId);
          return interaction.editReply(`❌ ${result.error}`);
        }

        const newIndex = getItemCount(guildId);
        let durationInfo = `Duração: ${duration.toFixed(1)}s`;
        if (inMs !== null || outMs !== null) {
          const parts = [];
          if (inMs !== null) parts.push(`in: ${(inMs / 1000).toFixed(2)}s`);
          if (outMs !== null) parts.push(`out: ${(outMs / 1000).toFixed(2)}s`);
          durationInfo += ` (${parts.join(", ")})`;
        }

        return interaction.editReply(
          `✅ ${libraryLabel} "${nome}" adicionado com sucesso como **#${newIndex}**! (${durationInfo})`
        );
      } catch (error) {
        return interaction.editReply(`❌ Erro ao processar arquivo: ${error.message}`);
      }
    },

    async handleRemove(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guildId = interaction.guild.id;
      const nome = interaction.options.getString("nome");
      const numero = interaction.options.getInteger("numero");

      if (!nome && !numero) {
        return interaction.editReply(`❌ Você precisa fornecer um **nome** ou **número** do ${libraryLabel.toLowerCase()} para remover.`);
      }

      let targetName = nome;
      if (numero !== null) {
        const item = getItemByIndex(guildId, numero);
        if (!item) {
          return interaction.editReply(`❌ Item número ${numero} não encontrado.`);
        }
        targetName = item.name;
      }

      const result = removeItem(guildId, targetName);
      if (!result.success) {
        return interaction.editReply(`❌ ${result.error}`);
      }

      if (result.sound) {
        deleteSoundFile(guildId, result.sound.id);
      }

      return interaction.editReply(`✅ ${libraryLabel} "${result.sound.name}" removido com sucesso!`);
    },

    async handlePlay(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guildId = interaction.guild.id;
      const nome = interaction.options.getString("nome");
      const numero = interaction.options.getInteger("numero");

      if (!nome && !numero) {
        return interaction.editReply(`❌ Você precisa fornecer um nome ou número do ${libraryLabel.toLowerCase()}.`);
      }

      let item = null;
      if (numero) {
        item = getItemByIndex(guildId, numero);
        if (!item) {
          return interaction.editReply(`❌ Item número ${numero} não encontrado.`);
        }
      } else {
        item = getItem(guildId, nome);
        if (!item) {
          return interaction.editReply(`❌ ${libraryLabel} "${nome}" não encontrado.`);
        }
      }

      const member = interaction.member;
      let channel = member.voice.channel;
      if (!channel) {
        if (!isOwner(interaction.user.id)) {
          return interaction.editReply("❌ Você precisa estar em um canal de voz para reproduzir.");
        }
        const currentChannelId = getCurrentChannel(guildId);
        if (!currentChannelId) {
          return interaction.editReply("❌ O bot não está em nenhum canal. Use /join primeiro ou entre em um canal.");
        }
      } else {
        if (!channel.joinable) {
          return interaction.editReply("❌ Não tenho permissão para entrar neste canal de voz.");
        }
        await connectToChannel(channel);
      }

      try {
        const filePath = getSoundFilePath(guildId, item.id);
        if (!fs.existsSync(filePath)) {
          return interaction.editReply("❌ Arquivo de áudio não foi encontrado.");
        }

        const volumePercent = getSoundboardVolume(guildId);
        const displayName = item.emoji ? `${item.emoji} ${item.name}` : item.name;
        await interaction.editReply(`🔊 Reproduzindo "${displayName}"...`);
        await playSoundFileImmediate(guildId, filePath, volumePercent);
        await interaction.editReply(`✅ ${libraryLabel} "${displayName}" está sendo reproduzido!`);
      } catch (error) {
        return interaction.editReply(`❌ Erro ao reproduzir áudio: ${error.message}`);
      }
    },

    async handleList(interaction) {
      await interaction.deferReply();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const items = getItems(guildId);
      const count = getItemCount(guildId);

      if (count === 0) {
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(`📭 Nenhum ${libraryLabel.toLowerCase()} adicionado ainda.`)
          .setColor(0x5865F2)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
      const requestedPage = interaction.options.getInteger("pagina");
      let currentPage = requestedPage ? Math.min(Math.max(requestedPage, 1), totalPages) - 1 : 0;

      const embed = createListEmbed({ title, items, count, totalPages, page: currentPage });
      const components = createPageComponents({ prefix: commandName, items, count, totalPages, page: currentPage });
      const message = await interaction.editReply({ embeds: [embed], components });

      const filter = (i) => i.user.id === userId && i.message.id === message.id;
      const buttonTimeout = getSoundListButtonTimeout(guildId);
      const collector = message.createMessageComponentCollector({ filter, time: buttonTimeout });

      collector.on("collect", async (interactionComponent) => {
        const customId = interactionComponent.customId;

        if (customId === `${commandName}_list_first`) currentPage = 0;
        else if (customId === `${commandName}_list_last`) currentPage = totalPages - 1;
        else if (customId === `${commandName}_list_prev` && currentPage > 0) currentPage--;
        else if (customId === `${commandName}_list_next` && currentPage < totalPages - 1) currentPage++;

        if (
          customId === `${commandName}_list_first` ||
          customId === `${commandName}_list_last` ||
          customId === `${commandName}_list_prev` ||
          customId === `${commandName}_list_next`
        ) {
          const newEmbed = createListEmbed({ title, items, count, totalPages, page: currentPage });
          const newComponents = createPageComponents({ prefix: commandName, items, count, totalPages, page: currentPage });
          await interactionComponent.update({ embeds: [newEmbed], components: newComponents });
          return;
        }

        if (customId === `${commandName}_list_stop`) {
          if (!isPlayingAudio(guildId)) {
            await interactionComponent.reply({ content: "ℹ️ Nenhum áudio está sendo reproduzido no momento.", ephemeral: true });
            return;
          }

          await interactionComponent.deferReply({ ephemeral: true });
          const stopped = stopSound(guildId);
          await interactionComponent.editReply({
            content: stopped
              ? `⏹️ Reprodução da ${libraryLabel.toLowerCase()} parada com sucesso.`
              : "❌ Não consegui parar o áudio atual.",
          });
          return;
        }

        if (customId.startsWith(`${commandName}_list_play_`)) {
          const indexStr = customId.replace(`${commandName}_list_play_`, "");
          const itemIndex = parseInt(indexStr, 10);

          if (Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= items.length) {
            await interactionComponent.reply({ content: "❌ Item não encontrado para este botão.", ephemeral: true });
            return;
          }

          const item = items[itemIndex];
          await interactionComponent.deferReply({ ephemeral: true });

          const member = interaction.guild.members.cache.get(interactionComponent.user.id);
          let channel = member?.voice.channel;
          if (!channel) {
            if (!isOwner(interactionComponent.user.id) || !getCurrentChannel(guildId)) {
              await interactionComponent.editReply({ content: "❌ Você precisa estar em um canal de voz para reproduzir." });
              return;
            }
          } else {
            if (!channel.joinable) {
              await interactionComponent.editReply({ content: "❌ Não tenho permissão para entrar neste canal de voz." });
              return;
            }
            await connectToChannel(channel);
          }

          const filePath = getSoundFilePath(guildId, item.id);
          if (!fs.existsSync(filePath)) {
            await interactionComponent.editReply({ content: "❌ Arquivo de áudio não foi encontrado." });
            return;
          }

          const volumePercent = getSoundboardVolume(guildId);
          await playSoundFileImmediate(guildId, filePath, volumePercent);
          const displayName = item.emoji ? `${item.emoji} ${item.name}` : item.name;
          await interactionComponent.editReply({ content: `✅ Reproduzindo "${displayName}"...` });
        }
      });

      collector.on("end", async () => {
        try {
          await message.edit({ components: [] });
        } catch {}
      });
    },

    async handleSettings(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const duracao = interaction.options.getInteger("duracao");
      const volume = interaction.options.getInteger("volume");
      const clear = interaction.options.getBoolean("clear");
      const timeout = interaction.options.getInteger("timeout");
      const isUserOwner = isOwner(userId);
      const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (duracao === null && volume === null && clear === null && timeout === null) {
        const items = getItems(guildId);
        const count = getItemCount(guildId);
        const maxDuration = getMaxSoundDuration(guildId);
        const currentVolume = getSoundboardVolume(guildId);
        const buttonTimeoutMs = getSoundListButtonTimeout(guildId);
        const buttonTimeoutSeconds = buttonTimeoutMs === null ? null : buttonTimeoutMs / 1000;
        const buttonTimeoutDisplay = buttonTimeoutSeconds === null ? "Ilimitado" : `${buttonTimeoutSeconds}s`;

        const embed = new EmbedBuilder()
          .setTitle(`⚙️ Configurações de ${libraryLabel}`)
          .setColor(0x5865F2)
          .setTimestamp()
          .addFields(
            { name: "📏 Duração Máxima", value: `${maxDuration}s`, inline: true },
            { name: "🔊 Volume", value: `${currentVolume}%`, inline: true },
            { name: "⏱️ Timeout dos Botões", value: buttonTimeoutDisplay, inline: true },
            { name: "📊 Estatísticas", value: `Total: ${count}\nLimite: ${count}/50`, inline: true }
          );

        if (count > 0) {
          const itemsList = items
            .slice(0, 10)
            .map((item, index) => `${index + 1}. ${item.emoji ? `${item.emoji} ` : ""}**${item.name}**`)
            .join("\n");

          embed.addFields({
            name: `🎵 Itens (${Math.min(count, 10)}/${count})`,
            value: itemsList || "Nenhum item",
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (clear !== null) {
        if (!isUserAdmin && !isUserOwner) {
          return interaction.editReply("❌ Você precisa ser **administrador** para limpar todos os áudios.");
        }

        const removedItems = clearItems(guildId);
        deleteAllSoundFiles(guildId);
        return interaction.editReply(
          `✅ Todos os áudios foram removidos (${removedItems.length} item${removedItems.length !== 1 ? "s" : ""}).`
        );
      }

      if (duracao !== null) {
        if (!isUserOwner && !isUserAdmin) {
          return interaction.editReply("❌ Você precisa ser **administrador** ou **owner do bot** para configurar a duração máxima.");
        }
        if (!isUserOwner && duracao > 60) {
          return interaction.editReply("❌ Administradores podem configurar no máximo **60 segundos**.");
        }
        const result = setMaxSoundDuration(guildId, duracao);
        return interaction.editReply(result.success ? `✅ Duração máxima configurada para **${duracao} segundos**.` : `❌ ${result.error}`);
      }

      if (volume !== null) {
        if (volume > 100 && !isUserOwner && !isUserAdmin) {
          return interaction.editReply("❌ Apenas **administradores** ou **owner do bot** podem configurar volume acima de **100%**.");
        }
        const result = setSoundboardVolume(guildId, volume);
        return interaction.editReply(result.success ? `✅ Volume configurado para **${volume}%**.` : `❌ ${result.error}`);
      }

      if (timeout !== null) {
        if (!isUserOwner && !isUserAdmin) {
          return interaction.editReply("❌ Você precisa ser **administrador** ou **owner do bot** para configurar o timeout dos botões.");
        }
        const timeoutValue = timeout === 0 ? null : timeout;
        if (timeoutValue !== null && timeoutValue < 30) {
          return interaction.editReply("❌ Timeout mínimo é **30 segundos**. Use **0** para ilimitado.");
        }
        const result = setSoundListButtonTimeout(guildId, timeoutValue);
        const timeoutDisplay = timeoutValue === null ? "ilimitado" : `${timeoutValue} segundos`;
        return interaction.editReply(result.success ? `✅ Timeout dos botões configurado para **${timeoutDisplay}**.` : `❌ ${result.error}`);
      }
    },
  };
}
