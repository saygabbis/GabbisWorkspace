import {
    armProtection,
    consumeProtection,
    isProtectionActive,
  } from "../state/voiceProtection.js";
  
  import { ENV } from "../config/env.js";
  
  export async function onVoiceStateUpdate(oldState, newState) {
    const member = newState.member;
    if (!member) return;
  
    const now = Date.now();
  
    const movedChannel =
      oldState.channelId !== newState.channelId &&
      newState.channelId !== null;
  
    // ===============================
    // TARGET entrou ou trocou de call
    // ===============================
    if (
      movedChannel &&
      ENV.TARGET_USER_IDS.includes(member.id)
    ) {
      armProtection(now);
      console.log("🟣 Target entrou ou trocou de call (proteção armada)");
      return;
    }
  
    // ===============================
    // TRIGGER entrou em call
    // ===============================
    const triggerEntered =
      member.id === ENV.TRIGGER_USER_ID &&
      oldState.channelId === null &&
      newState.channelId !== null;
  
    if (triggerEntered) {
      if (isProtectionActive(now, ENV.TIME_WINDOW)) {
        await newState.disconnect();
        console.log("🚫 Bot de áudio removido (proteção ativa)");
      }
  
      consumeProtection();
    }
  }
  