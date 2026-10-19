import { describe, expect, it } from "vitest";
import { buildLayerTree } from "../../../src/core/psd/layerTree";
import {
  applyFavorite,
  parsePfv,
  PfvFormatError,
} from "../../../src/core/psd/pfv";
import { layer } from "../../fixtures/makePsd";

const HEADER = "[PSDToolFavorites-v1]";

describe("parsePfv", () => {
  it("throws PfvFormatError without the header line", () => {
    expect(() => parsePfv("//お気に入り/普通\nかお")).toThrow(PfvFormatError);
  });

  it("ignores BOM and CR, skips file-wide settings and ~folder entries", () => {
    const text = `﻿${HEADER}\r\nsetting=1\r\n//お気に入り/普通\r\n顔/笑\r\n\r\n//お気に入り/空~folder\r\n`;
    const favs = parsePfv(text);
    expect(favs).toHaveLength(1);
    expect(favs[0].name).toBe("普通");
    expect(favs[0].folderPath).toEqual(["お気に入り"]);
    expect(favs[0].layerPaths).toEqual([["顔", "笑"]]);
  });

  it("keeps nested folder paths", () => {
    const favs = parsePfv(`${HEADER}\n//a/b/名前\nx\n`);
    expect(favs[0].folderPath).toEqual(["a", "b"]);
    expect(favs[0].name).toBe("名前");
  });

  it("drops lines under ~filter and unknown markers", () => {
    const text = `${HEADER}\n//f/フィルタ~filter\nlost1\n//f/謎~unknown\nlost2\n//f/本物\nkept\n`;
    const favs = parsePfv(text);
    expect(favs.map((f) => f.name)).toEqual(["本物"]);
    expect(favs[0].layerPaths).toEqual([["kept"]]);
  });

  it("decodes percent-encoded names; %5c is a literal backslash, not an index", () => {
    const favs = parsePfv(`${HEADER}\n//f/n\nx%2Fy/a%5cb/c\\2\n`);
    expect(favs[0].layerPaths).toEqual([["x/y", "a\\b", "c\\2"]]);
  });

  it("throws PfvFormatError on malformed percent-encoding", () => {
    expect(() => parsePfv(`${HEADER}\n//f/n\n%E3%\n`)).toThrow(PfvFormatError);
  });
});

describe("applyFavorite", () => {
  const fav = (...paths: string[][]) => ({
    name: "n",
    folderPath: [],
    layerPaths: paths,
  });

  it("turns on traversed nodes and everything else off", () => {
    const tree = buildLayerTree([
      layer("顔", { children: [layer("笑"), layer("怒")] }),
      layer("体"),
    ]);
    const { visibility, missingPaths } = applyFavorite(tree, fav(["顔", "怒"]));
    expect(missingPaths).toBe(0);
    expect(visibility).toEqual({
      "0": true,
      "0/0": false,
      "0/1": true,
      "1": false,
    });
  });

  it("matches same-named siblings by \\N counted from the bottom", () => {
    const tree = buildLayerTree([layer("口"), layer("口")]);
    const { visibility } = applyFavorite(tree, fav(["口\\1"]));
    expect(visibility).toEqual({ "0": false, "1": true });
    expect(applyFavorite(tree, fav(["口"])).visibility).toEqual({
      "0": true,
      "1": false,
    });
  });

  it("matches against rawName including prefixes", () => {
    const tree = buildLayerTree([layer("*目"), layer("!線")]);
    const { visibility, missingPaths } = applyFavorite(tree, fav(["*目"]));
    expect(missingPaths).toBe(0);
    expect(visibility["0"]).toBe(true);
  });

  it("counts unresolved paths as missing", () => {
    const tree = buildLayerTree([layer("体")]);
    expect(applyFavorite(tree, fav(["ない", "レイヤー"])).missingPaths).toBe(1);
    expect(applyFavorite(tree, fav(["体\\5"])).missingPaths).toBe(1);
  });

  it("forces forced layers on and flip layers off at the end", () => {
    const tree = buildLayerTree([
      layer("!線"),
      layer("反転:flipx"),
      layer("他"),
    ]);
    const { visibility } = applyFavorite(tree, fav(["反転:flipx"]));
    expect(visibility).toEqual({ "0": true, "1": false, "2": false });
  });
});
