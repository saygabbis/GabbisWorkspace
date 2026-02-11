import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { getGuildConfig, listProtections, addProtection, updateProtection, removeProtection, getMaxSoundDuration, setMaxSoundDuration, getSoundboardVolume, setSoundboardVolume, getNarradorSayUser, setNarradorSayUser, getCommandLogs, setCommandLogs, removeCommandLogs } from "../state/guildConfigs.js";
import { listBlacklist, addUserBlacklist, removeUserBlacklist, addCommandBlacklist, removeCommandBlacklist, clearUserCommands } from "../state/blacklist.js";
import { getSounds } from "../state/soundboard.js";
import { getGuildStats } from "../utils/stats.js";

const USER_GUILDS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const userGuildsCache = new Map(); // userId -> { guildIds: string[], expiresAt: number }

function canAccessGuild(req, guildId) {
  if (!req.user) return false;
  if (req.user.legacyAdmin) return true;
  const allowed = userGuildsCache.get(req.user.userId);
  if (!allowed || Date.now() > allowed.expiresAt) return false;
  return allowed.guildIds.includes(guildId);
}

function getAllowedGuildIds(req) {
  if (!req.user) return [];
  if (req.user.legacyAdmin) return null; // null = all
  const allowed = userGuildsCache.get(req.user.userId);
  if (!allowed || Date.now() > allowed.expiresAt) return [];
  return allowed.guildIds;
}

/**
 * Cria e inicia o servidor HTTP da API do painel.
 * Roda no mesmo processo do bot.
 * @param {import("discord.js").Client} client
 */
