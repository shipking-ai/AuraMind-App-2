import { describe, it, expect } from "vitest";
import {
  AURA_DEPTH_LAYERS,
  AURA_SCROLL_CAP_PX,
  clampAuraScroll,
  auraLayerY,
  auraHueFilter,
} from "../components/native/auraDepth";

describe("auraDepth", () => {
  describe("clampAuraScroll", () => {
    it("passes through values inside the band", () => {
      expect(clampAuraScroll(0)).toBe(0);
      expect(clampAuraScroll(450)).toBe(450);
      expect(clampAuraScroll(AURA_SCROLL_CAP_PX)).toBe(AURA_SCROLL_CAP_PX);
    });

    it("clamps negatives to zero (overscroll bounce, rubber-banding)", () => {
      expect(clampAuraScroll(-80)).toBe(0);
    });

    it("saturates above the cap so long pages never push layers off-screen", () => {
      expect(clampAuraScroll(5000)).toBe(AURA_SCROLL_CAP_PX);
      expect(clampAuraScroll(Number.MAX_SAFE_INTEGER)).toBe(AURA_SCROLL_CAP_PX);
    });

    it("fails safe on non-finite input", () => {
      expect(clampAuraScroll(Number.NaN)).toBe(0);
      expect(clampAuraScroll(Number.POSITIVE_INFINITY)).toBe(AURA_SCROLL_CAP_PX);
    });
  });

  describe("auraLayerY", () => {
    it("is exactly zero at the static baseline — the pre-change mark", () => {
      for (const layer of AURA_DEPTH_LAYERS) {
        expect(auraLayerY(layer.key, 0)).toBe(0);
      }
    });

    it("scales each layer by its depth", () => {
      expect(auraLayerY("core", 100)).toBeCloseTo(-8, 6);
      expect(auraLayerY("orbits", 100)).toBeCloseTo(10, 6);
      expect(auraLayerY("particles", 100)).toBeCloseTo(18, 6);
    });

    it("keeps the depth ordering near→far: core rises most, particles sink most", () => {
      const scroll = 500;
      const ys = AURA_DEPTH_LAYERS.map((l) => auraLayerY(l.key, scroll));
      // core < halo < orbits < particles (more negative = nearer/rising)
      expect(ys[0]).toBeLessThan(ys[1]);
      expect(ys[1]).toBeLessThan(ys[2]);
      expect(ys[2]).toBeLessThan(ys[3]);
    });

    it("caps the travel at the scroll cap", () => {
      for (const layer of AURA_DEPTH_LAYERS) {
        expect(Math.abs(auraLayerY(layer.key, AURA_SCROLL_CAP_PX))).toBeLessThanOrEqual(
          AURA_SCROLL_CAP_PX * 0.2,
        );
      }
    });

    it("returns 0 for an unknown layer key", () => {
      expect(auraLayerY("nonexistent" as never, 100)).toBe(0);
    });
  });

  describe("auraHueFilter", () => {
    it("renders exactly 'none' at zero — not hue-rotate(0deg)", () => {
      expect(auraHueFilter(0)).toBe("none");
    });

    it("drifts warm proportionally to scroll", () => {
      expect(auraHueFilter(100)).toBe("hue-rotate(5deg)");
      expect(auraHueFilter(AURA_SCROLL_CAP_PX)).toBe("hue-rotate(45deg)");
    });

    it("stays a valid filter at saturation", () => {
      const at = auraHueFilter(AURA_SCROLL_CAP_PX);
      expect(at).toMatch(/^hue-rotate\(\d+(\.\d+)?deg\)$/);
      expect(parseFloat(at.replace(/[^\d.]/g, ""))).toBeLessThanOrEqual(90);
    });
  });
});
