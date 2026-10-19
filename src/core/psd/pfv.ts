import { enforceFixedRules } from "./visibility";
import type { LayerNode, VisibilityState } from "./types";

export interface PfvFavorite {
  name: string;
  folderPath: string[];
  /** rawName のパス。末尾の '\N'（同名兄弟の番号）は付いたまま */
  layerPaths: string[][];
}

export class PfvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PfvFormatError";
  }
}

const SIGNATURE = "[PSDToolFavorites-v1]";
const INDEX_SUFFIX = /\\(\d+)$/;

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new PfvFormatError(`.pfv の名前を復号できません: ${part}`);
  }
}

/** 末尾の '\数字' を切り離してから復号し、番号を付け直す（復号後の '\' と区別するため）。 */
function decodePathElement(element: string): string {
  const m = INDEX_SUFFIX.exec(element);
  if (!m) return decode(element);
  return decode(element.slice(0, m.index)) + "\\" + m[1];
}

export function parsePfv(text: string): PfvFavorite[] {
  const lines = text.replace(/^﻿/, "").replace(/\r/g, "").split("\n");
  if (lines[0] !== SIGNATURE) {
    throw new PfvFormatError(
      "PSDTool のお気に入りファイル（.pfv）ではありません",
    );
  }

  const favorites: PfvFavorite[] = [];
  let current: PfvFavorite | null = null; // null: 最初の見出し前、またはスキップ中
  for (const line of lines.slice(1)) {
    if (line.startsWith("//")) {
      const [path, ...markers] = line.slice(2).split("~");
      if (markers.length > 0) {
        current = null;
        continue;
      }
      const segments = path.split("/").map(decode);
      current = {
        name: segments[segments.length - 1],
        folderPath: segments.slice(0, -1),
        layerPaths: [],
      };
      favorites.push(current);
    } else if (current && line !== "") {
      current.layerPaths.push(line.split("/").map(decodePathElement));
    }
  }
  return favorites;
}

/** 'name\N' を名前と番号（省略時 0）に分ける。 */
function splitIndex(element: string): { name: string; index: number } {
  const m = INDEX_SUFFIX.exec(element);
  return m
    ? { name: element.slice(0, m.index), index: Number(m[1]) }
    : { name: element, index: 0 };
}

function resolve(
  tree: LayerNode[],
  path: string[],
  visibility: VisibilityState,
): boolean {
  let siblings = tree;
  for (const element of path) {
    const { name, index } = splitIndex(element);
    const node = siblings.filter((n) => n.rawName === name)[index];
    if (!node) return false;
    visibility[node.id] = true;
    siblings = node.children;
  }
  return true;
}

function allIds(nodes: LayerNode[], into: VisibilityState): VisibilityState {
  for (const n of nodes) {
    into[n.id] = false;
    allIds(n.children, into);
  }
  return into;
}

export function applyFavorite(
  tree: LayerNode[],
  fav: PfvFavorite,
): { visibility: VisibilityState; missingPaths: number } {
  const visibility = allIds(tree, {});
  let missingPaths = 0;
  for (const path of fav.layerPaths) {
    if (!resolve(tree, path, visibility)) missingPaths++;
  }
  return { visibility: enforceFixedRules(tree, visibility), missingPaths };
}
