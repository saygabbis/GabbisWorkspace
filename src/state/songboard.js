import { getGuildConfig, saveConfigs } from "./guildConfigs.js";

const MAX_SONGS_PER_GUILD = 50;

function ensureSongboard(guildId) {
  const config = getGuildConfig(guildId);
  if (!config.songboard) {
    config.songboard = [];
    saveConfigs();
  }
  return config.songboard;
}

export function getSongs(guildId) {
  return ensureSongboard(guildId);
}

export function addSong(guildId, songData) {
  const songboard = ensureSongboard(guildId);

  if (songboard.length >= MAX_SONGS_PER_GUILD) {
    return {
      success: false,
      error: `Limite máximo de ${MAX_SONGS_PER_GUILD} músicas por servidor atingido.`,
    };
  }

  const existingSong = songboard.find(
    (s) => s.name.toLowerCase() === songData.name.toLowerCase()
  );

  if (existingSong) {
    return {
      success: false,
      error: `Já existe uma música com o nome "${songData.name}".`,
    };
  }

  songboard.push(songData);
  saveConfigs();
  return { success: true };
}

export function removeSong(guildId, songName) {
  const songboard = ensureSongboard(guildId);
  const index = songboard.findIndex(
    (s) => s.name.toLowerCase() === songName.toLowerCase()
  );

  if (index === -1) {
    return {
      success: false,
      error: `Música "${songName}" não encontrada.`,
    };
  }

  const removedSong = songboard.splice(index, 1)[0];
  saveConfigs();
  return { success: true, sound: removedSong };
}

export function getSong(guildId, songName) {
  const songboard = ensureSongboard(guildId);
  return songboard.find((s) => s.name.toLowerCase() === songName.toLowerCase()) || null;
}

export function getSongCount(guildId) {
  return ensureSongboard(guildId).length;
}

export function getSongByIndex(guildId, index) {
  const songboard = ensureSongboard(guildId);
  const arrayIndex = index - 1;
  if (arrayIndex < 0 || arrayIndex >= songboard.length) {
    return null;
  }
  return songboard[arrayIndex];
}

export function clearAllSongs(guildId) {
  const songboard = ensureSongboard(guildId);
  const removedSongs = [...songboard];
  songboard.length = 0;
  saveConfigs();
  return removedSongs;
}
