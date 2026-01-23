import "dotenv/config";

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OWNER_IDS: process.env.OWNER_IDS || "",
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
 * Verifica se um usuário é owner
 */
export function isOwner(userId) {
  const ownerIds = getOwnerIds();
  return ownerIds.includes(userId);
}
