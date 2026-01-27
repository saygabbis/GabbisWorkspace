import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import {
  connectToChannel,
  playSoundFile,
  playSoundFileImmediate,
  isPlayingAudio,
  stopSound,
} from "../utils/voiceManager.js";
import {
  addSound,
  removeSound,
  getSound,
  getSoundByIndex,
  getSounds,
  getSoundCount,
  clearAllSounds,
} from "../state/soundboard.js";
import {
  downloadAttachment,
  downloadFromUrl,
  isValidAudioFormat,
  processAndSaveSound,
  deleteSoundFile,
  deleteAllSoundFiles,
  getSoundFilePath,
} from "../utils/soundboardManager.js";
import { getMaxSoundDuration, setMaxSoundDuration, getSoundboardVolume, setSoundboardVolume } from "../state/guildConfigs.js";
import { isOwner } from "../config/env.js";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

const TEMP_DIR = path.join(os.tmpdir(), "gabbis-soundboard");

// Cria diretório temporário se não existir
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

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
            .setName("comprimento")
            .setDescription("Duração máxima a reproduzir (em ms, opcional)")
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
      sub.setName("list").setDescription("Lista todos os sons do servidor")
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
        ),
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      if (subcommand === "add") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const nome = interaction.options.getString("nome");
        const emoji = interaction.options.getString("emoji");
        const attachment = interaction.options.getAttachment("arquivo");
        const link = interaction.options.getString("link");
        const comprimentoMs = interaction.options.getInteger("comprimento");

        // Validação: precisa ter arquivo ou link
        if (!attachment && !link) {
          return interaction.editReply(
            "❌ Você precisa fornecer um arquivo ou um link."
          );
        }

        // Verifica se já existe um som com esse nome
        const existingSound = getSound(guildId, nome);
        if (existingSound) {
          return interaction.editReply(
            `❌ Já existe um som com o nome "${nome}". Use outro nome.`
          );
        }

        // Valida formato se for attachment
        if (attachment) {
          if (!isValidAudioFormat(attachment.name)) {
            return interaction.editReply(
              "❌ Formato de arquivo não suportado. Formatos aceitos: MP3, WAV, M4A, FLAC, AAC, OGG, WMA, OPUS, WEBM"
            );
          }

          // Verifica tamanho máximo (25MB - limite do Discord)
          if (attachment.size > 25 * 1024 * 1024) {
            return interaction.editReply(
              "❌ Arquivo muito grande. Tamanho máximo: 25MB"
            );
          }
        }

        // Valida formato se for link
        if (link) {
          if (!isValidAudioFormat(link)) {
            // Tenta validar pela URL mesmo sem extensão
            const urlLower = link.toLowerCase();
            const hasAudioExtension = /\.(mp3|wav|m4a|flac|aac|ogg|wma|opus|webm)(\?|$)/i.test(
              link
            );
            if (!hasAudioExtension) {
              return interaction.editReply(
                "❌ URL não parece ser um arquivo de áudio válido. Formatos aceitos: MP3, WAV, M4A, FLAC, AAC, OGG, WMA, OPUS, WEBM"
              );
            }
          }
        }

        // Obtém duração máxima configurada por servidor
        const serverMaxDuration = getMaxSoundDuration(guildId);

        // Calcula limite efetivo por tipo de usuário
        let maxDuration = serverMaxDuration;

        const isUserOwner = isOwner(userId);
        const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isUserOwner && !isUserAdmin) {
          // Usuário comum fica limitado ao mínimo entre limite do servidor e 15s
          maxDuration = Math.min(serverMaxDuration, 15);
        }

        // Se o usuário informou comprimento em ms, respeita o menor entre o limite e o comprimento
        if (comprimentoMs !== null) {
          const comprimentoSegundos = comprimentoMs / 1000;
          if (comprimentoSegundos > maxDuration) {
            return interaction.editReply(
              `❌ O comprimento solicitado (${comprimentoSegundos.toFixed(
                2
              )}s) ultrapassa o limite permitido de ${maxDuration}s.`
            );
          }

          maxDuration = Math.min(maxDuration, comprimentoSegundos);
        }

        try {
          // Atualiza resposta para indicar processamento
          await interaction.editReply(
            "⏳ Processando arquivo de áudio... Isso pode levar alguns segundos."
          );

          // Gera ID único para o som
          const soundId = randomUUID();

          // Caminho temporário para download
          const tempInputPath = path.join(
            TEMP_DIR,
            `sound_${soundId}_${Date.now()}${attachment ? path.extname(attachment.name) : ".tmp"}`
          );

          // Baixa o arquivo
          if (attachment) {
            await downloadAttachment(attachment, tempInputPath);
          } else {
            await downloadFromUrl(link, tempInputPath);
          }

          // Processa e salva o áudio
          const { duration } = await processAndSaveSound(
            guildId,
            tempInputPath,
            soundId,
            maxDuration
          );

          // Remove arquivo temporário
          if (fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }

          // Adiciona metadados ao soundboard
          // Garante que emoji seja string ou null (não undefined)
          const soundData = {
            id: soundId,
            name: nome,
            emoji: emoji || null, // Garante que seja null se não fornecido
            filename: `${soundId}.opus`,
            addedBy: userId,
            addedAt: Date.now(),
            duration: duration,
          };

          const result = addSound(guildId, soundData);

          if (!result.success) {
            // Remove arquivo se falhou ao adicionar
            deleteSoundFile(guildId, soundId);
            return interaction.editReply(`❌ ${result.error}`);
          }

          // Log melhorado
          const fileSizeKB = attachment ? (attachment.size / 1024).toFixed(2) : "N/A";
          const format = attachment ? path.extname(attachment.name).slice(1).toUpperCase() : "URL";
          console.log(`[SOUNDBOARD] Add | Guild: ${guildId} | User: ${userId} | Sound: ${nome} | Duration: ${duration.toFixed(1)}s | Format: ${format} | Size: ${fileSizeKB}KB | Emoji: ${emoji || "none"}`);

          const newIndex = getSoundCount(guildId);

          return interaction.editReply(
            `✅ Som "${nome}" adicionado com sucesso como **#${newIndex}**! (Duração: ${duration.toFixed(1)}s)`
          );
        } catch (error) {
          console.error("Erro ao adicionar som:", error);
          return interaction.editReply(
            `❌ Erro ao processar arquivo: ${error.message}`
          );
        }
      }

      if (subcommand === "remove") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const nome = interaction.options.getString("nome");
        const numero = interaction.options.getInteger("numero");

        if (!nome && !numero) {
          return interaction.editReply(
            "❌ Você precisa fornecer um **nome** ou **número** do som para remover."
          );
        }

        let targetName = nome;

        if (numero !== null) {
          const sound = getSoundByIndex(guildId, numero);
          if (!sound) {
            return interaction.editReply(
              `❌ Som número ${numero} não encontrado.`
            );
          }
          targetName = sound.name;
        }

        const result = removeSound(guildId, targetName);

        if (!result.success) {
          return interaction.editReply(`❌ ${result.error}`);
        }

        // Remove arquivo físico
        if (result.sound) {
          deleteSoundFile(guildId, result.sound.id);
          console.log(
            `[SOUNDBOARD] Remove | Guild: ${guildId} | User: ${userId} | Sound: ${result.sound.name} | ID: ${result.sound.id}`
          );
        }

        return interaction.editReply(
          `✅ Som "${result.sound.name}" removido com sucesso!`
        );
      }

      if (subcommand === "play") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const nome = interaction.options.getString("nome");
        const numero = interaction.options.getInteger("numero");

        // Validação: precisa ter nome ou número
        if (!nome && !numero) {
          return interaction.editReply(
            "❌ Você precisa fornecer um nome ou número do som."
          );
        }

        let sound = null;
        let soundIdentifier = "";

        // Busca por número primeiro (prioridade)
        if (numero) {
          sound = getSoundByIndex(guildId, numero);
          soundIdentifier = `#${numero}`;
          if (!sound) {
            return interaction.editReply(
              `❌ Som número ${numero} não encontrado.`
            );
          }
        } else if (nome) {
          // Busca por nome
          sound = getSound(guildId, nome);
          soundIdentifier = nome;
          if (!sound) {
            return interaction.editReply(`❌ Som "${nome}" não encontrado.`);
          }
        }

        // Verifica se o usuário está em um canal de voz
        const member = interaction.member;
        if (!member.voice.channel) {
          return interaction.editReply(
            "❌ Você precisa estar em um canal de voz para reproduzir um som."
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
          // Auto-connect: sempre conecta ao canal do usuário
          await connectToChannel(channel);

          // Obtém caminho do arquivo
          const filePath = getSoundFilePath(guildId, sound.id);

          if (!fs.existsSync(filePath)) {
            return interaction.editReply(
              `❌ Arquivo do som não foi encontrado.`
            );
          }

          // Obtém volume configurado do servidor
          const volumePercent = getSoundboardVolume(guildId);

          // Atualiza resposta
          const soundDisplayName = sound.emoji ? `${sound.emoji} ${sound.name}` : sound.name;
          await interaction.editReply(`🔊 Reproduzindo "${soundDisplayName}"...`);

          // Log melhorado
          console.log(`[SOUNDBOARD] Play | Guild: ${guildId} | User: ${userId} | Sound: ${sound.name} (${soundIdentifier}) | Volume: ${volumePercent}%`);

          // Reproduz o som com volume (interrompendo qualquer som atual)
          await playSoundFileImmediate(guildId, filePath, volumePercent);

          // Atualiza resposta com sucesso
          await interaction.editReply(`✅ Som "${soundDisplayName}" está sendo reproduzido!`);
        } catch (error) {
          console.error(`[SOUNDBOARD] Play Error | Guild: ${guildId} | User: ${userId} | Error:`, error);
          return interaction.editReply(
            `❌ Erro ao reproduzir som: ${error.message}`
          );
        }
      }

      if (subcommand === "list") {
        // Lista deve ser pública para permitir reações
        await interaction.deferReply();

        const sounds = getSounds(guildId);
        const count = getSoundCount(guildId);

        if (count === 0) {
          const embed = new EmbedBuilder()
            .setTitle("📋 Soundboard do Servidor")
            .setDescription("📭 Nenhum som adicionado ao soundboard deste servidor ainda.")
            .setColor(0x5865F2)
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        let currentPage = 0;

        // Função para criar embed da página atual
        const createListEmbed = (page) => {
          const startIndex = page * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, count);
          const pageSounds = sounds.slice(startIndex, endIndex);

          const soundList = pageSounds
            .map((sound, index) => {
              const globalIndex = startIndex + index;
              const duration = sound.duration
                ? `${sound.duration.toFixed(1)}s`
                : "N/A";
              const emojiDisplay = sound.emoji ? `${sound.emoji} ` : "";
              return `${globalIndex + 1}. ${emojiDisplay}**${sound.name}** (${duration})`;
            })
            .join("\n");

          const embed = new EmbedBuilder()
            .setTitle("📋 Soundboard do Servidor")
            .setDescription(soundList || "Nenhum som")
            .setColor(0x5865F2)
            .setFooter({
              text: `Página ${page + 1} de ${totalPages} • Total: ${count} som${count !== 1 ? "s" : ""}`,
            })
            .setTimestamp();

          return embed;
        };

        // Cria botões para a página atual
        const createPageComponents = (page) => {
          const startIndex = page * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, count);
          const pageSounds = sounds.slice(startIndex, endIndex);

          const rows = [];

          // Botões 1–5
          const row1 = new ActionRowBuilder();
          // Botões 6–10
          const row2 = new ActionRowBuilder();

          pageSounds.forEach((sound, idx) => {
            const globalIndex = startIndex + idx; // 0-based
            const labelNumber = globalIndex + 1; // 1-based para exibição
            const button = new ButtonBuilder()
              .setCustomId(`sound_list_play_${globalIndex}`)
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

          // Row de navegação
          if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("sound_list_prev")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("⬅️")
                .setDisabled(page === 0),
              new ButtonBuilder()
                .setCustomId("sound_list_next")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("➡️")
                .setDisabled(page === totalPages - 1)
            );
            rows.push(navRow);
          }

          return rows;
        };

        // Envia embed inicial com botões
        const embed = createListEmbed(currentPage);
        const components = createPageComponents(currentPage);
        const message = await interaction.editReply({ embeds: [embed], components });

        // Cria collector para botões
        const filter = (i) =>
          i.user.id === userId && i.message.id === message.id;

        const collector = message.createMessageComponentCollector({
          filter,
          time: 60000, // 1 minuto
        });

        collector.on("collect", async (interactionComponent) => {
          const customId = interactionComponent.customId;

          if (customId === "sound_list_prev" || customId === "sound_list_next") {
            if (customId === "sound_list_prev" && currentPage > 0) {
              currentPage--;
            } else if (customId === "sound_list_next" && currentPage < totalPages - 1) {
              currentPage++;
            }

            const newEmbed = createListEmbed(currentPage);
            const newComponents = createPageComponents(currentPage);
            await interactionComponent.update({
              embeds: [newEmbed],
              components: newComponents,
            });
            return;
          }

          if (customId.startsWith("sound_list_play_")) {
            const indexStr = customId.replace("sound_list_play_", "");
            const soundIndex = parseInt(indexStr, 10);

            if (Number.isNaN(soundIndex) || soundIndex < 0 || soundIndex >= sounds.length) {
              await interactionComponent.reply({
                content: "❌ Som não encontrado para este botão.",
                ephemeral: true,
              });
              return;
            }

            const sound = sounds[soundIndex];

            try {
              // Defer para evitar timeout de interação enquanto conecta/toca
              await interactionComponent.deferReply({ ephemeral: true });

              // Verifica se usuário está em canal de voz
              const member = interaction.guild.members.cache.get(interactionComponent.user.id);
              if (!member?.voice.channel) {
                await interactionComponent.editReply({
                  content: "❌ Você precisa estar em um canal de voz para reproduzir um som.",
                });
                return;
              }

              const channel = member.voice.channel;
              if (!channel.joinable) {
                await interactionComponent.editReply({
                  content: "❌ Não tenho permissão para entrar neste canal de voz.",
                });
                return;
              }

              // Auto-connect
              await connectToChannel(channel);

              const filePath = getSoundFilePath(guildId, sound.id);
              const fileExists = fs.existsSync(filePath);

              if (!fileExists) {
                await interactionComponent.reply({
                  content: "❌ Arquivo de áudio não foi encontrado.",
                  ephemeral: true,
                });
                return;
              }

              const volumePercent = getSoundboardVolume(guildId);
              console.log(
                `[SOUNDBOARD] Play from List(Button) | Guild: ${guildId} | User: ${interactionComponent.user.id} | Sound: ${sound.name} (#${soundIndex + 1}) | Volume: ${volumePercent}%`
              );

              // Reproduz imediatamente, interrompendo qualquer som atual
              await playSoundFileImmediate(guildId, filePath, volumePercent);

              const soundDisplayName = sound.emoji ? `${sound.emoji} ${sound.name}` : sound.name;
              await interactionComponent.editReply({
                content: `✅ Reproduzindo "${soundDisplayName}"...`,
              });
            } catch (error) {
              console.error(
                `[SOUNDBOARD] Play Error from List(Button) | Guild: ${guildId} | User: ${interactionComponent.user.id}:`,
                error
              );
              try {
                await interactionComponent.editReply({
                  content: `❌ Erro ao reproduzir som: ${error.message}`,
                });
              } catch {
                // Se não for possível editar (por erro anterior), ignora
              }
            }
          }
        });

        collector.on("end", async () => {
          try {
            await message.edit({ components: [] });
          } catch {
            // ignora
          }
        });
      }

      if (subcommand === "settings") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const duracao = interaction.options.getInteger("duracao");
        const volume = interaction.options.getInteger("volume");
        const clear = interaction.options.getBoolean("clear");

        const isUserOwner = isOwner(userId);
        const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // Se nenhuma opção fornecida, mostra embed com configurações
        if (duracao === null && volume === null && clear === null) {
          const sounds = getSounds(guildId);
          const count = getSoundCount(guildId);
          const maxDuration = getMaxSoundDuration(guildId);
          const currentVolume = getSoundboardVolume(guildId);

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Configurações do Soundboard")
            .setColor(0x5865F2)
            .setTimestamp()
            .addFields(
              {
                name: "📏 Duração Máxima",
                value: `${maxDuration}s`,
                inline: true,
              },
              {
                name: "🔊 Volume",
                value: `${currentVolume}%`,
                inline: true,
              },
              {
                name: "📊 Estatísticas",
                value: `Total de sons: ${count}\nLimite: ${count}/50`,
                inline: true,
              }
            );

          // Adiciona lista de sons se houver
          if (count > 0) {
            const soundsList = sounds
              .slice(0, 10)
              .map((sound, index) => {
                const emojiDisplay = sound.emoji ? `${sound.emoji} ` : "";
                return `${index + 1}. ${emojiDisplay}**${sound.name}**`;
              })
              .join("\n");

            embed.addFields({
              name: `🎵 Sons (${Math.min(count, 10)}/${count})`,
              value: soundsList || "Nenhum som",
            });
          }

          return interaction.editReply({ embeds: [embed] });
        }

        // Processa opções fornecidas
        if (clear !== null) {
          // Limpar todos os áudios (apenas admin)
          if (!isUserAdmin && !isUserOwner) {
            return interaction.editReply(
              "❌ Você precisa ser **administrador** para limpar todos os áudios."
            );
          }

          // Mostra confirmação
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`sound_clear_confirm_${guildId}_${userId}`)
              .setLabel("Confirmar")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`sound_clear_cancel_${guildId}_${userId}`)
              .setLabel("Cancelar")
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.editReply({
            content: "⚠️ **ATENÇÃO:** Isso irá deletar **TODOS** os áudios do soundboard deste servidor. Esta ação não pode ser desfeita!\n\nConfirme a ação:",
            components: [confirmRow],
          });

          // Cria collector para os botões (timeout de 30 segundos)
          const filter = (i) => {
            return (
              (i.customId === `sound_clear_confirm_${guildId}_${userId}` ||
                i.customId === `sound_clear_cancel_${guildId}_${userId}`) &&
              i.user.id === userId
            );
          };

          const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 30000,
          });

          collector.on("collect", async (i) => {
            if (i.customId.includes("confirm")) {
              // Limpa todos os sons
              const removedSounds = clearAllSounds(guildId);
              deleteAllSoundFiles(guildId);

              console.log(`[SOUNDBOARD] Clear All | Guild: ${guildId} | User: ${userId} | Removed: ${removedSounds.length} sounds`);

              await i.update({
                content: `✅ Todos os áudios foram removidos do soundboard (${removedSounds.length} som${removedSounds.length !== 1 ? "s" : ""}).`,
                components: [],
              });
            } else {
              await i.update({
                content: "❌ Operação cancelada.",
                components: [],
              });
            }
            collector.stop();
          });

          collector.on("end", async (collected) => {
            if (collected.size === 0) {
              await interaction.editReply({
                content: "⏱️ Confirmação expirada. Operação cancelada.",
                components: [],
              });
            }
          });

          return;
        }

        if (duracao !== null) {
          // Configurar duração máxima por servidor
          if (!isUserOwner && !isUserAdmin) {
            return interaction.editReply(
              "❌ Você precisa ser **administrador** ou **owner do bot** para configurar a duração máxima."
            );
          }

          if (!isUserOwner && duracao > 60) {
            return interaction.editReply(
              "❌ Administradores podem configurar no máximo **60 segundos**.\n" +
                "💡 Apenas o owner do bot pode configurar durações maiores."
            );
          }

          const result = setMaxSoundDuration(guildId, duracao);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }

          console.log(
            `[SOUNDBOARD] Set Duration | Guild: ${guildId} | User: ${userId} | Duration: ${duracao}s`
          );
          return interaction.editReply(
            `✅ Duração máxima de áudio configurada para **${duracao} segundos** neste servidor.\n` +
              `📌 Esta configuração se aplica a todos os usuários do servidor.`
          );
        }

        if (volume !== null) {
          // Configurar volume (1–200, mas apenas admins/owner podem passar de 100%)
          if (volume > 100 && !isUserOwner && !isUserAdmin) {
            return interaction.editReply(
              "❌ Apenas **administradores** ou **owner do bot** podem configurar volume acima de **100%** (máximo 200%)."
            );
          }

          const result = setSoundboardVolume(guildId, volume);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }
          console.log(
            `[SOUNDBOARD] Set Volume | Guild: ${guildId} | User: ${userId} | Volume: ${volume}%`
          );
          return interaction.editReply(
            `✅ Volume do soundboard configurado para **${volume}%**.`
          );
        }
      }

      if (subcommand === "stop") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guild.id;
        const member = interaction.member;

        // Verifica se usuário está em canal de voz
        if (!member.voice?.channel) {
          return interaction.editReply(
            "❌ Você precisa estar em um canal de voz para usar o stop."
          );
        }

        // Verifica se há algo tocando
        if (!isPlayingAudio(guildId)) {
          return interaction.editReply("ℹ️ Nenhum áudio está sendo reproduzido no momento.");
        }

        const stopped = stopSound(guildId);

        if (!stopped) {
          return interaction.editReply("❌ Não consegui parar o áudio atual (nenhum player ativo encontrado).");
        }

        return interaction.editReply("⏹️ Reprodução do soundboard parada com sucesso.");
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
