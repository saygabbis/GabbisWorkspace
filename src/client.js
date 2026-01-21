import { Client, GatewayIntentBits } from "discord.js";
import { onVoiceStateUpdate } from "./events/voiceState.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on("voiceStateUpdate", onVoiceStateUpdate);
