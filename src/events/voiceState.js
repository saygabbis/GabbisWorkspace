import {
  getProtectionsForTarget,
  getProtectionsForChannel,
} from "../state/guildConfigs.js";
import { recordActivation, recordDisconnect } from "../utils/stats.js";
import { logProtectionActivation, logTargetEntered, logWarn, logError, logExternalInterference, logRecovery } from "../utils/logger.js";
import {
  isTriggerInCooldown,
  recordDisconnectAndApplyCooldown,
  cleanupExpiredCooldowns,
  registerActiveProtection,
  unregisterActiveProtection,
  getActiveProtectionsForChannel,
} from "../state/voiceProtection.js";
import { isConnected, getCurrentChannel, onUnexpectedDisconnect, clearUnexpectedDisconnection, disconnectFromChannel } from "../utils/voiceManager.js";
  
  // Timeouts de auto-desconexão por guild (quando o bot fica sozinho em call)
  const autoDisconnectTimers = new Map(); // guildId -> timeoutId
  
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
   * Guarda proteções persistentes ativas
   * Formato: { key: { targetChannelId, protection, targetMember, intervalId } }
   * key: guildId:targetId:triggerId
   */
  const persistentProtections = new Map();
  
  /**
   * Cache de permissões do bot por canal (para otimização)
   * Formato: channelId -> { hasPermission: boolean, cachedAt: timestamp }
   */
  const permissionCache = new Map();
  const PERMISSION_CACHE_TTL = 30000; // 30 segundos
  
  /**
   * Cria uma chave única
   */
  function makeKey(guildId, targetId, triggerId, channelId) {
    return `${guildId}:${targetId}:${triggerId}:${channelId}`;
  }

  /**
   * Cria uma chave única para proteções persistentes (sem channelId)
   */
  function makePersistentKey(guildId, targetId, triggerId) {
    return `${guildId}:${targetId}:${triggerId}`;
  }
  
  /**
   * Verifica se bot tem permissão para desconectar membros (com cache)
   */
  async function canDisconnectMember(guild, channelId) {
    // Verifica cache primeiro
    const cached = permissionCache.get(channelId);
    const now = Date.now();
    
    if (cached && (now - cached.cachedAt) < PERMISSION_CACHE_TTL) {
      return cached.hasPermission;
    }
    
    try {
      const botMember = await guild.members.fetch(guild.client.user.id);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      
      if (!channel) {
        permissionCache.set(channelId, { hasPermission: false, cachedAt: now });
        return false;
      }
      
      const hasPermission = channel.permissionsFor(botMember)?.has('DisconnectMembers') || false;
      permissionCache.set(channelId, { hasPermission, cachedAt: now });
      return hasPermission;
    } catch (err) {
      logError(`Erro ao verificar permissões do bot:`, err);
      permissionCache.set(channelId, { hasPermission: false, cachedAt: now });
      return false;
    }
  }
  
  /**
   * Verifica se trigger específico já está no canal ANTES de armar proteção
   * Previne race condition
   */
  async function checkTriggerBeforeArming(guild, triggerId, targetChannelId) {
    try {
      const triggerMember = await guild.members.fetch(triggerId).catch(() => null);
      
      if (!triggerMember) {
        return false;
      }
      
      // Verifica APENAS o trigger específico (não verifica outros usuários)
      if (triggerMember.voice.channelId === targetChannelId) {
        // Trigger específico já está no canal - verifica permissões e desconecta
        const hasPermission = await canDisconnectMember(guild, targetChannelId);
        
        if (!hasPermission) {
          logWarn(`Bot não tem permissão para desconectar trigger ${triggerMember.user.tag} do canal ${targetChannelId}`);
          return false;
        }
        
        await triggerMember.voice.disconnect().catch(err => {
          logError(`Erro ao desconectar trigger ${triggerMember.user.tag}:`, err);
        });
        
        return true;
      }
    } catch (err) {
      logError(`Erro ao verificar trigger antes de armar:`, err);
    }
    
    return false;
  }

  /**
   * Verifica e desconecta trigger em proteção persistent se necessário
   * OTIMIZADO: evento-driven, sem polling - só verifica quando necessário
   */
  async function checkPersistentProtection(guild, triggerId, targetChannelId, protection, targetMember) {
    try {
      // Verifica se target ainda está no canal
      const targetMemberCurrent = await guild.members.fetch(protection.targetId).catch(() => null);
      if (!targetMemberCurrent || targetMemberCurrent.voice.channelId !== targetChannelId) {
        return; // Target não está mais no canal
      }
      
      // Verifica se trigger está em cooldown
      const cooldownCheck = isTriggerInCooldown(guild.id, protection.targetId, triggerId);
      if (cooldownCheck.inCooldown) {
        // Trigger está em cooldown - não tenta entrar ainda
        return;
      }
      
      const triggerMember = await guild.members.fetch(triggerId).catch(() => null);
      
      if (!triggerMember) {
        return;
      }
      
      // Se o trigger está no mesmo canal do target, desconecta
      if (triggerMember.voice.channelId === targetChannelId) {
        // Verifica permissões antes de desconectar
        const hasPermission = await canDisconnectMember(guild, targetChannelId);
        if (!hasPermission) {
          logWarn(`Bot não tem permissão para desconectar trigger ${triggerMember.user.tag} do canal ${targetChannelId}`);
          return;
        }
        
        await triggerMember.voice.disconnect().catch(err => {
          logError(`Erro ao desconectar trigger ${triggerMember.user.tag}:`, err);
        });
        
        // Aplica cooldown progressivo
        const cooldownInfo = recordDisconnectAndApplyCooldown(guild.id, protection.targetId, triggerId);
        
        // Registra estatísticas
        recordDisconnect(guild.id, protection.targetId, triggerId);
        
        // Busca canal para log
        const channel = await guild.channels.fetch(targetChannelId).catch(() => ({ id: targetChannelId }));
        
        // Loga a ativação (timeWindow = 0 para modo persistent)
        await logProtectionActivation(
          guild.client,
          guild.id,
          targetMember?.user || { id: protection.targetId },
          triggerMember.user,
          channel,
          0, // Persistent não tem timeWindow
          1
        );
      }
    } catch (err) {
      logError(`Erro ao verificar proteção persistent:`, err);
    }
  }
  
  /**
   * Inicia monitoramento contínuo para modo Persistent (otimizado - 2 segundos)
   */
  function startPersistentMonitoring(key, guild, triggerId, targetChannelId, protection, targetMember) {
    // Remove monitoramento anterior se existir
    const existing = persistentProtections.get(key);
    if (existing?.intervalId) {
      clearInterval(existing.intervalId);
    }
    
    // Verifica imediatamente uma vez
    checkPersistentProtection(guild, triggerId, targetChannelId, protection, targetMember);
    
    // Inicia verificação periódica (a cada 2 segundos - otimizado)
    const intervalId = setInterval(async () => {
      const protectionData = persistentProtections.get(key);
      if (!protectionData) {
        // Proteção foi removida, limpa intervalo
        clearInterval(intervalId);
        return;
      }
      
      // Verifica se target ainda está no canal
      const targetMemberCurrent = await guild.members.fetch(protection.targetId).catch(() => null);
      if (!targetMemberCurrent || targetMemberCurrent.voice.channelId !== protection.targetChannelId) {
        // Target saiu, limpa proteção
        persistentProtections.delete(key);
        clearInterval(intervalId);
        unregisterActiveProtection(protection.targetChannelId, key);
        return;
      }
      
      // Verifica proteção
      await checkPersistentProtection(
        guild,
        triggerId,
        protection.targetChannelId,
        protection,
        targetMemberCurrent
      );
    }, 2000); // Verifica a cada 2 segundos (otimizado)
    
    // Atualiza proteção com intervalId
    persistentProtections.set(key, {
      ...persistentProtections.get(key),
      intervalId,
    });
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
   * Inclui verificações de estado, permissões e cooldown
   */
  async function checkAndDisconnectTrigger(guild, triggerId, channelId, timeWindow, armedAt, targetId, targetMember) {
    const now = Date.now();
    const diff = now - armedAt;
    
    // Se a janela expirou, não faz nada
    if (diff > timeWindow) {
      return false;
    }
    
    try {
      // Verifica se target ainda está no canal (validação de integridade)
      const targetMemberCurrent = await guild.members.fetch(targetId).catch(() => null);
      if (!targetMemberCurrent || targetMemberCurrent.voice.channelId !== channelId) {
        // Target não está mais no canal, não precisa proteger
        return false;
      }
      
      // Verifica se trigger está em cooldown
      const cooldownCheck = isTriggerInCooldown(guild.id, targetId, triggerId);
      if (cooldownCheck.inCooldown) {
        // Trigger está em cooldown, mas ainda tenta entrar - desconecta mesmo assim
        // (cooldown é aplicado após desconexão, não antes)
      }
      
      // Verifica permissões do bot
      const hasPermission = await canDisconnectMember(guild, channelId);
      if (!hasPermission) {
        logWarn(`Bot não tem permissão para desconectar trigger ${triggerId} do canal ${channelId}`);
        return false;
      }
      
      // Busca o membro do trigger no servidor
      const triggerMember = await guild.members.fetch(triggerId).catch(() => null);
      
      if (!triggerMember) {
        return false;
      }
      
      // Verifica se o trigger está no mesmo canal
      if (triggerMember.voice.channelId === channelId) {
        // Desconecta o trigger
        await triggerMember.voice.disconnect().catch(err => {
          logError(`Erro ao desconectar trigger ${triggerMember.user.tag}:`, err);
        });
        
        // Aplica cooldown progressivo
        const cooldownInfo = recordDisconnectAndApplyCooldown(guild.id, targetId, triggerId);
        
        // Rastreia desconexão para agrupamento
        const key = makeKey(guild.id, targetId, triggerId, channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        
        if (!disconnectTracking.has(key)) {
          // Primeira desconexão - inicia tracking
          disconnectTracking.set(key, {
            count: 1,
            firstDisconnectAt: now,
            target: targetMemberCurrent?.user || { id: targetId, tag: targetId, username: targetId },
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
      logError(`Erro ao verificar trigger ${triggerId}:`, err);
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
      // Remove registro de proteção ativa
      const [gId, targetId, triggerId, channelId] = key.split(":");
      unregisterActiveProtection(channelId, key);
    });
    if (expired.length > 0) {
      console.log(`🧹 ${expired.length} janela(s) de proteção expirada(s) removida(s)`);
    }
  }
  
  /**
   * Recupera proteções após desconexão inesperada do bot
   */
  async function recoverProtectionsAfterDisconnect(guild, channelId) {
    try {
      const activeProtections = getActiveProtectionsForChannel(channelId);
      
      if (activeProtections.size === 0) {
        return; // Nenhuma proteção ativa para recuperar
      }
      
      // Loga interferência externa
      await logExternalInterference(
        guild.client,
        guild.id,
        channelId,
        "Bot desconectado durante proteções ativas"
      );
      
      // Tenta recuperar cada proteção
      let recoveredCount = 0;
      
      for (const protectionKey of activeProtections) {
        try {
          // Para proteções persistentes
          if (persistentProtections.has(protectionKey)) {
            const protectionData = persistentProtections.get(protectionKey);
            const { protection, targetMember } = protectionData;
            
            // Verifica se target ainda está no canal
            const targetMemberCurrent = await guild.members.fetch(protection.targetId).catch(() => null);
            if (targetMemberCurrent && targetMemberCurrent.voice.channelId === channelId) {
              // Retoma monitoramento
              startPersistentMonitoring(
                protectionKey,
                guild,
                protection.triggerId,
                channelId,
                protection,
                targetMemberCurrent
              );
              recoveredCount++;
            } else {
              // Target não está mais no canal, remove proteção
              persistentProtections.delete(protectionKey);
              unregisterActiveProtection(channelId, protectionKey);
            }
          } else {
            // Para proteções Instant, verifica se ainda está dentro da janela
            const [gId, targetId, triggerId, chId] = protectionKey.split(":");
            if (chId === channelId) {
              const protectionData = armedWindows.get(protectionKey);
              if (protectionData) {
                const now = Date.now();
                const diff = now - protectionData.armedAt;
                
                if (diff <= protectionData.timeWindow) {
                  // Ainda dentro da janela, retoma verificação
                  const targetMember = await guild.members.fetch(targetId).catch(() => null);
                  if (targetMember && targetMember.voice.channelId === channelId) {
                    startProtectionInterval(
                      protectionKey,
                      guild,
                      triggerId,
                      channelId,
                      protectionData.timeWindow,
                      protectionData.armedAt,
                      targetId,
                      targetMember
                    );
                    recoveredCount++;
                  } else {
                    // Target não está mais no canal
                    armedWindows.delete(protectionKey);
                    unregisterActiveProtection(channelId, protectionKey);
                  }
                } else {
                  // Janela expirou
                  armedWindows.delete(protectionKey);
                  unregisterActiveProtection(channelId, protectionKey);
                }
              }
            }
          }
        } catch (err) {
          logError(`Erro ao recuperar proteção ${protectionKey}:`, err);
        }
      }
      
      if (recoveredCount > 0) {
        await logRecovery(guild.client, guild.id, channelId, recoveredCount);
      }
      
      // Limpa registro de desconexão inesperada
      clearUnexpectedDisconnection(guild.id);
    } catch (err) {
      logError(`Erro ao recuperar proteções após desconexão:`, err);
    }
  }
  
  /**
   * Inicializa sistema de detecção de desconexões inesperadas
   * Deve ser chamado uma vez na inicialização
   */
  export function initializeDisconnectDetection(client) {
    // Registra callback global para desconexões inesperadas
    client.guilds.cache.forEach(guild => {
      onUnexpectedDisconnect(guild.id, async (guildId, channelId, wasPlaying) => {
        if (!channelId) return;
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        
        // Verifica se há proteções ativas neste canal
        const activeProtections = getActiveProtectionsForChannel(channelId);
        if (activeProtections.size > 0) {
          // Tenta recuperar proteções
          await recoverProtectionsAfterDisconnect(guild, channelId);
        }
      });
    });
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
    
    // Limpa cooldowns expirados periodicamente (a cada 10 eventos para otimização)
    if (Math.random() < 0.1) { // ~10% dos eventos
      const cleaned = cleanupExpiredCooldowns();
      if (cleaned > 0) {
        // Log silencioso, apenas para debug se necessário
      }
    }
  
    const movedChannel =
      oldState.channelId !== newState.channelId &&
      newState.channelId !== null;

    const leftChannel = 
      oldState.channelId !== null &&
      newState.channelId === null;

    // ===============================
    // 0️⃣ MODO CHANNEL: target não pode entrar no canal enquanto trigger estiver nele (apenas esse canal)
    // ===============================
    if (movedChannel) {
      const targetChannelId = newState.channelId;
      const channelProtections = getProtectionsForChannel(guildId, targetChannelId);

      for (const p of channelProtections) {
        if (p.targetId !== member.id) continue;

        // Trigger está neste canal? Se sim, target não pode entrar — desconecta (anti-spam: sempre remove)
        const triggerMember = await guild.members.fetch(p.triggerId).catch(() => null);
        if (!triggerMember || triggerMember.voice.channelId !== targetChannelId) continue;

        const hasPermission = await canDisconnectMember(guild, targetChannelId);
        if (!hasPermission) {
          logWarn(`Bot não tem permissão para desconectar target (channel mode) no canal ${targetChannelId}`);
          continue;
        }

        await newState.disconnect().catch(err => {
          logError(`Erro ao desconectar target (channel mode) ${member.user.tag}:`, err);
        });

        recordDisconnect(guildId, p.targetId, p.triggerId);
        recordActivation(guildId, p.targetId, p.triggerId);

        const channel = await guild.channels.fetch(targetChannelId).catch(() => ({ id: targetChannelId }));
        await logProtectionActivation(
          guild.client,
          guildId,
          member.user,
          triggerMember.user,
          channel,
          0, // Channel: sem timeWindow, sempre remove (anti-spam)
          1,
          "channel" // Para o log exibir "Channel (canal específico)" em vez de "Persistent (contínuo)"
        );
        return; // Já processou: target foi removido do canal
      }
    }

    // ===============================
    // 1️⃣ TARGET entrou ou trocou de call (modos Instant / Persistent)
    // ===============================
    if (movedChannel) {
      // Validação de integridade: verifica se target ainda existe no servidor
      const targetMember = await guild.members.fetch(member.id).catch(() => null);
      if (!targetMember) {
        return; // Target não existe mais no servidor
      }
      
      const protections = getProtectionsForTarget(
        guildId,
        member.id
      ).filter((p) => p.mode !== "channel"); // Channel é tratado acima; aqui só Instant/Persistent

      if (protections.length > 0) {
        const targetChannelId = newState.channelId;
        const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
        
        // Verifica se canal ainda existe
        if (!targetChannel) {
          logWarn(`Canal ${targetChannelId} não encontrado ao target ${member.user.tag} entrar`);
          return;
        }
        
        // Verifica permissões do bot ANTES de armar proteções
        const hasPermission = await canDisconnectMember(guild, targetChannelId);
        if (!hasPermission) {
          logWarn(`Bot não tem permissão para desconectar no canal ${targetChannelId} - proteções não serão ativadas`);
          // Continua mesmo sem permissão, mas loga aviso
        }
        
        // Registra ativação para cada proteção
        for (const p of protections) {
          recordActivation(guildId, p.targetId, p.triggerId);
        }
        
        for (const p of protections) {
          // Validação de integridade: verifica se proteção ainda é válida
          if (!p || !p.targetId || !p.triggerId) {
            logWarn(`Proteção inválida encontrada para target ${member.id}`);
            continue;
          }
          
          // Validação de integridade: verifica se trigger ainda existe no servidor
          const triggerMember = await guild.members.fetch(p.triggerId).catch(() => null);
          if (!triggerMember) {
            logWarn(`Trigger ${p.triggerId} não existe mais no servidor - pulando proteção`);
            continue;
          }
          
          const mode = p.mode || "instant";

          // CRÍTICO: Verifica se trigger já está no canal ANTES de armar (previne race condition)
          const triggerAlreadyInChannel = await checkTriggerBeforeArming(guild, p.triggerId, targetChannelId);
          
          if (triggerAlreadyInChannel) {
            // Trigger foi desconectado, aplica cooldown
            recordDisconnectAndApplyCooldown(guildId, p.targetId, p.triggerId);
            recordDisconnect(guildId, p.targetId, p.triggerId);
            
            // Loga ativação imediata
            await logProtectionActivation(
              guild.client,
              guildId,
              member.user,
              { id: p.triggerId }, // Trigger será buscado no log se necessário
              targetChannel,
              mode === "persistent" ? 0 : p.timeWindow,
              1
            );
          }

          if (mode === "persistent") {
            // Modo Persistent: adiciona ao Map e inicia monitoramento contínuo
            const persistentKey = makePersistentKey(guildId, p.targetId, p.triggerId);
            persistentProtections.set(persistentKey, {
              targetChannelId,
              protection: p,
              targetMember: member,
              intervalId: null,
            });
            
            // Registra proteção ativa para recuperação
            registerActiveProtection(targetChannelId, persistentKey);

            // Inicia monitoramento contínuo (otimizado - 2 segundos)
            startPersistentMonitoring(persistentKey, guild, p.triggerId, targetChannelId, p, member);
          } else {
            // Modo Instant: comportamento original com janela de tempo
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
            
            // Registra proteção ativa para recuperação
            registerActiveProtection(targetChannelId, key);
            
            // Inicia verificação contínua do trigger
            startProtectionInterval(key, guild, p.triggerId, targetChannelId, p.timeWindow, now, p.targetId, member);
          }
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
    // 1.5️⃣ TARGET saiu da call (limpa proteções persistentes)
    // ===============================
    if (leftChannel) {
      const protections = getProtectionsForTarget(
        guildId,
        member.id
      );

      for (const p of protections) {
        const mode = p.mode || "instant";
        if (mode === "persistent") {
          const persistentKey = makePersistentKey(guildId, p.targetId, p.triggerId);
          const protectionData = persistentProtections.get(persistentKey);
          
          // Limpa intervalo se existir
          if (protectionData?.intervalId) {
            clearInterval(protectionData.intervalId);
          }
          
          persistentProtections.delete(persistentKey);
          
          // Remove registro de proteção ativa
          if (protectionData?.targetChannelId) {
            unregisterActiveProtection(protectionData.targetChannelId, persistentKey);
          }
        } else {
          // Limpa proteções Instant também
          const oldChannelId = oldState.channelId;
          if (oldChannelId) {
            const key = makeKey(guildId, p.targetId, p.triggerId, oldChannelId);
            armedWindows.delete(key);
            if (activeIntervals.has(key)) {
              clearInterval(activeIntervals.get(key));
              activeIntervals.delete(key);
            }
            unregisterActiveProtection(oldChannelId, key);
          }
        }
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
      
      // Primeiro verifica proteções persistentes (evento-driven, sem polling)
      for (const [persistentKey, data] of persistentProtections.entries()) {
        const [gId, targetId, triggerId] = persistentKey.split(":");
        
        if (
          gId === guildId &&
          triggerId === member.id &&
          data.targetChannelId === triggerChannelId
        ) {
          // Verifica se target ainda está no canal (validação de integridade)
          const targetMemberCurrent = await guild.members.fetch(targetId).catch(() => null);
          if (!targetMemberCurrent || targetMemberCurrent.voice.channelId !== triggerChannelId) {
            // Target não está mais no canal, limpa proteção
            persistentProtections.delete(persistentKey);
            if (data.intervalId) {
              clearInterval(data.intervalId);
            }
            unregisterActiveProtection(triggerChannelId, persistentKey);
            continue;
          }
          
          // Verifica permissões do bot
          const hasPermission = await canDisconnectMember(guild, triggerChannelId);
          if (!hasPermission) {
            logWarn(`Bot não tem permissão para desconectar trigger ${member.user.tag} do canal ${triggerChannelId}`);
            continue;
          }
          
          // Trigger tentou entrar no canal onde o target está - desconecta imediatamente
          await newState.disconnect().catch(err => {
            logError(`Erro ao desconectar trigger ${member.user.tag}:`, err);
          });
          
          // Aplica cooldown progressivo
          const cooldownInfo = recordDisconnectAndApplyCooldown(guildId, targetId, triggerId);
          
          // Busca informações do target
          const targetMember = targetMemberCurrent || data.targetMember;
          
          // Registra estatísticas
          recordDisconnect(guildId, targetId, triggerId);
          
          // Loga a ativação (timeWindow = 0 para modo persistent)
          await logProtectionActivation(
            guild.client,
            guildId,
            targetMember?.user || { id: targetId, tag: targetId, username: targetId },
            member.user,
            triggerChannel || { id: triggerChannelId },
            0, // Persistent não tem timeWindow
            1
          );
          
          return; // Já processou, não precisa verificar outras proteções
        }
      }
      
      // Depois verifica proteções Instant (comportamento original)
      for (const [key, data] of armedWindows.entries()) {
        const [gId, targetId, triggerId, channelId] = key.split(":");

        if (
          gId === guildId &&
          triggerId === member.id &&
          channelId === triggerChannelId // IMPORTANTE: só desconecta se estiver no mesmo canal
        ) {
          // Verifica se target ainda está no canal (validação de integridade)
          const targetMemberCurrent = await guild.members.fetch(targetId).catch(() => null);
          if (!targetMemberCurrent || targetMemberCurrent.voice.channelId !== triggerChannelId) {
            // Target não está mais no canal, limpa proteção
            armedWindows.delete(key);
            if (activeIntervals.has(key)) {
              clearInterval(activeIntervals.get(key));
              activeIntervals.delete(key);
            }
            unregisterActiveProtection(triggerChannelId, key);
            continue;
          }
          
          const diff = now - data.armedAt;

          if (diff <= data.timeWindow) {
            // Verifica permissões do bot
            const hasPermission = await canDisconnectMember(guild, triggerChannelId);
            if (!hasPermission) {
              logWarn(`Bot não tem permissão para desconectar trigger ${member.user.tag} do canal ${triggerChannelId}`);
              // Remove proteção já que não pode proteger
              armedWindows.delete(key);
              if (activeIntervals.has(key)) {
                clearInterval(activeIntervals.get(key));
                activeIntervals.delete(key);
              }
              unregisterActiveProtection(triggerChannelId, key);
              continue;
            }
            
            // Desconecta imediatamente
            await newState.disconnect().catch(err => {
              logError(`Erro ao desconectar trigger ${member.user.tag}:`, err);
            });
            
            // Aplica cooldown progressivo
            const cooldownInfo = recordDisconnectAndApplyCooldown(guildId, targetId, triggerId);
            
            // Busca informações do target
            const targetMember = targetMemberCurrent;
            
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
            logWarn(
              `⏰ Trigger ${member.user.tag} entrou após janela expirar (${diff}ms, limite: ${data.timeWindow}ms)`
            );
          }

          // Remove a janela após verificar (mesmo que tenha expirado)
          armedWindows.delete(key);
          if (activeIntervals.has(key)) {
            clearInterval(activeIntervals.get(key));
            activeIntervals.delete(key);
          }
          unregisterActiveProtection(triggerChannelId, key);
        }
      }
    }
  
    // ===============================
    // 3️⃣ AUTO-DESCONEXÃO APÓS 3 MINUTOS SOZINHO
    // ===============================
    try {
      const botId = guild.client.user.id;
      const guildIdForAuto = guild.id;
  
      // Verifica se o bot está conectado a algum canal de voz nesta guild
      if (!isConnected(guildIdForAuto)) {
        // Se não estiver conectado, garante que não há timeout pendente
        if (autoDisconnectTimers.has(guildIdForAuto)) {
          clearTimeout(autoDisconnectTimers.get(guildIdForAuto));
          autoDisconnectTimers.delete(guildIdForAuto);
        }
        return;
      }
  
      const currentChannelId = getCurrentChannel(guildIdForAuto);
      if (!currentChannelId) {
        if (autoDisconnectTimers.has(guildIdForAuto)) {
          clearTimeout(autoDisconnectTimers.get(guildIdForAuto));
          autoDisconnectTimers.delete(guildIdForAuto);
        }
        return;
      }
  
      const channel = guild.channels.cache.get(currentChannelId);
      if (!channel || !channel.isVoiceBased?.()) {
        if (autoDisconnectTimers.has(guildIdForAuto)) {
          clearTimeout(autoDisconnectTimers.get(guildIdForAuto));
          autoDisconnectTimers.delete(guildIdForAuto);
        }
        return;
      }
  
      // Conta quantos membros humanos (não-bot) estão no canal, excluindo o próprio bot
      const otherMembers = channel.members.filter(
        (m) => m.id !== botId && !m.user.bot
      );
  
      if (otherMembers.size === 0) {
        // Bot ficou sozinho: agenda auto-desconexão em 3 minutos se ainda não houver timeout
        if (!autoDisconnectTimers.has(guildIdForAuto)) {
          const timeoutId = setTimeout(async () => {
            try {
              // Revalida antes de desconectar
              if (!isConnected(guildIdForAuto)) {
                autoDisconnectTimers.delete(guildIdForAuto);
                return;
              }
  
              const recheckChannelId = getCurrentChannel(guildIdForAuto);
              if (!recheckChannelId) {
                autoDisconnectTimers.delete(guildIdForAuto);
                return;
              }
  
              const recheckChannel = guild.channels.cache.get(recheckChannelId);
              if (!recheckChannel || !recheckChannel.isVoiceBased?.()) {
                autoDisconnectTimers.delete(guildIdForAuto);
                return;
              }
  
              const recheckOthers = recheckChannel.members.filter(
                (m) => m.id !== botId && !m.user.bot
              );
  
              if (recheckOthers.size === 0) {
                // Continua sozinho após 3 minutos -> desconecta
                disconnectFromChannel(guildIdForAuto);
              }
            } finally {
              autoDisconnectTimers.delete(guildIdForAuto);
            }
          }, 180000); // 3 minutos
  
          autoDisconnectTimers.set(guildIdForAuto, timeoutId);
        }
      } else {
        // Há outras pessoas na call: cancela timeout se existir
        if (autoDisconnectTimers.has(guildIdForAuto)) {
          clearTimeout(autoDisconnectTimers.get(guildIdForAuto));
          autoDisconnectTimers.delete(guildIdForAuto);
        }
      }
    } catch {
      // Qualquer erro aqui não deve quebrar o restante da lógica de voiceState
    }
  }
