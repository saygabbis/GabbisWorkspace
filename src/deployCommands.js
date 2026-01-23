import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { REST, Routes } from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Timestamp de início
const startTime = Date.now();

console.log("═══════════════════════════════════════════════════════");
console.log("🚀 INICIANDO DEPLOY DE SLASH COMMANDS");
console.log("═══════════════════════════════════════════════════════");
console.log(`📅 Data/Hora: ${new Date().toLocaleString("pt-BR")}`);
console.log(`📁 Diretório: ${__dirname}`);
console.log(`🔑 Token: ${process.env.DISCORD_TOKEN ? "✅ Configurado" : "❌ Não encontrado"}`);
console.log(`🆔 Client ID: ${process.env.CLIENT_ID || "❌ Não encontrado"}`);
console.log("");

const commands = [];

const commandsPath = path.join(__dirname, "commands");
console.log(`📂 Lendo diretório de comandos: ${commandsPath}`);

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

console.log(`📋 Arquivos encontrados: ${commandFiles.length}`);
if (commandFiles.length > 0) {
  console.log(`   ${commandFiles.map(f => `• ${f}`).join("\n   ")}`);
}
console.log("");

console.log("📦 Carregando comandos...");
let loadedCount = 0;
let skippedCount = 0;

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  
  try {
    const imported = await import(fileUrl);
    const command = imported.default;
  
    if (!command || !command.data) {
      console.warn(`   ⚠️  ${file}: Ignorado (não é um slash command válido)`);
      skippedCount++;
      continue;
    }
  
    const commandData = command.data.toJSON();
    commands.push(commandData);
    loadedCount++;
    
    // Detalhes do comando
    const subcommands = commandData.options?.filter(opt => opt.type === 1) || [];
    const hasSubcommands = subcommands.length > 0;
    
    console.log(`   ✅ ${file}:`);
    console.log(`      Nome: /${commandData.name}`);
    console.log(`      Descrição: ${commandData.description || "Sem descrição"}`);
    
    if (hasSubcommands) {
      console.log(`      Subcomandos: ${subcommands.length}`);
      subcommands.forEach(sub => {
        console.log(`         • ${sub.name}: ${sub.description || "Sem descrição"}`);
      });
    } else {
      const options = commandData.options || [];
      if (options.length > 0) {
        console.log(`      Opções: ${options.length}`);
        options.forEach(opt => {
          const required = opt.required ? " (obrigatório)" : " (opcional)";
          console.log(`         • ${opt.name}: ${opt.description || "Sem descrição"}${required}`);
        });
      }
    }
    console.log("");
  } catch (error) {
    console.error(`   ❌ ${file}: Erro ao carregar`);
    console.error(`      ${error.message}`);
    skippedCount++;
    console.log("");
  }
}  

console.log("═══════════════════════════════════════════════════════");
console.log("📊 RESUMO DO CARREGAMENTO");
console.log("═══════════════════════════════════════════════════════");
console.log(`✅ Comandos carregados: ${loadedCount}`);
console.log(`⚠️  Arquivos ignorados: ${skippedCount}`);
console.log(`📦 Total de comandos para deploy: ${commands.length}`);
console.log("");

if (commands.length === 0) {
  console.error("❌ ERRO: Nenhum comando válido encontrado para deploy!");
  console.error("   Verifique se os arquivos em src/commands/ exportam comandos válidos.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_TOKEN
);

console.log("═══════════════════════════════════════════════════════");
console.log("🔁 REGISTRANDO COMANDOS NO DISCORD");
console.log("═══════════════════════════════════════════════════════");
console.log(`🆔 Client ID: ${process.env.CLIENT_ID}`);
console.log(`📦 Comandos a registrar: ${commands.length}`);
console.log("");

const deployStartTime = Date.now();

try {
  console.log("⏳ Enviando requisição para Discord API...");
  
  const result = await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  const deployTime = Date.now() - deployStartTime;
  const totalTime = Date.now() - startTime;

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("✅ DEPLOY CONCLUÍDO COM SUCESSO!");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`📦 Comandos registrados: ${Array.isArray(result) ? result.length : commands.length}`);
  console.log(`⏱️  Tempo de deploy: ${deployTime}ms`);
  console.log(`⏱️  Tempo total: ${totalTime}ms`);
  console.log("");
  
  if (Array.isArray(result) && result.length > 0) {
    console.log("📋 Comandos registrados:");
    result.forEach(cmd => {
      console.log(`   • /${cmd.name} (ID: ${cmd.id})`);
    });
  }
  
  console.log("");
  console.log("🎉 Pronto! Os comandos estão disponíveis no Discord.");
  console.log("═══════════════════════════════════════════════════════");
  
} catch (error) {
  const deployTime = Date.now() - deployStartTime;
  const totalTime = Date.now() - startTime;
  
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.error("❌ ERRO AO REGISTRAR COMANDOS");
  console.log("═══════════════════════════════════════════════════════");
  console.error(`⏱️  Tempo até erro: ${deployTime}ms`);
  console.error(`⏱️  Tempo total: ${totalTime}ms`);
  console.error("");
  console.error("📋 Detalhes do erro:");
  console.error(`   Tipo: ${error.constructor.name}`);
  console.error(`   Mensagem: ${error.message}`);
  
  if (error.code) {
    console.error(`   Código: ${error.code}`);
  }
  
  if (error.status) {
    console.error(`   Status HTTP: ${error.status}`);
  }
  
  if (error.requestData) {
    console.error(`   URL: ${error.requestData.url}`);
    console.error(`   Método: ${error.requestData.method}`);
  }
  
  if (error.rawError) {
    console.error("   Erro da API Discord:");
    console.error(`   ${JSON.stringify(error.rawError, null, 2)}`);
  }
  
  if (error.stack) {
    console.error("");
    console.error("📚 Stack trace:");
    console.error(error.stack);
  }
  
  console.log("═══════════════════════════════════════════════════════");
  process.exit(1);
}
