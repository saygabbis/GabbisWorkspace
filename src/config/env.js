import "dotenv/config";

function parseIds(value) {
  if (!value) return [];
  return value.split(",").map(id => id.trim()).filter(Boolean);
}

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  TARGET_USER_IDS: parseIds(process.env.TARGET_USER_IDS),
  TRIGGER_USER_ID: process.env.TRIGGER_USER_ID,

  TIME_WINDOW: 2000, // ms (pode virar config depois)
};

// validação básica
if (!ENV.DISCORD_TOKEN) {
  throw new Error("❌ DISCORD_TOKEN não definido no .env");
}

if (!ENV.TRIGGER_USER_ID) {
  throw new Error("❌ TRIGGER_USER_ID não definido no .env");
}
