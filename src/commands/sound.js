import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import {
  connectToChannel,
  isConnected,
  playSoundFile,
} from "../utils/voiceManager.js";
import {
  addSound,
  removeSound,
  getSound,
  getSoundByIndex,
  getSounds,
  getSoundCount,
  updateSoundEmoji,
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
import { getUserMaxSoundDuration, setUserMaxSoundDuration } from "../state/userConfigs.js";
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
            .setDescription("Emoji para o som (opcional)")
            .setRequired(false)
            .setMaxLength(10)
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um som do soundboard")
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome do som a remover")
            .setRequired(true)
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
        .setName("config")
        .setDescription("Configura a duração máxima de áudio")
        .addIntegerOption((opt) =>
          opt
            .setName("duracao")
            .setDescription("Duração máxima em segundos (1-60 para admins, qualquer valor para owner)")
            .setRequired(true)
            .setMinValue(1)
        ),
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
            .setDescription("Volume do soundboard (1-100)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Emoji para o som")
            .setRequired(false)
            .setMaxLength(10)
        )
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome do som (usado com emoji)")
            .setRequired(false)
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      if (subcommand === "add") {
        const nome = interaction.options.getString("nome");
        const emoji = interaction.options.getString("emoji") || null;
        const attachment = interaction.options.getAttachment("arquivo");
        const link = interaction.options.getString("link");

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

          // Obtém duração máxima configurada
          // Owner usa configuração por usuário (pode ser null = sem limite)
          // Admin usa configuração do servidor (máximo 60s)
          // Outros usam padrão (15s)
          let maxDuration;
          if (isOwner(userId)) {
            const userMaxDuration = getUserMaxSoundDuration(userId);
            // Se configurado como null, mantém null (sem limite)
            // Se não configurado (null inicial), usa o padrão do servidor
            if (userMaxDuration === null) {
              // Verifica se foi explicitamente configurado como null ou se é o valor padrão
              // Se o usuário não tem configuração, getUserMaxSoundDuration retorna null
              // Nesse caso, usamos a configuração do servidor
              maxDuration = getMaxSoundDuration(guildId);
            } else {
              // Owner tem configuração numérica, usa ela (pode ser qualquer valor)
              maxDuration = userMaxDuration;
            }
          } else if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            maxDuration = getMaxSoundDuration(guildId);
          } else {
            // Usuário comum usa padrão
            maxDuration = 15;
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

          return interaction.editReply(
            `✅ Som "${nome}" adicionado com sucesso! (Duração: ${duration.toFixed(1)}s)`
          );
        } catch (error) {
          console.error("Erro ao adicionar som:", error);
          return interaction.editReply(
            `❌ Erro ao processar arquivo: ${error.message}`
          );
        }
      }

      if (subcommand === "remove") {
        const nome = interaction.options.getString("nome");

        const result = removeSound(guildId, nome);

        if (!result.success) {
          return interaction.editReply(`❌ ${result.error}`);
        }

        // Remove arquivo físico
        if (result.sound) {
          deleteSoundFile(guildId, result.sound.id);
          console.log(`[SOUNDBOARD] Remove | Guild: ${guildId} | User: ${userId} | Sound: ${nome} | ID: ${result.sound.id}`);
        }

        return interaction.editReply(`✅ Som "${nome}" removido com sucesso!`);
      }

      if (subcommand === "play") {
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

          // Reproduz o som com volume
          await playSoundFile(guildId, filePath, volumePercent);

          // Atualiza resposta com sucesso
          await interaction.editReply(`✅ Som "${soundDisplayName}" reproduzido com sucesso!`);
        } catch (error) {
          console.error(`[SOUNDBOARD] Play Error | Guild: ${guildId} | User: ${userId} | Error:`, error);
          return interaction.editReply(
            `❌ Erro ao reproduzir som: ${error.message}`
          );
        }
      }

      if (subcommand === "list") {
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

        // Emojis numéricos para reações
        const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
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
              return `${numberEmojis[index]} ${emojiDisplay}**${sound.name}** (${duration})`;
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

        // Envia embed inicial
        const embed = createListEmbed(currentPage);
        const message = await interaction.editReply({ embeds: [embed] });

        // Adiciona reações (números + setas de navegação)
        const reactionsToAdd = [];
        
        // Adiciona números para os sons da primeira página
        const firstPageCount = Math.min(ITEMS_PER_PAGE, count);
        for (let i = 0; i < firstPageCount; i++) {
          reactionsToAdd.push(numberEmojis[i]);
        }

        // Adiciona setas de navegação se houver mais de uma página
        if (totalPages > 1) {
          reactionsToAdd.push("⬅️", "➡️");
        }

        // Adiciona reações sequencialmente
        for (const emoji of reactionsToAdd) {
          try {
            await message.react(emoji);
          } catch (error) {
            console.error(`Erro ao adicionar reação ${emoji}:`, error);
          }
        }

        // Cria collector para reações
        const filter = (reaction, user) => {
          return !user.bot && user.id === userId;
        };

        const collector = message.createReactionCollector({
          filter,
          time: 60000, // 1 minuto
        });

        collector.on("collect", async (reaction, user) => {
          const emojiName = reaction.emoji.name;

          // Verifica se é um número (1-10)
          const numberIndex = numberEmojis.indexOf(emojiName);
          if (numberIndex !== -1) {
            const soundIndex = currentPage * ITEMS_PER_PAGE + numberIndex;
            const sound = sounds[soundIndex];

            if (sound) {
              // Remove reação do usuário
              try {
                await reaction.users.remove(user.id);
              } catch (error) {
                // Ignora erro
              }

              // Verifica se usuário está em canal de voz
              const member = interaction.guild.members.cache.get(user.id);
              if (!member?.voice.channel) {
                await interaction.followUp({
                  content: "❌ Você precisa estar em um canal de voz para reproduzir um som.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              const channel = member.voice.channel;
              if (!channel.joinable) {
                await interaction.followUp({
                  content: "❌ Não tenho permissão para entrar neste canal de voz.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              try {
                // Auto-connect
                await connectToChannel(channel);

                const filePath = getSoundFilePath(guildId, sound.id);
                if (fs.existsSync(filePath)) {
                  const volumePercent = getSoundboardVolume(guildId);
                  console.log(`[SOUNDBOARD] Play from List | Guild: ${guildId} | User: ${userId} | Sound: ${sound.name} (#${soundIndex + 1}) | Volume: ${volumePercent}%`);
                  
                  await playSoundFile(guildId, filePath, volumePercent);
                  
                  const soundDisplayName = sound.emoji ? `${sound.emoji} ${sound.name}` : sound.name;
                  await interaction.followUp({
                    content: `✅ Reproduzindo "${soundDisplayName}"...`,
                    flags: MessageFlags.Ephemeral,
                  });
                }
              } catch (error) {
                console.error(`[SOUNDBOARD] Play Error from List | Guild: ${guildId} | User: ${userId}:`, error);
                await interaction.followUp({
                  content: `❌ Erro ao reproduzir som: ${error.message}`,
                  flags: MessageFlags.Ephemeral,
                });
              }
            }
            return;
          }

          // Navegação de páginas
          if (emojiName === "⬅️" && currentPage > 0) {
            currentPage--;
            const newEmbed = createListEmbed(currentPage);
            await message.edit({ embeds: [newEmbed] });
            
            // Remove reações antigas e adiciona novas
            try {
              await message.reactions.removeAll();
              const newReactions = [];
              const pageCount = Math.min(ITEMS_PER_PAGE, count - currentPage * ITEMS_PER_PAGE);
              for (let i = 0; i < pageCount; i++) {
                newReactions.push(numberEmojis[i]);
              }
              if (totalPages > 1) {
                newReactions.push("⬅️", "➡️");
              }
              for (const emoji of newReactions) {
                await message.react(emoji);
              }
            } catch (error) {
              console.error("Erro ao atualizar reações:", error);
            }
          } else if (emojiName === "➡️" && currentPage < totalPages - 1) {
            currentPage++;
            const newEmbed = createListEmbed(currentPage);
            await message.edit({ embeds: [newEmbed] });
            
            // Remove reações antigas e adiciona novas
            try {
              await message.reactions.removeAll();
              const newReactions = [];
              const pageCount = Math.min(ITEMS_PER_PAGE, count - currentPage * ITEMS_PER_PAGE);
              for (let i = 0; i < pageCount; i++) {
                newReactions.push(numberEmojis[i]);
              }
              if (totalPages > 1) {
                newReactions.push("⬅️", "➡️");
              }
              for (const emoji of newReactions) {
                await message.react(emoji);
              }
            } catch (error) {
              console.error("Erro ao atualizar reações:", error);
            }
          }

          // Remove reação do usuário
          try {
            await reaction.users.remove(user.id);
          } catch (error) {
            // Ignora erro
          }
        });

        collector.on("end", async () => {
          // Remove todas as reações quando o collector expira
          try {
            await message.reactions.removeAll();
          } catch (error) {
            // Ignora erro
          }
        });
      }

      if (subcommand === "config") {
        const duracao = interaction.options.getInteger("duracao");
        const isUserOwner = isOwner(userId);
        const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // Owner pode configurar qualquer duração (por usuário)
        if (isUserOwner) {
          const result = setUserMaxSoundDuration(userId, duracao);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }

          const limitText = duracao >= 60 ? " (sem limite prático)" : "";
          return interaction.editReply(
            `✅ Duração máxima de áudio configurada para **${duracao} segundos**${limitText}.\n` +
            `⚠️ Esta configuração é **por usuário** e se aplica apenas a você (owner).`
          );
        }

        // Admin pode configurar até 60 segundos (por servidor)
        if (isUserAdmin) {
          if (duracao > 60) {
            return interaction.editReply(
              "❌ Administradores podem configurar no máximo **60 segundos** por servidor.\n" +
              "💡 Apenas o owner do bot pode configurar durações maiores."
            );
          }

          const result = setMaxSoundDuration(guildId, duracao);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }

          return interaction.editReply(
            `✅ Duração máxima de áudio configurada para **${duracao} segundos** neste servidor.\n` +
            `📌 Esta configuração se aplica a todos os usuários do servidor.`
          );
        }

        // Usuário comum não pode configurar
        return interaction.editReply(
          "❌ Você precisa ser **administrador** ou **owner do bot** para configurar a duração máxima."
        );
      }

      if (subcommand === "settings") {
        const duracao = interaction.options.getInteger("duracao");
        const volume = interaction.options.getInteger("volume");
        const emoji = interaction.options.getString("emoji");
        const nomeSom = interaction.options.getString("nome");
        const clear = interaction.options.getBoolean("clear");

        const isUserOwner = isOwner(userId);
        const isUserAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // Se nenhuma opção fornecida, mostra embed com configurações
        if (duracao === null && volume === null && emoji === null && clear === null) {
          const sounds = getSounds(guildId);
          const count = getSoundCount(guildId);
          const maxDuration = getMaxSoundDuration(guildId);
          const currentVolume = getSoundboardVolume(guildId);
          const userMaxDuration = isUserOwner ? getUserMaxSoundDuration(userId) : null;

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Configurações do Soundboard")
            .setColor(0x5865F2)
            .setTimestamp()
            .addFields(
              {
                name: "📏 Duração Máxima",
                value: isUserOwner && userMaxDuration !== null
                  ? `Servidor: ${maxDuration}s\nUsuário (Owner): ${userMaxDuration === null ? "Sem limite" : `${userMaxDuration}s`}`
                  : `${maxDuration}s`,
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
          // Configurar duração (mesma lógica do /sound config)
          if (isUserOwner) {
            const result = setUserMaxSoundDuration(userId, duracao);
            if (!result.success) {
              return interaction.editReply(`❌ ${result.error}`);
            }
            const limitText = duracao >= 60 ? " (sem limite prático)" : "";
            return interaction.editReply(
              `✅ Duração máxima configurada para **${duracao} segundos**${limitText}.\n` +
              `⚠️ Esta configuração é **por usuário** e se aplica apenas a você (owner).`
            );
          }

          if (isUserAdmin) {
            if (duracao > 60) {
              return interaction.editReply(
                "❌ Administradores podem configurar no máximo **60 segundos**.\n" +
                "💡 Apenas o owner do bot pode configurar durações maiores."
              );
            }
            const result = setMaxSoundDuration(guildId, duracao);
            if (!result.success) {
              return interaction.editReply(`❌ ${result.error}`);
            }
            console.log(`[SOUNDBOARD] Set Duration | Guild: ${guildId} | User: ${userId} | Duration: ${duracao}s`);
            return interaction.editReply(
              `✅ Duração máxima configurada para **${duracao} segundos** neste servidor.`
            );
          }

          return interaction.editReply(
            "❌ Você precisa ser **administrador** ou **owner do bot** para configurar a duração máxima."
          );
        }

        if (volume !== null) {
          // Configurar volume
          const result = setSoundboardVolume(guildId, volume);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }
          console.log(`[SOUNDBOARD] Set Volume | Guild: ${guildId} | User: ${userId} | Volume: ${volume}%`);
          return interaction.editReply(
            `✅ Volume do soundboard configurado para **${volume}%**.`
          );
        }

        if (emoji !== null && nomeSom !== null) {
          // Atualizar emoji de um som
          const result = updateSoundEmoji(guildId, nomeSom, emoji);
          if (!result.success) {
            return interaction.editReply(`❌ ${result.error}`);
          }
          console.log(`[SOUNDBOARD] Update Emoji | Guild: ${guildId} | User: ${userId} | Sound: ${nomeSom} | Emoji: ${emoji}`);
          return interaction.editReply(
            `✅ Emoji do som "${nomeSom}" atualizado para ${emoji}.`
          );
        }

        if (emoji !== null || nomeSom !== null) {
          return interaction.editReply(
            "❌ Você precisa fornecer tanto **emoji** quanto **nome** do som para atualizar o emoji."
          );
        }
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
