import {
    getProtectionsForTarget,
  } from "../state/guildConfigs.js";
import { recordActivation, recordDisconnect } from "../utils/stats.js";
import { logProtectionActivation, logTargetEntered } from "../utils/logger.js";
  
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
   * Rastreia desconexões agrupadas por chave única
   * Formato: { key: { count: number, firstDisconnectAt: timestamp, target: User, trigger: User, channel: Channel } }
   */
  const disconnectTracking = new Map();
  
  /**
   * Cria uma chave única
   */
  function makeKey(guildId, targetId, triggerId, channelId) {
    return `${guildId}:${targetId}:${triggerId}:${channelId}`;
  }
  
  /**
   * Processa e loga desconexão agrupada
   * Retorna true se processou, false se já foi processado ou não havia tracking
   */
  async function processGroupedDisconnect(key, guild, target, trigger, channel, timeWindow) {
    // Verifica e remove o tracking atomicamente para evitar race conditions
    const tracking = disconnectTracking.get(key);
    if (!tracking) {
      return false;
    }

    // Remove o tracking ANTES de processar para evitar processamento duplicado
    disconnectTracking.delete(key);
    
    const count = tracking.count;
    const client = guild.client;

    // Loga apenas uma vez com contador (passa timeWindow em vez de diff)
    await logProtectionActivation(
      client,
      guild.id,
      target,
      trigger,
      channel,
      timeWindow,
      count
    );
    
    return true;
  }

  /**
   * Verifica e desconecta o trigger se estiver no canal
   */
  async function checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt, targetId, targetMember) {
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
        
        // Rastreia desconexão para agrupamento
        const key = makeKey(guild.id, targetId, triggerId, channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        
        if (!disconnectTracking.has(key)) {
          // Primeira desconexão - inicia tracking
          disconnectTracking.set(key, {
            count: 1,
            firstDisconnectAt: now,
            target: targetMember?.user || { id: targetId, tag: targetId, username: targetId },
            trigger: triggerMember.user,
            channel: channel || { id: channelId },
            guild,
          });
        } else {
          // Incrementa contador
          const tracking = disconnectTracking.get(key);
          tracking.count++;
        }

        // Registra estatísticas
        recordDisconnect(guild.id, targetId, triggerId);
        
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
  function startProtectionInterval(key, guild, triggerId, channelId, timeWindow, armedAt, targetId, targetMember) {
    // Remove intervalo anterior se existir
    if (activeIntervals.has(key)) {
      clearInterval(activeIntervals.get(key));
    }
    
    // Verifica imediatamente
    checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt, targetId, targetMember);
    
    // Configura intervalo para verificar a cada 100ms durante a janela de proteção
    const interval = setInterval(async () => {
      const now = Date.now();
      const diff = now - armedAt;
      
      // Se a janela expirou, processa desconexões agrupadas e limpa
      if (diff > timeWindow) {
        clearInterval(interval);
        activeIntervals.delete(key);
        
        // Processa desconexões agrupadas pendentes (se ainda existir)
        const tracking = disconnectTracking.get(key);
        if (tracking) {
          await processGroupedDisconnect(
            key,
            guild,
            tracking.target,
            tracking.trigger,
            tracking.channel,
            timeWindow
          );
        }
        
        return;
      }
      
      // Verifica e desconecta se necessário
      await checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt, targetId, targetMember);
    }, 100); // Verifica a cada 100ms
    
    activeIntervals.set(key, interval);
    
    // Limpa automaticamente após a janela expirar (apenas limpa o intervalo, não processa tracking)
    // O setInterval já processa quando expira, então não precisamos processar aqui novamente
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
        const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
        
        // Registra ativação para cada proteção
        for (const p of protections) {
          recordActivation(guildId, p.targetId, p.triggerId);
        }
        
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
          startProtectionInterval(key, guild, p.triggerId, targetChannelId, p.timeWindow, now, p.targetId, member);
        }

        // Loga entrada do target
        await logTargetEntered(
          guild.client,
          guildId,
          member.user,
          targetChannel || { id: targetChannelId },
          protections.length
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
      const triggerChannel = await guild.channels.fetch(triggerChannelId).catch(() => null);
      
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
            
            // Busca informações do target
            const targetMember = await guild.members.fetch(targetId).catch(() => null);
            
            // Rastreia desconexão para agrupamento
            if (!disconnectTracking.has(key)) {
              disconnectTracking.set(key, {
                count: 1,
                firstDisconnectAt: now,
                target: targetMember?.user || { id: targetId, tag: targetId, username: targetId },
                trigger: member.user,
                channel: triggerChannel || { id: triggerChannelId },
                guild,
              });
            } else {
              const tracking = disconnectTracking.get(key);
              tracking.count++;
            }

            // Registra estatísticas
            recordDisconnect(guildId, targetId, triggerId);
            
            // Processa e loga desconexão agrupada imediatamente (passa timeWindow em vez de diff)
            await processGroupedDisconnect(
              key,
              guild,
              targetMember?.user || { id: targetId, tag: targetId, username: targetId },
              member.user,
              triggerChannel || { id: triggerChannelId },
              data.timeWindow
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
