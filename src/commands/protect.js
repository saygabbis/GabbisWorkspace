import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from "discord.js";
import { 
  addProtection, 
  removeProtection, 
  listProtections,
  updateProtection,
  getProtectionsByTargetAndTrigger
} from "../state/guildConfigs.js";
import { getGuildStats, getTopProtections } from "../utils/stats.js";

export default {
  data: new SlashCommandBuilder()
    .setName("protect")
    .setDescription("Sistema de proteção")
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Adiciona uma proteção")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Usuário protegido")
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Quem dispara a proteção")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("modo")
            .setDescription("Modo de proteção")
            .setRequired(false)
            .addChoices(
              { name: "Instant (padrão)", value: "instant" },
              { name: "Persistent", value: "persistent" },
              { name: "Channel (apenas um canal)", value: "channel" }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName("canal")
            .setDescription("Canal de voz protegido (obrigatório no modo Channel)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildVoice)
        )
        .addIntegerOption(opt =>
          opt
            .setName("cooldown")
            .setDescription("Janela de proteção em segundos (1-10, padrão: 2, apenas para modo Instant)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove uma proteção")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Usuário protegido")
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Quem dispara a proteção")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("modo")
            .setDescription("Modo de proteção a remover")
            .setRequired(false)
            .addChoices(
              { name: "Instant", value: "instant" },
              { name: "Persistent", value: "persistent" },
              { name: "Channel", value: "channel" }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName("canal")
            .setDescription("Canal de voz (obrigatório ao remover proteção Channel)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildVoice)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("edit")
        .setDescription("Edita uma proteção existente")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Usuário protegido")
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Quem dispara a proteção")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("modo-atual")
            .setDescription("Modo atual da proteção (necessário se houver múltiplas proteções)")
            .setRequired(false)
            .addChoices(
              { name: "Instant", value: "instant" },
              { name: "Persistent", value: "persistent" },
              { name: "Channel", value: "channel" }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName("canal-atual")
            .setDescription("Canal da proteção (obrigatório se modo atual for Channel)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildVoice)
        )
        .addStringOption(opt =>
          opt
            .setName("modo")
            .setDescription("Novo modo de proteção")
            .setRequired(false)
            .addChoices(
              { name: "Instant", value: "instant" },
              { name: "Persistent", value: "persistent" },
              { name: "Channel", value: "channel" }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName("cooldown")
            .setDescription("Nova janela de proteção em segundos (1-10, apenas para modo Instant)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Lista todas as proteções do servidor")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("Filtrar por usuário protegido")
            .setRequired(false)
        )
        .addUserOption(opt =>
          opt
            .setName("trigger")
            .setDescription("Filtrar por usuário que dispara a proteção")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("modo")
            .setDescription("Filtrar por modo de proteção")
            .setRequired(false)
            .addChoices(
              { name: "Instant", value: "instant" },
              { name: "Persistent", value: "persistent" },
              { name: "Channel", value: "channel" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("stats")
        .setDescription("Mostra estatísticas das proteções")
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      // deferReply condicional: "list" faz deferReply próprio (público)
      if (sub !== "list") {
        // 🔹 avisa o Discord que vai responder
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      // Verifica permissões de administrador para TODOS os comandos de protect
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply(
          "❌ Você precisa ser administrador para usar comandos de proteção."
        );
      }

      // Subcomandos principais
      if (sub === "add") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");
        const mode = interaction.options.getString("modo") || "instant";
        const channelOpt = interaction.options.getChannel("canal");
        const cooldownSeconds = interaction.options.getInteger("cooldown");

        // Validação: modo Channel exige canal de voz
        if (mode === "channel") {
          if (!channelOpt || !channelOpt.isVoiceBased?.()) {
            return interaction.editReply(
              "⚠️ No modo **Channel** é obrigatório informar o **canal de voz** que será protegido. O target não poderá entrar nesse canal enquanto o trigger estiver nele."
            );
          }
        }

        // Validação: modo Persistent/Channel não devem ter cooldown
        if ((mode === "persistent" || mode === "channel") && cooldownSeconds !== null) {
          return interaction.editReply(
            mode === "channel"
              ? "⚠️ O modo Channel não usa cooldown. O target será removido sempre que tentar entrar naquele canal enquanto o trigger estiver lá (anti-spam)."
              : "⚠️ O modo Persistent não usa cooldown. O trigger será bloqueado enquanto o target estiver na call."
          );
        }

        // Converte cooldown em milissegundos (padrão 2s = 2000ms)
        const timeWindow = cooldownSeconds ? cooldownSeconds * 1000 : 2000;
        const channelId = mode === "channel" ? channelOpt.id : null;

        const success = addProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          timeWindow,
          mode,
          channelId
        );

        if (!success) {
          return interaction.editReply(
            "⚠️ Essa proteção já existe. Não é possível criar a mesma proteção (target + trigger + modo [+ canal]) duas vezes."
          );
        }

        const modeText = mode === "persistent" ? "Persistent" : mode === "channel" ? "Channel" : "Instant";
        const cooldownText = mode === "instant" ? ` (cooldown: ${timeWindow}ms)` : "";
        const channelText = mode === "channel" ? ` • Canal: **${channelOpt.name}**` : "";

        return interaction.editReply(
          (mode === "channel"
            ? `✅ Proteção criada: **${target.username}** não poderá entrar no canal **${channelOpt.name}** enquanto **${trigger.username}** estiver nele. Modo: **${modeText}** (só esse canal; outras calls liberadas).`
            : `✅ Proteção criada: **${target.username}** protegido de **${trigger.username}**\nModo: **${modeText}**${cooldownText}`)
        );
      }

      if (sub === "remove") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");
        const mode = interaction.options.getString("modo");
        const channelOpt = interaction.options.getChannel("canal");

        // Modo Channel exige canal para identificar qual proteção remover (ou remove todas channel desse target+trigger)
        const channelId = (mode === "channel" && channelOpt?.isVoiceBased) ? channelOpt.id : null;

        const success = removeProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          mode || null,
          channelId
        );

        if (!success) {
          if (mode) {
            const modeLabel = mode === "persistent" ? "Persistent" : mode === "channel" ? "Channel" : "Instant";
            return interaction.editReply(
              mode === "channel" && !channelId
                ? "⚠️ Para remover proteção **Channel**, informe o **canal** ou remova sem filtrar por modo para apagar todas as proteções desse target+trigger."
                : `⚠️ Proteção não encontrada: **${target.username}** / **${trigger.username}** no modo **${modeLabel}**${mode === "channel" && channelId ? ` (canal informado)` : ""}.`
            );
          } else {
            return interaction.editReply(
              "⚠️ Nenhuma proteção encontrada com essa combinação de target e trigger."
            );
          }
        }

        const modeText = mode ? ` no modo **${mode === "persistent" ? "Persistent" : mode === "channel" ? "Channel" : "Instant"}**${mode === "channel" && channelOpt ? ` (canal ${channelOpt.name})` : ""}` : "";
        return interaction.editReply(
          `✅ Proteção removida: **${target.username}** / **${trigger.username}**${modeText}`
        );
      }

      if (sub === "edit") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");
        const currentMode = interaction.options.getString("modo-atual");
        const currentChannelOpt = interaction.options.getChannel("canal-atual");
        const newMode = interaction.options.getString("modo");
        const cooldownSeconds = interaction.options.getInteger("cooldown");

        // Identifica a proteção
        let protectionToEdit = null;
        const currentChannelId = (currentMode === "channel" && currentChannelOpt?.isVoiceBased) ? currentChannelOpt.id : null;

        if (currentMode) {
          // Modo atual fornecido - busca proteção específica (para channel, exige canal)
          const protections = getProtectionsByTargetAndTrigger(
            interaction.guild.id,
            target.id,
            trigger.id
          );
          protectionToEdit = protections.find(p => {
            if (p.mode !== currentMode) return false;
            if (currentMode === "channel") return p.channelId === currentChannelId;
            return true;
          });
          
          if (!protectionToEdit) {
            const modeLabel = currentMode === "persistent" ? "Persistent" : currentMode === "channel" ? "Channel" : "Instant";
            return interaction.editReply(
              currentMode === "channel" && !currentChannelId
                ? "⚠️ Para editar proteção **Channel**, informe o **canal-atual**."
                : `⚠️ Proteção não encontrada: **${target.username}** / **${trigger.username}** no modo **${modeLabel}**.`
            );
          }
        } else {
          // Modo atual não fornecido - verifica se há apenas uma proteção
          const protections = getProtectionsByTargetAndTrigger(
            interaction.guild.id,
            target.id,
            trigger.id
          );
          
          if (protections.length === 0) {
            return interaction.editReply(
              `⚠️ Nenhuma proteção encontrada: **${target.username}** protegido de **${trigger.username}**.`
            );
          }
          
          if (protections.length > 1) {
            return interaction.editReply(
              `⚠️ Existem múltiplas proteções para **${target.username}** e **${trigger.username}** (Instant, Persistent ou Channel).\n` +
              `Por favor, especifique \`modo-atual\` (e \`canal-atual\` se for Channel).`
            );
          }
          
          protectionToEdit = protections[0];
        }

        // Validação: modo Persistent/Channel não aceitam cooldown
        if ((newMode === "persistent" || newMode === "channel") && cooldownSeconds !== null) {
          return interaction.editReply(
            "⚠️ Os modos Persistent e Channel não usam cooldown."
          );
        }

        // Não permitir mudar para Channel via edit (é preciso adicionar nova proteção com canal)
        if (newMode === "channel") {
          return interaction.editReply(
            "⚠️ Para criar proteção no modo Channel, use `/protect add` com modo Channel e o canal desejado."
          );
        }

        // Prepara valores para atualização
        const finalNewMode = newMode !== null ? newMode : protectionToEdit.mode;
        const finalNewTimeWindow = cooldownSeconds !== null ? cooldownSeconds : null;

        // Atualiza a proteção (para channel, passa currentChannelId)
        const result = updateProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          protectionToEdit.mode,
          finalNewMode,
          finalNewTimeWindow,
          protectionToEdit.mode === "channel" ? protectionToEdit.channelId : null
        );

        if (!result) {
          return interaction.editReply(
            `⚠️ Erro ao atualizar proteção: **${target.username}** protegido de **${trigger.username}**.`
          );
        }

        if (!result.success) {
          return interaction.editReply(
            `⚠️ ${result.error || "Erro ao atualizar proteção."}`
          );
        }

        // Monta mensagem de sucesso
        const oldModeText = result.oldValues.mode === "persistent" ? "Persistent" : result.oldValues.mode === "channel" ? "Channel" : "Instant";
        const newModeText = result.newValues.mode === "persistent" ? "Persistent" : result.newValues.mode === "channel" ? "Channel" : "Instant";
        const oldCooldownText = result.oldValues.mode === "instant" 
          ? ` (cooldown: ${result.oldValues.timeWindow}ms)` 
          : "";
        const newCooldownText = result.newValues.mode === "instant" 
          ? ` (cooldown: ${result.newValues.timeWindow}ms)` 
          : "";

        let changes = [];
        if (result.oldValues.mode !== result.newValues.mode) {
          changes.push(`Modo: **${oldModeText}** → **${newModeText}**`);
        }
        if (result.oldValues.timeWindow !== result.newValues.timeWindow && result.newValues.mode === "instant") {
          changes.push(`Cooldown: **${result.oldValues.timeWindow}ms** → **${result.newValues.timeWindow}ms**`);
        }

        const changesText = changes.length > 0 
          ? `\n\n**Alterações:**\n${changes.join("\n")}`
          : "\n\n⚠️ Nenhuma alteração foi feita (valores fornecidos são iguais aos atuais).";

        return interaction.editReply(
          `✅ Proteção atualizada: **${target.username}** protegido de **${trigger.username}**\n` +
          `Modo atual: **${newModeText}**${newCooldownText}${changesText}`
        );
      }

      if (sub === "list") {
        // Lista deve ser pública para permitir interação
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }

        let protections = listProtections(interaction.guild.id);
        
        // Aplica filtros se fornecidos
        const targetFilter = interaction.options.getUser("target");
        const triggerFilter = interaction.options.getUser("trigger");
        const modeFilter = interaction.options.getString("modo");
        
        if (targetFilter) {
          protections = protections.filter(p => p.targetId === targetFilter.id);
        }
        if (triggerFilter) {
          protections = protections.filter(p => p.triggerId === triggerFilter.id);
        }
        if (modeFilter) {
          protections = protections.filter(p => (p.mode || "instant") === modeFilter);
        }
        
        const count = protections.length;

        if (count === 0) {
          const embed = new EmbedBuilder()
            .setTitle("📋 Proteções do Servidor")
            .setDescription("📭 Nenhuma proteção configurada neste servidor ainda.")
            .setColor(0x5865F2)
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        let currentPage = 0;

        // Função para criar embed da página atual
        const createListEmbed = async (page) => {
          const startIndex = page * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, count);
          const pageProtections = protections.slice(startIndex, endIndex);

          const protectionList = await Promise.all(
            pageProtections.map(async (p, index) => {
              const globalIndex = startIndex + index;
              try {
                const trigger = await interaction.client.users.fetch(p.triggerId);
                const target = await interaction.client.users.fetch(p.targetId);
                const stats = p.stats || {};
                const activationCount = stats.activationCount || 0;
                const mode = p.mode || "instant";
                const modeText = mode === "persistent" ? "Persistent" : mode === "channel" ? "Channel" : "Instant";
                const timeWindowText = mode === "persistent" ? "contínuo" : mode === "channel" ? "canal específico" : `${p.timeWindow}ms`;
                let channelName = "";
                if (mode === "channel" && p.channelId) {
                  const ch = await interaction.guild.channels.fetch(p.channelId).catch(() => null);
                  channelName = ch ? ` • #${ch.name}` : ` • ${p.channelId}`;
                }
                const statsText = activationCount > 0 
                  ? ` • ${activationCount} ativação(ões)`
                  : "";
                const desc = mode === "channel"
                  ? `**${target.username}** não pode entrar no canal enquanto **${trigger.username}** estiver`
                  : `**${target.username}** protegido de **${trigger.username}**`;
                return `${globalIndex + 1}. ${desc} [${modeText}] (${timeWindowText})${channelName}${statsText}`;
              } catch (err) {
                const stats = p.stats || {};
                const activationCount = stats.activationCount || 0;
                const mode = p.mode || "instant";
                const modeText = mode === "persistent" ? "Persistent" : mode === "channel" ? "Channel" : "Instant";
                const timeWindowText = mode === "persistent" ? "contínuo" : mode === "channel" ? "canal específico" : `${p.timeWindow}ms`;
                const channelName = mode === "channel" && p.channelId ? ` • #${p.channelId}` : "";
                const statsText = activationCount > 0 ? ` • ${activationCount} ativação(ões)` : "";
                return `${globalIndex + 1}. <@!${p.targetId}> / <@!${p.triggerId}> [${modeText}] (${timeWindowText})${channelName}${statsText}`;
              }
            })
          );

          const embed = new EmbedBuilder()
            .setTitle("📋 Proteções do Servidor")
            .setDescription(protectionList.join("\n") || "Nenhuma proteção")
            .setColor(0x5865F2)
            .setFooter({
              text: `Página ${page + 1} de ${totalPages} • Total: ${count} proteção(ões)`,
            })
            .setTimestamp();

          return embed;
        };

        // Cria botões para navegação
        const createPageComponents = (page) => {
          const rows = [];

          // Row de navegação
          if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("protect_list_prev")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("⬅️")
                .setDisabled(page === 0),
              new ButtonBuilder()
                .setCustomId("protect_list_next")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("➡️")
                .setDisabled(page === totalPages - 1)
            );
            rows.push(navRow);
          }

          return rows;
        };

        // Envia embed inicial com botões
        const embed = await createListEmbed(currentPage);
        const components = createPageComponents(currentPage);
        const message = await interaction.editReply({ embeds: [embed], components });

        // Cria collector para botões
        const filter = (i) =>
          i.user.id === interaction.user.id && i.message.id === message.id;

        const collector = message.createMessageComponentCollector({
          filter,
          time: 60000, // 1 minuto
        });

        collector.on("collect", async (interactionComponent) => {
          const customId = interactionComponent.customId;

          if (customId === "protect_list_prev" || customId === "protect_list_next") {
            if (customId === "protect_list_prev" && currentPage > 0) {
              currentPage--;
            } else if (customId === "protect_list_next" && currentPage < totalPages - 1) {
              currentPage++;
            }

            const newEmbed = await createListEmbed(currentPage);
            const newComponents = createPageComponents(currentPage);
            await interactionComponent.update({
              embeds: [newEmbed],
              components: newComponents,
            });
          }
        });

        collector.on("end", async () => {
          try {
            await message.edit({ components: [] });
          } catch {
            // ignora
          }
        });
        
        return; // Retorna após configurar o collector para evitar mensagem de erro
      }

      if (sub === "stats") {
        const guildStats = getGuildStats(interaction.guild.id);
        const topProtections = getTopProtections(interaction.guild.id, 5);

        let statsText = `📊 **Estatísticas do Servidor**\n\n`;
        statsText += `**Total de Proteções:** ${guildStats.totalProtections}\n`;
        statsText += `**Total de Ativações:** ${guildStats.totalActivations}\n`;
        statsText += `**Total de Desconexões:** ${guildStats.totalDisconnects}\n`;

        if (guildStats.lastActivation) {
          const lastActivationDate = new Date(guildStats.lastActivation);
          statsText += `**Última Ativação:** ${lastActivationDate.toLocaleString("pt-BR")}\n`;
        } else {
          statsText += `**Última Ativação:** Nunca\n`;
        }

        if (topProtections.length > 0) {
          statsText += `\n**🔝 Top 5 Proteções Mais Ativadas:**\n`;
          
          const topList = await Promise.all(
            topProtections.map(async (p, i) => {
              try {
                const trigger = await interaction.client.users.fetch(p.triggerId);
                const target = await interaction.client.users.fetch(p.targetId);
                return `${i + 1}. **${target.username}** → **${trigger.username}**: ${p.activationCount} ativação(ões)`;
              } catch (err) {
                return `${i + 1}. <@!${p.targetId}> → <@!${p.triggerId}>: ${p.activationCount} ativação(ões)`;
              }
            })
          );
          
          statsText += topList.join("\n");
        }

        return interaction.editReply(statsText);
      }

      await interaction.editReply("❓ Subcomando desconhecido.");

    } catch (err) {
      console.error("Erro no comando /protect:", err);

      // 🔴 fallback ABSOLUTO
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Erro interno no comando.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply("❌ Erro interno no comando.");
      }
    }
  },
};
