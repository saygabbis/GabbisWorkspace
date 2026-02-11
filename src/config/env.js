import "dotenv/config";

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OWNER_IDS: process.env.OWNER_IDS || "",
  PANEL_PORT: Number(process.env.PANEL_PORT) || 3000,
  PANEL_TOKEN: process.env.PANEL_TOKEN || "",
  CLIENT_ID: process.env.CLIENT_ID || "",
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "",
  PANEL_ORIGIN: process.env.PANEL_ORIGIN || "http://localhost:5173",
  JWT_SECRET: process.env.JWT_SECRET || "",
};

// validação básica
if (!ENV.DISCORD_TOKEN) {
  throw new Error("❌ DISCORD_TOKEN não definido no .env");
}

/**
 * Retorna array de owner IDs
 * Suporta múltiplos IDs separados por vírgula ou um único ID
 */
export function getOwnerIds() {
  if (!ENV.OWNER_IDS) {
    return [];
  }
  
  return ENV.OWNER_IDS
    .split(",")
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/**
 * Verifica se um usuário é owner (apenas IDs em OWNER_IDS no .env).
 * Outros usuários não sabem que essa verificação existe.
 */
export function isOwner(userId) {
  if (userId == null) return false;
  const ownerIds = getOwnerIds();
  return ownerIds.includes(String(userId));
}
