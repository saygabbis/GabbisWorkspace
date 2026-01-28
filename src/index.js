import { client } from "./client.js";
import { ENV } from "./config/env.js";
import { startApiServer } from "./api/server.js";

client.once("clientReady", (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

// Inicia a API do painel no mesmo processo
startApiServer(client);

client.login(ENV.DISCORD_TOKEN);
