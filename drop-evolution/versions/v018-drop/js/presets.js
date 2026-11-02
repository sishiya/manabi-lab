// 確かめ用に一滴へ置ける、決まった生き物（?test のときだけ。到達点の試験 tools/endpoint-check.mjs と同じ組み方）
import { GI, founderGenome } from './sim.js';
const set = (g, o) => { for (const k in o) g[GI[k]] = o[k]; return g; };
export const PRESETS = [
  { id: 'founder', name: 'はじまりの2本毛', g: () => founderGenome() },
  { id: 'colony', name: 'くっつく群体', g: () => set(founderGenome(), { stick: 1, colMax: 3 }) },
  { id: 'volvox', name: 'オオヒゲマワリ型', g: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 7, fiss: 7, outDiv: 0, inBeat: 0, share: 1 }) },
  { id: 'filament', name: '糸状の藻', g: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 5, plane: 1 }) },
  { id: 'placo', name: '群体で狩る者', g: () => set(founderGenome(), { stick: 1, colMax: 5, exDig: 1, small: 1, share: 1 }) },
  { id: 'pred', name: '捕食者', g: () => set(founderGenome(), { size: 16, small: 2, food: 0.3 }) },
];
