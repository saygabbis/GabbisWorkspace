import {
    getProtectionsForTarget,
  } from "../state/guildConfigs.js";
  
  /**
   * Guarda janelas armadas por:
   * guildId + targetId + triggerId + channelId
   * Inclui channelId para garantir que só desconecta se estiver no mesmo canal
   */
  const armedWindows = new Map();
  
  /**
   * Guarda intervalos ativos para verificar e desconectar triggers
   */
  const activeIntervals = new Map();
  
  /**
   * Cria uma chave única
   */
  function makeKey(guildId, targetId, triggerId, channelId) {
    return `${guildId}:${targetId}:${triggerId}:${channelId}`;
  }
  
  /**
   * Verifica e desconecta o trigger se estiver no canal
   */
  async function checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt) {
    const now = Date.now();
    const diff = now - armedAt;
    
    // Se a janela expirou, não faz nada
    if (diff > timeWindow) {
      return false;
    }
    
    try {
      // Busca o membro do trigger no servidor
      const triggerMember = await guild.members.fetch(triggerId).catch(() => null);
      
      if (!triggerMember) {
        return false;
      }
      
      // Verifica se o trigger está no mesmo canal
      if (triggerMember.voice.channelId === channelId) {
        // Desconecta o trigger
        await triggerMember.voice.disconnect().catch(err => {
          console.error(`Erro ao desconectar trigger ${triggerMember.user.tag}:`, err.message);
        });
        
        console.log(
          `🚫 Trigger ${triggerMember.user.tag} removido (proteção ativa, ${diff}ms após target entrar)`
        );
        return true;
      }
    } catch (err) {
      console.error(`Erro ao verificar trigger ${triggerId}:`, err.message);
    }
    
    return false;
  }
  
  /**
   * Inicia um intervalo para verificar e desconectar o trigger periodicamente
   */
  function startProtectionInterval(key, guild, triggerId, channelId, timeWindow, armedAt) {
    // Remove intervalo anterior se existir
    if (activeIntervals.has(key)) {
      clearInterval(activeIntervals.get(key));
    }
    
    // Verifica imediatamente
    checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt);
    
    // Configura intervalo para verificar a cada 100ms durante a janela de proteção
    const interval = setInterval(async () => {
      const now = Date.now();
      const diff = now - armedAt;
      
      // Se a janela expirou, limpa o intervalo
      if (diff > timeWindow) {
        clearInterval(interval);
        activeIntervals.delete(key);
        return;
      }
      
      // Verifica e desconecta se necessário
      await checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt);
    }, 100); // Verifica a cada 100ms
    
    activeIntervals.set(key, interval);
    
    // Limpa automaticamente após a janela expirar
    setTimeout(() => {
      if (activeIntervals.has(key)) {
        clearInterval(activeIntervals.get(key));
        activeIntervals.delete(key);
      }
    }, timeWindow + 100);
  }
  
  /**
   * Limpa janelas expiradas e intervalos
   */
  function cleanupExpiredWindows(now) {
    const expired = [];
    for (const [key, data] of armedWindows.entries()) {
      if (now - data.armedAt > data.timeWindow) {
        expired.push(key);
      }
    }
    expired.forEach(key => {
      armedWindows.delete(key);
      if (activeIntervals.has(key)) {
        clearInterval(activeIntervals.get(key));
        activeIntervals.delete(key);
      }
    });
    if (expired.length > 0) {
      console.log(`🧹 ${expired.length} janela(s) de proteção expirada(s) removida(s)`);
    }
  }
  
  export async function onVoiceStateUpdate(oldState, newState) {
    const member = newState.member;
    if (!member) return;
  
    const guildId = newState.guild?.id;
    if (!guildId) return;
    
    const guild = newState.guild;
    if (!guild) return;
  
    const now = Date.now();
    
    // Limpa janelas expiradas a cada evento
    cleanupExpiredWindows(now);
  
    const movedChannel =
      oldState.channelId !== newState.channelId &&
      newState.channelId !== null;
  
    // ===============================
    // 1️⃣ TARGET entrou ou trocou de call
    // ===============================
    if (movedChannel) {
      const protections = getProtectionsForTarget(
        guildId,
        member.id
      );
  
      if (protections.length > 0) {
        const targetChannelId = newState.channelId;
        
        for (const p of protections) {
          const key = makeKey(
            guildId,
            p.targetId,
            p.triggerId,
            targetChannelId
          );
  
          // Remove intervalo anterior se existir
          if (activeIntervals.has(key)) {
            clearInterval(activeIntervals.get(key));
            activeIntervals.delete(key);
          }
  
          armedWindows.set(key, {
            armedAt: now,
            timeWindow: p.timeWindow,
            targetChannelId,
          });
          
          // Inicia verificação contínua do trigger
          startProtectionInterval(key, guild, p.triggerId, targetChannelId, p.timeWindow, now);
        }
  
        console.log(
          `🟣 Target ${member.user.tag} entrou/trocou de call no canal ${targetChannelId} (${protections.length} proteção(ões) armada(s))`
        );
      }
  
      return;
    }
  
    // ===============================
    // 2️⃣ TRIGGER entrou em call (ou mudou de canal)
    // ===============================
    const triggerEnteredOrMoved =
      oldState.channelId !== newState.channelId &&
      newState.channelId !== null;
  
    if (triggerEnteredOrMoved) {
      const triggerChannelId = newState.channelId;
      
      // Procura por janelas armadas onde o trigger está entrando no mesmo canal do target
      for (const [key, data] of armedWindows.entries()) {
        const [gId, targetId, triggerId, channelId] = key.split(":");
  
        if (
          gId === guildId &&
          triggerId === member.id &&
          channelId === triggerChannelId // IMPORTANTE: só desconecta se estiver no mesmo canal
        ) {
          const diff = now - data.armedAt;
  
          if (diff <= data.timeWindow) {
            // Desconecta imediatamente
            await newState.disconnect().catch(err => {
              console.error(`Erro ao desconectar trigger ${member.user.tag}:`, err.message);
            });
            console.log(
              `🚫 Trigger ${member.user.tag} removido (proteção ativa, ${diff}ms após target entrar)`
            );
          } else {
            console.log(
              `⏰ Trigger ${member.user.tag} entrou após janela expirar (${diff}ms, limite: ${data.timeWindow}ms)`
            );
          }
  
          // Remove a janela após verificar (mesmo que tenha expirado)
          armedWindows.delete(key);
          if (activeIntervals.has(key)) {
            clearInterval(activeIntervals.get(key));
            activeIntervals.delete(key);
          }
        }
      }
    }
  }
