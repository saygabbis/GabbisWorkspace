import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { MessageFlags } from "discord.js";
import { isOwner } from "../config/env.js";
import {
  isUserBlacklisted,
  isCommandBlacklisted,
} from "../state/blacklist.js";
import { logCommand } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = new Map();

// carrega comandos
const commandsPath = path.join(__dirname, "../commands");
const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of files) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  const { default: command } = await import(fileUrl);

  if (command?.data?.name) {
    commands.set(command.data.name, command);
  }
}

export async function onInteractionCreate(interaction) {
  // Autocomplete de comandos
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    // Autocomplete específico para /sound play/remove (nomes de áudios)
    if (interaction.commandName === "sound" && interaction.guild) {
      const sub = interaction.options.getSubcommand(false);
      if (sub === "play" || sub === "remove") {
        try {
          const { getSounds } = await import("../state/soundboard.js");
          const guildId = interaction.guild.id;
          const focused = interaction.options.getFocused() || "";

          const sounds = getSounds(guildId);
          const normalized = focused.toLowerCase();

          const filtered = sounds
            .filter((s) =>
              s.name.toLowerCase().includes(normalized)
            )
            .slice(0, 25);

          const choices = filtered.map((sound, index) => {
            const globalIndex = sounds.indexOf(sound);
            const number = globalIndex >= 0 ? globalIndex + 1 : index + 1;
            const emojiDisplay = sound.emoji ? `${sound.emoji} ` : "";
            return {
              name: `${number}. ${emojiDisplay}${sound.name}`,
              value: sound.name,
            };
          });

          await interaction.respond(choices);
        } catch (err) {
          console.error("Erro no autocomplete de /sound:", err);
          try {
            await interaction.respond([]);
          } catch {
            // ignora
          }
        }
        return;
      }
    }

    // Autocomplete para /logs add/remove (nomes de comandos)
    if (interaction.commandName === "logs" && interaction.guild) {
      const sub = interaction.options.getSubcommand(false);
      if (sub === "add" || sub === "remove") {
        try {
          const focused = interaction.options.getFocused() || "";
          const normalized = focused.toLowerCase();

          // Lista todos os comandos disponíveis
          const commandNames = Array.from(commands.keys()).filter((name) =>
            name.toLowerCase().includes(normalized)
          );

          const choices = commandNames.slice(0, 25).map((name) => ({
            name: `/${name}`,
            value: name,
          }));

          await interaction.respond(choices);
        } catch (err) {
          console.error("Erro no autocomplete de /logs:", err);
          try {
            await interaction.respond([]);
          } catch {
            // ignora
          }
        }
        return;
      }
    }

    // Autocomplete para /blacklist remove (comandos bloqueados)
    if (interaction.commandName === "blacklist" && interaction.guild) {
      const sub = interaction.options.getSubcommand(false);
      if (sub === "remove") {
        try {
          const { listBlacklist } = await import("../state/blacklist.js");
          const guildId = interaction.guild.id;
          const focused = interaction.options.getFocused() || "";
          const normalized = focused.toLowerCase();
          const user = interaction.options.getUser("user");

          const blacklist = listBlacklist(guildId);
          const allBlockedCommands = new Set();

          // Se usuário foi especificado, mostra apenas comandos bloqueados desse usuário
          if (user) {
            const userCommands = blacklist.commands[user.id] || [];
            userCommands.forEach(cmd => allBlockedCommands.add(cmd));
          } else {
            // Se usuário não foi especificado, mostra todos os comandos bloqueados
            Object.values(blacklist.commands).forEach(commands => {
              commands.forEach(cmd => allBlockedCommands.add(cmd));
            });
          }

          const filtered = Array.from(allBlockedCommands)
            .filter(cmd => cmd.toLowerCase().includes(normalized))
            .slice(0, 25);

          const choices = filtered.map((cmd) => ({
            name: `/${cmd}`,
            value: cmd,
          }));

          await interaction.respond(choices);
        } catch (err) {
          console.error("Erro no autocomplete de /blacklist:", err);
          try {
            await interaction.respond([]);
          } catch {
            // ignora
          }
        }
        return;
      }
    }

    // Outros autocompletes
    try {
      await interaction.respond([]);
    } catch {
      // ignora
    }

    return;
  }

  // Comandos de chat (slash)
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Verificação de blacklist
    // Owners não são afetados pela blacklist
    if (!isOwner(interaction.user.id) && interaction.guild) {
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;
      const commandName = interaction.commandName;

      // Verifica se usuário está completamente bloqueado
      if (isUserBlacklisted(guildId, userId)) {
        return interaction.reply({
          content: "🚫 Você está bloqueado de usar este bot.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Verifica se comando específico está bloqueado
      if (isCommandBlacklisted(guildId, userId, commandName)) {
        return interaction.reply({
          content: `🚫 Você está bloqueado de usar o comando \`/${commandName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Extrai opções do comando para log
    const options = {};
    if (interaction.options) {
      for (const option of interaction.options.data || []) {
        if (option.value !== undefined && option.value !== null) {
          options[option.name] = option.value;
        }
      }
    }

    // Executa o comando
    await command.execute(interaction);

    // Log do comando após execução bem-sucedida
    if (interaction.guild) {
      try {
        await logCommand(
          interaction.client,
          interaction.guild.id,
          interaction.commandName,
          interaction.user,
          Object.keys(options).length > 0 ? options : null,
          "Executado com sucesso"
        );
      } catch (logError) {
        // Não quebra o fluxo se o log falhar
        console.error("Erro ao logar comando:", logError);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleString("pt-BR")}] ❌ ERROR: Comando /${interaction.commandName} falhou | User: ${interaction.user.tag} (${interaction.user.id}) | Guild: ${interaction.guild?.id || "DM"} | Error:`, err);

    // Log de erro no Discord se configurado
    if (interaction.guild) {
      try {
        await logCommand(
          interaction.client,
          interaction.guild.id,
          interaction.commandName,
          interaction.user,
          null,
          `❌ Erro: ${err.message || "Erro desconhecido"}`
        );
      } catch {
        // Ignora erro de log
      }
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Erro interno.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
