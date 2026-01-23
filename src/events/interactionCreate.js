import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { MessageFlags } from "discord.js";
import { isOwner } from "../config/env.js";
import {
  isUserBlacklisted,
  isCommandBlacklisted,
} from "../state/blacklist.js";

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

    await command.execute(interaction);
  } catch (err) {
    console.error(err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Erro interno.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
