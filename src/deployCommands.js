import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { REST, Routes } from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
  
    const imported = await import(fileUrl);
    const command = imported.default;
  
    if (!command || !command.data) {
      console.warn(
        `⚠️ Ignorando ${file} (não é um slash command válido)`
      );
      continue;
    }
  
    commands.push(command.data.toJSON());
  }  

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_TOKEN
);

try {
  console.log("🔁 Registrando slash commands...");

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registrados com sucesso!");
} catch (error) {
  console.error("❌ Erro ao registrar comandos:", error);
}