export function startApiServer(client) {
  const app = express();

  // Middlewares básicos
  app.use(express.json());

  // CORS amplo por enquanto (pode ser restringido por domínio depois)
  app.use(
    cors({
      origin: "*",
    })
  );

  // Health check público
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      botReady: !!client?.user,
    });
  });

  // --- Autenticação ---

  // Login legado: valida PANEL_TOKEN (admin vê todos os servidores)
  app.post("/auth/login", (req, res) => {
    const { token } = req.body || {};

    if (!ENV.PANEL_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "PANEL_TOKEN não configurado no servidor.",
      });
    }

    if (!token || token !== ENV.PANEL_TOKEN) {
      return res.status(401).json({ ok: false, error: "Token inválido." });
    }

    return res.json({ ok: true });
  });

  // OAuth2 Discord: redirect para autorização (redirect_uri = frontend)
  app.get("/auth/discord", (req, res) => {
    if (!ENV.CLIENT_ID || !ENV.DISCORD_CLIENT_SECRET || !ENV.PANEL_ORIGIN || !ENV.JWT_SECRET) {
      return res.status(503).json({
        ok: false,
        error: "Login com Discord não configurado (CLIENT_ID, DISCORD_CLIENT_SECRET, PANEL_ORIGIN, JWT_SECRET).",
      });
    }
    const redirectUri = `${ENV.PANEL_ORIGIN.replace(/\/$/, "")}/auth/callback`;
    const discordAuthUrl = new URL("https://discord.com/api/oauth2/authorize");
    discordAuthUrl.searchParams.set("client_id", ENV.CLIENT_ID);
    discordAuthUrl.searchParams.set("redirect_uri", redirectUri);
    discordAuthUrl.searchParams.set("response_type", "code");
    discordAuthUrl.searchParams.set("scope", "identify guilds");
    res.redirect(discordAuthUrl.toString());
  });

  // POST /auth/callback: frontend envia code (recebido do Discord) e redirect_uri; backend troca por token e retorna JWT
  app.post("/auth/callback", async (req, res) => {
    const { code, redirect_uri: redirectUriParam } = req.body || {};
    if (!ENV.CLIENT_ID || !ENV.DISCORD_CLIENT_SECRET || !ENV.JWT_SECRET) {
      return res.status(503).json({ ok: false, error: "OAuth não configurado." });
    }
    const redirectUri = redirectUriParam || `${ENV.PANEL_ORIGIN.replace(/\/$/, "")}/auth/callback`;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ ok: false, error: "code obrigatório." });
    }
    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ENV.CLIENT_ID,
          client_secret: ENV.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error("Discord token exchange error:", tokenData);
        return res.status(401).json({ ok: false, error: "Falha ao trocar code por token." });
      }
      const accessToken = tokenData.access_token;
      const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userData = await userRes.json();
      if (userData.id == null) {
        return res.status(401).json({ ok: false, error: "Falha ao obter usuário." });
      }
      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const guildsData = await guildsRes.json();
      const MANAGE_GUILD = 0x20;
      const ADMINISTRATOR = 0x8;
      const botGuildIds = new Set(client.guilds.cache.map((g) => g.id));
      const allowedGuildIds = (Array.isArray(guildsData) ? guildsData : [])
        .filter((g) => (Number(g.permissions) & (MANAGE_GUILD | ADMINISTRATOR)) !== 0 && botGuildIds.has(g.id))
        .map((g) => g.id);
      userGuildsCache.set(userData.id, {
        guildIds: allowedGuildIds,
        expiresAt: Date.now() + USER_GUILDS_CACHE_TTL_MS,
      });
      const jwtToken = jwt.sign(
        { userId: userData.id, username: userData.username },
        ENV.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({ ok: true, token: jwtToken });
    } catch (err) {
      console.error("OAuth callback error:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // Middleware de auth: aceita Bearer PANEL_TOKEN (legacy) ou Bearer JWT
  app.use((req, res, next) => {
    const header = req.headers["authorization"] || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1].trim() : "";

    if (ENV.PANEL_TOKEN && token === ENV.PANEL_TOKEN) {
      req.user = { legacyAdmin: true };
      return next();
    }

    if (ENV.JWT_SECRET && token) {
      try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET);
        const userId = decoded.userId;
        const cached = userGuildsCache.get(userId);
        if (!cached || Date.now() > cached.expiresAt) {
          return res.status(401).json({ ok: false, error: "Sessão expirada. Faça login novamente." });
        }
        req.user = { userId, guildIds: cached.guildIds };
        return next();
      } catch {
        // JWT inválido ou expirado
      }
    }

    return res.status(401).json({ ok: false, error: "Não autorizado." });
  });

  // --- Guilds & Configs ---

  app.get("/guilds", (req, res) => {
    try {
      const allowedIds = getAllowedGuildIds(req);
      const guildsArray = allowedIds === null
        ? [...client.guilds.cache.values()]
        : allowedIds.map((id) => client.guilds.cache.get(id)).filter(Boolean);
      const guilds = guildsArray.map((g) => {
        const config = getGuildConfig(g.id);
        return {
          id: g.id,
          name: g.name,
          protectionsCount: config.protections?.length || 0,
          hasCommandLogs: !!config.commandLogs,
          soundboardCount: config.soundboard?.length || 0,
        };
      });

      return res.json({ ok: true, data: guilds });
    } catch (err) {
      console.error("Erro em GET /guilds:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // Middleware: bloqueia acesso a guild sem permissão
  app.use("/guilds/:guildId", (req, res, next) => {
    const { guildId } = req.params;
    if (guildId && !canAccessGuild(req, guildId)) {
      return res.status(403).json({ ok: false, error: "Sem permissão para este servidor." });
    }
    next();
  });

  app.get("/guilds/:guildId", (req, res) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      const config = getGuildConfig(guildId);
      const blacklist = listBlacklist(guildId);
      const sounds = getSounds(guildId);
      const stats = getGuildStats(guildId);

      return res.json({
        ok: true,
        data: {
          guild: guild
            ? {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
              }
            : { id: guildId },
          config: {
            protections: config.protections || [],
            commandLogs: config.commandLogs || null,
            narradorSayUser: config.narradorSayUser || false,
            maxSoundDuration: getMaxSoundDuration(guildId),
            soundboardVolume: getSoundboardVolume(guildId),
          },
          blacklist,
          soundboard: {
            count: sounds.length,
            sounds,
          },
          stats,
        },
      });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // --- Proteções ---

  app.get("/guilds/:guildId/protections", (req, res) => {
    const { guildId } = req.params;
    try {
      const protections = listProtections(guildId);
      const stats = getGuildStats(guildId);
      return res.json({ ok: true, data: { protections, stats } });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId/protections:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.post("/guilds/:guildId/protections", (req, res) => {
    const { guildId } = req.params;
    const { targetId, triggerId, mode = "instant", cooldownSeconds, channelId } = req.body || {};

    if (!targetId || !triggerId) {
      return res.status(400).json({ ok: false, error: "targetId e triggerId são obrigatórios." });
    }

    if (mode === "channel" && !channelId) {
      return res.status(400).json({ ok: false, error: "channelId é obrigatório quando mode é 'channel'." });
    }

    try {
      let timeWindowMs = 2000;
      if (mode !== "channel" && mode !== "persistent" && typeof cooldownSeconds === "number") {
        if (cooldownSeconds < 1 || cooldownSeconds > 10) {
          return res.status(400).json({
            ok: false,
            error: "cooldownSeconds deve estar entre 1 e 10.",
          });
        }
        timeWindowMs = cooldownSeconds * 1000;
      }

      const success = addProtection(guildId, targetId, triggerId, timeWindowMs, mode, mode === "channel" ? channelId : null);
      if (!success) {
        return res.status(409).json({
          ok: false,
          error: "Proteção já existe para este target/trigger/modo (e canal, se channel).",
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("Erro em POST /guilds/:guildId/protections:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.patch("/guilds/:guildId/protections", (req, res) => {
    const { guildId } = req.params;
    const {
      targetId,
      triggerId,
      currentMode,
      newMode = null,
      cooldownSeconds = null,
      currentChannelId = null,
    } = req.body || {};

    if (!targetId || !triggerId || !currentMode) {
      return res.status(400).json({
        ok: false,
        error: "targetId, triggerId e currentMode são obrigatórios.",
      });
    }

    try {
      let cooldown = null;
      if (cooldownSeconds !== null && cooldownSeconds !== undefined) {
        if (typeof cooldownSeconds !== "number" || cooldownSeconds < 1 || cooldownSeconds > 10) {
          return res.status(400).json({
            ok: false,
            error: "cooldownSeconds deve estar entre 1 e 10.",
          });
        }
        cooldown = cooldownSeconds;
      }

      const result = updateProtection(
        guildId,
        targetId,
        triggerId,
        currentMode,
        newMode,
        cooldown,
        currentMode === "channel" ? currentChannelId : null
      );

      if (!result) {
        return res.status(404).json({
          ok: false,
          error: "Proteção não encontrada.",
        });
      }

      if (!result.success) {
        return res.status(400).json({ ok: false, error: result.error || "Falha ao atualizar." });
      }

      return res.json({ ok: true, data: result });
    } catch (err) {
      console.error("Erro em PATCH /guilds/:guildId/protections:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.delete("/guilds/:guildId/protections", (req, res) => {
    const { guildId } = req.params;
    const { targetId, triggerId, mode = null, channelId = null } = req.body || {};

    if (!targetId || !triggerId) {
      return res.status(400).json({
        ok: false,
        error: "targetId e triggerId são obrigatórios.",
      });
    }

    try {
      const removed = removeProtection(guildId, targetId, triggerId, mode, mode === "channel" ? channelId : null);
      if (!removed) {
        return res.status(404).json({ ok: false, error: "Proteção não encontrada." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("Erro em DELETE /guilds/:guildId/protections:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // --- Blacklist ---

  app.get("/guilds/:guildId/blacklist", (req, res) => {
    const { guildId } = req.params;
    try {
      const data = listBlacklist(guildId);
      return res.json({ ok: true, data });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId/blacklist:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.post("/guilds/:guildId/blacklist/user", (req, res) => {
    const { guildId } = req.params;
    const { userId, action } = req.body || {};

    if (!userId || !action) {
      return res.status(400).json({
        ok: false,
        error: "userId e action ('add' | 'remove') são obrigatórios.",
      });
    }

    try {
      if (action === "add") {
        const success = addUserBlacklist(guildId, userId);
        if (!success) {
          return res.status(409).json({
            ok: false,
            error: "Usuário já está na blacklist completa.",
          });
        }
        // Limpa comandos específicos, mesma regra do comando slash
        clearUserCommands(guildId, userId);
        return res.json({ ok: true });
      }

      if (action === "remove") {
        const success = removeUserBlacklist(guildId, userId);
        if (!success) {
          return res.status(404).json({
            ok: false,
            error: "Usuário não estava na blacklist completa.",
          });
        }
        clearUserCommands(guildId, userId);
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "action inválida." });
    } catch (err) {
      console.error("Erro em POST /guilds/:guildId/blacklist/user:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.post("/guilds/:guildId/blacklist/commands", (req, res) => {
    const { guildId } = req.params;
    const { userId, commands, action } = req.body || {};

    if (!userId || !Array.isArray(commands) || !action) {
      return res.status(400).json({
        ok: false,
        error: "userId, commands (array) e action ('add' | 'remove') são obrigatórios.",
      });
    }

    try {
      const normalized = commands
        .map((c) => String(c).trim().toLowerCase())
        .filter((c) => c.length > 0);

      if (normalized.length === 0) {
        return res.status(400).json({ ok: false, error: "Nenhum comando válido fornecido." });
      }

      if (action === "add") {
        const added = [];
        const already = [];

        for (const cmd of normalized) {
          const success = addCommandBlacklist(guildId, userId, cmd);
          if (success) added.push(cmd);
          else already.push(cmd);
        }

        return res.json({ ok: true, data: { added, already } });
      }

      if (action === "remove") {
        const removed = [];
        const notBlocked = [];

        for (const cmd of normalized) {
          const success = removeCommandBlacklist(guildId, userId, cmd);
          if (success) removed.push(cmd);
          else notBlocked.push(cmd);
        }

        return res.json({ ok: true, data: { removed, notBlocked } });
      }

      return res.status(400).json({ ok: false, error: "action inválida." });
    } catch (err) {
      console.error("Erro em POST /guilds/:guildId/blacklist/commands:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // --- Narrador ---

  app.get("/guilds/:guildId/narrador", (req, res) => {
    const { guildId } = req.params;
    try {
      const narradorSayUser = getNarradorSayUser(guildId);

      // Contagem aproximada de usuários com config (apenas leitura)
      let userConfigsCount = 0;
      try {
        // Reutiliza o path interno de userConfigs via getUserConfig em um ID fictício
        // e leitura direta do arquivo, se necessário, mas aqui mantemos simples:
        // não temos acesso direto ao Map interno, então essa métrica é opcional.
        // Para já entregar valor, deixamos 0 (e podemos evoluir depois).
        userConfigsCount = 0;
      } catch {
        userConfigsCount = 0;
      }

      return res.json({
        ok: true,
        data: {
          narradorSayUser,
          userConfigsCount,
        },
      });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId/narrador:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.patch("/guilds/:guildId/narrador", (req, res) => {
    const { guildId } = req.params;
    const { enabled } = req.body || {};

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        ok: false,
        error: "enabled (boolean) é obrigatório.",
      });
    }

    try {
      const changed = setNarradorSayUser(guildId, enabled);
      return res.json({ ok: true, data: { changed } });
    } catch (err) {
      console.error("Erro em PATCH /guilds/:guildId/narrador:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // --- Soundboard ---

  app.get("/guilds/:guildId/soundboard", (req, res) => {
    const { guildId } = req.params;
    try {
      const sounds = getSounds(guildId);
      const maxDuration = getMaxSoundDuration(guildId);
      const volume = getSoundboardVolume(guildId);

      return res.json({
        ok: true,
        data: {
          count: sounds.length,
          sounds,
          maxDuration,
          volume,
        },
      });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId/soundboard:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.patch("/guilds/:guildId/soundboard/settings", (req, res) => {
    const { guildId } = req.params;
    const { maxDuration, volume } = req.body || {};

    try {
      const result = {
        maxDuration: null,
        volume: null,
      };

      if (maxDuration !== undefined) {
        const r = setMaxSoundDuration(guildId, maxDuration);
        if (!r.success) {
          return res.status(400).json({ ok: false, error: r.error || "Erro ao configurar duração." });
        }
        result.maxDuration = maxDuration;
      }

      if (volume !== undefined) {
        const r = setSoundboardVolume(guildId, volume);
        if (!r.success) {
          return res.status(400).json({ ok: false, error: r.error || "Erro ao configurar volume." });
        }
        result.volume = volume;
      }

      return res.json({ ok: true, data: result });
    } catch (err) {
      console.error("Erro em PATCH /guilds/:guildId/soundboard/settings:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // --- Logs ---

  app.get("/guilds/:guildId/logs", (req, res) => {
    const { guildId } = req.params;
    try {
      const logs = getCommandLogs(guildId) || null;
      return res.json({ ok: true, data: logs });
    } catch (err) {
      console.error("Erro em GET /guilds/:guildId/logs:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  app.patch("/guilds/:guildId/logs", (req, res) => {
    const { guildId } = req.params;
    const { action, channelId, type, commands, commandName } = req.body || {};

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "action ('set' | 'remove') é obrigatória.",
      });
    }

    try {
      if (action === "set") {
        if (!channelId) {
          return res.status(400).json({
            ok: false,
            error: "channelId é obrigatório para action 'set'.",
          });
        }

        const cmds =
          commands && Array.isArray(commands)
            ? commands.map((c) => String(c).trim()).filter((c) => c.length > 0)
            : null;

        const result = setCommandLogs(guildId, channelId, cmds, type || "commands");
        if (!result.success) {
          return res.status(400).json({ ok: false, error: result.error || "Erro ao configurar logs." });
        }
        return res.json({ ok: true, data: result });
      }

      if (action === "remove") {
        const removed = removeCommandLogs(guildId, commandName || null, type || null);
        if (!removed) {
          return res.status(404).json({
            ok: false,
            error: "Nenhuma configuração de log correspondente foi encontrada para remoção.",
          });
        }
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "action inválida." });
    } catch (err) {
      console.error("Erro em PATCH /guilds/:guildId/logs:", err);
      return res.status(500).json({ ok: false, error: "Erro interno." });
    }
  });

  // Inicia o servidor
  app.listen(ENV.PANEL_PORT, () => {
    console.log(`🌐 API do painel ouvindo em http://localhost:${ENV.PANEL_PORT}`);
  });
}

