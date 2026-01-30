import express from "express";
import cors from "cors";
import { ENV } from "../config/env.js";
import { getGuildConfig, listProtections, addProtection, updateProtection, removeProtection, getMaxSoundDuration, setMaxSoundDuration, getSoundboardVolume, setSoundboardVolume, getNarradorSayUser, setNarradorSayUser, getCommandLogs, setCommandLogs, removeCommandLogs } from "../state/guildConfigs.js";
import { listBlacklist, addUserBlacklist, removeUserBlacklist, addCommandBlacklist, removeCommandBlacklist, clearUserCommands } from "../state/blacklist.js";
import { getSounds } from "../state/soundboard.js";
import { getGuildStats } from "../utils/stats.js";

// OBS: userConfigs é usado apenas para métricas simples (ex.: contagem), não para mutação via API nessa primeira versão
import { getUserConfig } from "../state/userConfigs.js";

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

  // Login simples: valida PANEL_TOKEN enviado no corpo
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

    // Não geramos sessão separada por enquanto; o próprio PANEL_TOKEN é o segredo.
    return res.json({ ok: true });
  });

  // Middleware de auth para as demais rotas
  app.use((req, res, next) => {
    if (!ENV.PANEL_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "PANEL_TOKEN não configurado no servidor.",
      });
    }

    const header = req.headers["authorization"] || "";
    const expected = `Bearer ${ENV.PANEL_TOKEN}`;

    if (header !== expected) {
      return res.status(401).json({ ok: false, error: "Não autorizado." });
    }

    return next();
  });

  // --- Guilds & Configs ---

  app.get("/guilds", (req, res) => {
    try {
      const guilds = client.guilds.cache.map((g) => {
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

