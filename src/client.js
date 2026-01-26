import { Client, GatewayIntentBits } from "discord.js";
import { onVoiceStateUpdate, initializeDisconnectDetection } from "./events/voiceState.js";
import { onInteractionCreate } from "./events/interactionCreate.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on("voiceStateUpdate", onVoiceStateUpdate);
client.on("interactionCreate", onInteractionCreate);

// Inicializa sistema de detecção de desconexões quando bot estiver pronto
client.once("ready", () => {
  initializeDisconnectDetection(client);
  console.log("🛡️ Sistema de detecção de desconexões inicializado");
});
