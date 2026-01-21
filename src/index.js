import { client } from "./client.js";
import { ENV } from "./config/env.js";

client.once("clientReady", (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

client.login(ENV.DISCORD_TOKEN);
