import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
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
              { name: "Persistent", value: "persistent" }
            )
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
              { name: "Persistent", value: "persistent" }
            )
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
              { name: "Persistent", value: "persistent" }
            )
        )
        .addStringOption(opt =>
          opt
            .setName("modo")
            .setDescription("Novo modo de proteção")
            .setRequired(false)
            .addChoices(
              { name: "Instant", value: "instant" },
              { name: "Persistent", value: "persistent" }
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
              { name: "Persistent", value: "persistent" }
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
        const cooldownSeconds = interaction.options.getInteger("cooldown");

        // Validação: modo Persistent não deve ter cooldown
        if (mode === "persistent" && cooldownSeconds !== null) {
          return interaction.editReply(
            "⚠️ O modo Persistent não usa cooldown. O trigger será bloqueado enquanto o target estiver na call."
          );
        }

        // Converte cooldown em milissegundos (padrão 2s = 2000ms)
        const timeWindow = cooldownSeconds ? cooldownSeconds * 1000 : 2000;

        const success = addProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          timeWindow,
          mode
        );

        if (!success) {
          return interaction.editReply(
            "⚠️ Essa proteção já existe. Não é possível criar a mesma proteção (target + trigger + modo) duas vezes."
          );
        }

        const modeText = mode === "persistent" ? "Persistent" : "Instant";
        const cooldownText = mode === "instant" ? ` (cooldown: ${timeWindow}ms)` : "";

        return interaction.editReply(
          `✅ Proteção criada: **${target.username}** protegido de **${trigger.username}**\n` +
          `Modo: **${modeText}**${cooldownText}`
        );
      }

      if (sub === "remove") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");
        const mode = interaction.options.getString("modo");

        // Se modo não foi especificado, remove todas as proteções com target + trigger (compatibilidade)
        // Se modo foi especificado, remove apenas a proteção do modo especificado
        const success = removeProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          mode || null
        );

        if (!success) {
          if (mode) {
            return interaction.editReply(
              `⚠️ Proteção não encontrada: **${target.username}** protegido de **${trigger.username}** no modo **${mode === "persistent" ? "Persistent" : "Instant"}**.`
            );
          } else {
            return interaction.editReply(
              "⚠️ Nenhuma proteção encontrada com essa combinação de target e trigger."
            );
          }
        }

        const modeText = mode ? ` no modo **${mode === "persistent" ? "Persistent" : "Instant"}**` : "";
        return interaction.editReply(
          `✅ Proteção removida: **${target.username}** protegido de **${trigger.username}**${modeText}`
        );
      }

      if (sub === "edit") {
        const target = interaction.options.getUser("target");
        const trigger = interaction.options.getUser("trigger");
        const currentMode = interaction.options.getString("modo-atual");
        const newMode = interaction.options.getString("modo");
        const cooldownSeconds = interaction.options.getInteger("cooldown");

        // Identifica a proteção
        let protectionToEdit = null;
        
        if (currentMode) {
          // Modo atual fornecido - busca proteção específica
          const protections = getProtectionsByTargetAndTrigger(
            interaction.guild.id,
            target.id,
            trigger.id
          );
          protectionToEdit = protections.find(p => p.mode === currentMode);
          
          if (!protectionToEdit) {
            return interaction.editReply(
              `⚠️ Proteção não encontrada: **${target.username}** protegido de **${trigger.username}** no modo **${currentMode === "persistent" ? "Persistent" : "Instant"}**.`
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
              `⚠️ Existem múltiplas proteções para **${target.username}** e **${trigger.username}** (Instant e Persistent).\n` +
              `Por favor, especifique o modo atual usando a opção \`modo-atual\`.`
            );
          }
          
          protectionToEdit = protections[0];
        }

        // Validação: se modo novo for persistent, não pode ter cooldown
        if (newMode === "persistent" && cooldownSeconds !== null) {
          return interaction.editReply(
            "⚠️ O modo Persistent não usa cooldown. O trigger será bloqueado enquanto o target estiver na call."
          );
        }

        // Prepara valores para atualização
        const finalNewMode = newMode !== null ? newMode : protectionToEdit.mode;
        const finalNewTimeWindow = cooldownSeconds !== null ? cooldownSeconds : null;

        // Atualiza a proteção
        const result = updateProtection(
          interaction.guild.id,
          target.id,
          trigger.id,
          protectionToEdit.mode,
          finalNewMode,
          finalNewTimeWindow
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
        const oldModeText = result.oldValues.mode === "persistent" ? "Persistent" : "Instant";
        const newModeText = result.newValues.mode === "persistent" ? "Persistent" : "Instant";
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
                const modeText = mode === "persistent" ? "Persistent" : "Instant";
                const timeWindowText = mode === "persistent" ? "contínuo" : `${p.timeWindow}ms`;
                const statsText = activationCount > 0 
                  ? ` • ${activationCount} ativação(ões)`
                  : "";
                return `${globalIndex + 1}. **${target.username}** protegido de **${trigger.username}** [${modeText}] (${timeWindowText})${statsText}`;
              } catch (err) {
                // Fallback se não conseguir buscar o usuário
                const stats = p.stats || {};
                const activationCount = stats.activationCount || 0;
                const mode = p.mode || "instant";
                const modeText = mode === "persistent" ? "Persistent" : "Instant";
                const timeWindowText = mode === "persistent" ? "contínuo" : `${p.timeWindow}ms`;
                const statsText = activationCount > 0 
                  ? ` • ${activationCount} ativação(ões)`
                  : "";
                return `${globalIndex + 1}. <@!${p.targetId}> protegido de <@!${p.triggerId}> [${modeText}] (${timeWindowText})${statsText}`;
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
