import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { MessageFlags } from "discord.js";

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
