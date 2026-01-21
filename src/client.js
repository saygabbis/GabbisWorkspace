import { Client, GatewayIntentBits } from "discord.js";
import { onVoiceStateUpdate } from "./events/voiceState.js";
import { onInteractionCreate } from "./events/interactionCreate.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on("voiceStateUpdate", onVoiceStateUpdate);
client.on("interactionCreate", onInteractionCreate);
