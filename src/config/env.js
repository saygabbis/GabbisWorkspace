import "dotenv/config";

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
};

// validação básica
if (!ENV.DISCORD_TOKEN) {
  throw new Error("❌ DISCORD_TOKEN não definido no .env");
}
