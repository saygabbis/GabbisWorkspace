import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from "discord.js";
import {
  addUserBlacklist,
  removeUserBlacklist,
  addCommandBlacklist,
  removeCommandBlacklist,
  listBlacklist,
  clearUserCommands,
} from "../state/blacklist.js";
import { isOwner } from "../config/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega lista de comandos disponíveis para validação
async function getAvailableCommands() {
  try {
    const commandsPath = path.join(__dirname, ".");
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
    const commandNames = new Set();
    
    for (const file of files) {
      try {
        const filePath = path.join(commandsPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        const { default: command } = await import(fileUrl);
        
        if (command?.data?.name) {
          commandNames.add(command.data.name);
        }
      } catch (err) {
        // Ignora erros ao carregar comandos
        console.warn(`Aviso: não foi possível carregar comando ${file} para validação`);
      }
    }
    
    return Array.from(commandNames);
  } catch (err) {
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Sistema de blacklist - bloqueia usuários do bot")
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Adiciona usuário ou comandos à blacklist")
        .addUserOption(opt =>
          opt
            .setName("user")
            .setDescription("Usuário a ser bloqueado")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("commands")
            .setDescription("Comandos a bloquear (separados por vírgula, ex: narrador,protect)")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove usuário ou comandos da blacklist")
        .addUserOption(opt =>
          opt
            .setName("user")
            .setDescription("Usuário a ser removido")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("commands")
            .setDescription("Comandos a desbloquear (separados por vírgula)")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Lista todos os usuários e comandos bloqueados")
    )
    .addSubcommand(sub =>
      sub
        .setName("check")
        .setDescription("Verifica se um usuário ou comando está bloqueado")
        .addUserOption(opt =>
          opt
            .setName("user")
            .setDescription("Usuário a verificar")
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("command")
            .setDescription("Comando a verificar")
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      // deferReply condicional: "list" e "check" fazem deferReply próprio
      if (sub !== "list" && sub !== "check") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      // Verifica permissões de administrador
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply(
          "❌ Você precisa ser administrador para usar comandos de blacklist."
        );
      }

      if (sub === "add") {
        const user = interaction.options.getUser("user");
        const commandsStr = interaction.options.getString("commands");

        // Validação: pelo menos uma opção deve ser fornecida
        if (!user && !commandsStr) {
          return interaction.editReply(
            "⚠️ Você deve fornecer pelo menos uma opção: `user` ou `commands`."
          );
        }

        // Se commands foi fornecido, user é obrigatório
        if (commandsStr && !user) {
          return interaction.editReply(
            "⚠️ Para bloquear comandos específicos, você deve fornecer o usuário também."
          );
        }

        // Validações de segurança
        if (user) {
          // Não permite bloquear owners
          if (isOwner(user.id)) {
            return interaction.editReply(
              "❌ Não é possível bloquear um owner do bot."
            );
          }

          // Não permite bloquear o próprio bot
          if (user.id === interaction.client.user.id) {
            return interaction.editReply(
              "❌ Não é possível bloquear o próprio bot."
            );
          }
        }

        // Adiciona usuário à blacklist completa
        if (user && !commandsStr) {
          const success = addUserBlacklist(interaction.guild.id, user.id);
          
          if (!success) {
            return interaction.editReply(
              `⚠️ O usuário **${user.username}** já está na blacklist completa.`
            );
          }

          // Remove comandos específicos se existirem (usuário está completamente bloqueado agora)
          clearUserCommands(interaction.guild.id, user.id);

          return interaction.editReply(
            `✅ Usuário **${user.username}** foi adicionado à blacklist completa.`
          );
        }

        // Adiciona comandos específicos à blacklist do usuário
        if (user && commandsStr) {
          const commandNames = commandsStr
            .split(",")
            .map(cmd => cmd.trim().toLowerCase())
            .filter(cmd => cmd.length > 0);

          if (commandNames.length === 0) {
            return interaction.editReply(
              "⚠️ Nenhum comando válido fornecido."
            );
          }

          // Valida que os comandos existem
          const availableCommands = await getAvailableCommands();
          const invalidCommands = commandNames.filter(
            cmd => !availableCommands.includes(cmd)
          );

          if (invalidCommands.length > 0) {
            return interaction.editReply(
              `⚠️ Comandos inválidos: ${invalidCommands.join(", ")}\n` +
              `Comandos disponíveis: ${availableCommands.join(", ")}`
            );
          }

          const addedCommands = [];
          const alreadyBlocked = [];

          for (const commandName of commandNames) {
            const success = addCommandBlacklist(
              interaction.guild.id,
              user.id,
              commandName
            );
            if (success) {
              addedCommands.push(commandName);
            } else {
              alreadyBlocked.push(commandName);
            }
          }

          let message = "";
          if (addedCommands.length > 0) {
            message += `✅ Comandos bloqueados para **${user.username}**: ${addedCommands.join(", ")}\n`;
          }
          if (alreadyBlocked.length > 0) {
            message += `⚠️ Comandos já estavam bloqueados: ${alreadyBlocked.join(", ")}`;
          }

          return interaction.editReply(message || "⚠️ Nenhum comando foi bloqueado.");
        }
      }

      if (sub === "remove") {
        const user = interaction.options.getUser("user");
        const commandsStr = interaction.options.getString("commands");

        // Validação: pelo menos uma opção deve ser fornecida
        if (!user && !commandsStr) {
          return interaction.editReply(
            "⚠️ Você deve fornecer pelo menos uma opção: `user` ou `commands`."
          );
        }

        // Se commands foi fornecido, user é obrigatório
        if (commandsStr && !user) {
          return interaction.editReply(
            "⚠️ Para desbloquear comandos específicos, você deve fornecer o usuário também."
          );
        }

        // Remove usuário da blacklist completa
        if (user && !commandsStr) {
          const success = removeUserBlacklist(interaction.guild.id, user.id);
          
          if (!success) {
            return interaction.editReply(
              `⚠️ O usuário **${user.username}** não está na blacklist completa.`
            );
          }

          // Remove também comandos específicos bloqueados
          clearUserCommands(interaction.guild.id, user.id);

          return interaction.editReply(
            `✅ Usuário **${user.username}** foi removido da blacklist.`
          );
        }

        // Remove comandos específicos da blacklist do usuário
        if (user && commandsStr) {
          const commandNames = commandsStr
            .split(",")
            .map(cmd => cmd.trim().toLowerCase())
            .filter(cmd => cmd.length > 0);

          if (commandNames.length === 0) {
            return interaction.editReply(
              "⚠️ Nenhum comando válido fornecido."
            );
          }

          const removedCommands = [];
          const notBlocked = [];

          for (const commandName of commandNames) {
            const success = removeCommandBlacklist(
              interaction.guild.id,
              user.id,
              commandName
            );
            if (success) {
              removedCommands.push(commandName);
            } else {
              notBlocked.push(commandName);
            }
          }

          let message = "";
          if (removedCommands.length > 0) {
            message += `✅ Comandos desbloqueados para **${user.username}**: ${removedCommands.join(", ")}\n`;
          }
          if (notBlocked.length > 0) {
            message += `⚠️ Comandos não estavam bloqueados: ${notBlocked.join(", ")}`;
          }

          return interaction.editReply(message || "⚠️ Nenhum comando foi desbloqueado.");
        }
      }

      if (sub === "list") {
        // Lista deve ser pública para permitir visualização
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }

        const blacklist = listBlacklist(interaction.guild.id);

        if (blacklist.users.length === 0 && Object.keys(blacklist.commands).length === 0) {
          const embed = new EmbedBuilder()
            .setTitle("📋 Blacklist do Servidor")
            .setDescription("📭 Nenhuma entrada na blacklist deste servidor ainda.")
            .setColor(0x5865F2)
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle("📋 Blacklist do Servidor")
          .setColor(0x5865F2)
          .setTimestamp();

        // Lista usuários completamente bloqueados
        if (blacklist.users.length > 0) {
          const userList = await Promise.all(
            blacklist.users.map(async (userId, i) => {
              try {
                const user = await interaction.client.users.fetch(userId);
                return `${i + 1}. **${user.username}** (${user.id})`;
              } catch (err) {
                return `${i + 1}. <@!${userId}> (${userId})`;
              }
            })
          );
          
          embed.addFields({
            name: `🚫 Usuários Completamente Bloqueados (${blacklist.users.length})`,
            value: userList.join("\n") || "Nenhum",
            inline: false,
          });
        }

        // Lista comandos bloqueados por usuário
        if (Object.keys(blacklist.commands).length > 0) {
          const commandList = await Promise.all(
            Object.entries(blacklist.commands).map(async ([userId, commands], i) => {
              try {
                const user = await interaction.client.users.fetch(userId);
                return `${i + 1}. **${user.username}**: ${commands.map(c => `\`/${c}\``).join(", ")}`;
              } catch (err) {
                return `${i + 1}. <@!${userId}>: ${commands.map(c => `\`/${c}\``).join(", ")}`;
              }
            })
          );
          
          embed.addFields({
            name: `🔒 Comandos Bloqueados por Usuário (${Object.keys(blacklist.commands).length})`,
            value: commandList.join("\n") || "Nenhum",
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === "check") {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const commandName = interaction.options.getString("command");

        if (!user && !commandName) {
          return interaction.editReply(
            "⚠️ Você deve fornecer pelo menos uma opção: `user` ou `command`."
          );
        }

        const blacklist = listBlacklist(interaction.guild.id);
        const results = [];

        if (user) {
          const isUserBlocked = blacklist.users.includes(user.id);
          const userCommands = blacklist.commands[user.id] || [];
          
          if (isUserBlocked) {
            results.push(`🚫 **${user.username}** está **completamente bloqueado** da blacklist.`);
          } else if (userCommands.length > 0) {
            results.push(`🔒 **${user.username}** tem os seguintes comandos bloqueados: ${userCommands.map(c => `\`/${c}\``).join(", ")}`);
          } else {
            results.push(`✅ **${user.username}** não está na blacklist.`);
          }
        }

        if (commandName) {
          // Verifica se o comando está bloqueado para algum usuário
          const usersWithCommand = Object.entries(blacklist.commands)
            .filter(([userId, commands]) => commands.includes(commandName))
            .map(([userId]) => userId);

          if (usersWithCommand.length > 0) {
            const userList = await Promise.all(
              usersWithCommand.slice(0, 10).map(async (userId) => {
                try {
                  const u = await interaction.client.users.fetch(userId);
                  return `**${u.username}**`;
                } catch {
                  return `<@!${userId}>`;
                }
              })
            );
            results.push(`🔒 O comando \`/${commandName}\` está bloqueado para ${usersWithCommand.length} usuário(s): ${userList.join(", ")}${usersWithCommand.length > 10 ? ` e mais ${usersWithCommand.length - 10}...` : ""}`);
          } else {
            results.push(`✅ O comando \`/${commandName}\` não está bloqueado para nenhum usuário.`);
          }
        }

        return interaction.editReply(results.join("\n\n"));
      }

      await interaction.editReply("❓ Subcomando desconhecido.");

    } catch (err) {
      console.error("Erro no comando /blacklist:", err);

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
