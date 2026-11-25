// Per-device persistence in IndexedDB (via idb-keyval).
import { get, set, del, keys, getMany } from "idb-keyval";

const isTouch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const DEFAULT_SETTINGS = { username: "", depth: isTouch ? 12 : 16 };

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await get("settings")) ?? {}) };
}
export const saveSettings = (s) => set("settings", s);

export const getGame = (id) => get(`game:${id}`);
export const saveGame = (g) => set(`game:${g.id}`, g);

export const getAnalysis = (id) => get(`analysis:${id}`);
export const saveAnalysis = (id, a) => set(`analysis:${id}`, a);
export const deleteAnalysis = (id) => del(`analysis:${id}`);

/** Months in the past never change, so we cache them; the current month is always refetched. */
export async function getCachedMonth(url) {
  return get(`month:${url}`);
}
export const saveCachedMonth = (url, games) => set(`month:${url}`, games);

export async function analyzedIds() {
  return new Set(
    (await keys()).filter((k) => String(k).startsWith("analysis:")).map((k) => String(k).slice(9))
  );
}

/** [{game, analysis}] for every analyzed game on this device. */
export async function allAnalyzed() {
  const ids = [...(await analyzedIds())];
  const games = await getMany(ids.map((id) => `game:${id}`));
  const analyses = await getMany(ids.map((id) => `analysis:${id}`));
  return ids
    .map((id, i) => ({ game: games[i], analysis: analyses[i] }))
    .filter((x) => x.game && x.analysis);
}
