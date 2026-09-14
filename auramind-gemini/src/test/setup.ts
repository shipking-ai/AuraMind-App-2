import '@testing-library/jest-dom';

// ── Web Storage on Node 25+ ────────────────────────────────────────────────
// Node 25 turned on its own experimental `localStorage`/`sessionStorage`
// globals. Without `--localstorage-file` they are getters that return
// undefined, and because they already exist on Node's global, vitest does not
// copy jsdom's working Storage over them — so every test touching storage
// dies on `localStorage.removeItem`. CI pins Node 20/22 and never sees this.
// Put jsdom's own Storage back whenever the global one is unusable.
for (const key of ['localStorage', 'sessionStorage'] as const) {
  let usable: boolean;
  try {
    usable = typeof globalThis[key]?.getItem === 'function';
  } catch {
    usable = false;
  }
  if (usable) continue;
  const domStorage = (globalThis as { jsdom?: { window: Window } }).jsdom?.window[key];
  if (domStorage) {
    Object.defineProperty(globalThis, key, { configurable: true, value: domStorage });
  }
}

// ── anime.js v4 DOM polyfills ──────────────────────────────────────────────
// anime.js v4 uses DOMPoint + DOMMatrix internally (createDraggable,
// MotionPath, ScrollObserver, etc.). jsdom does not implement these,
// so without these shims the v4 effects throw `ReferenceError:
// DOMPoint is not defined` / `DOMMatrix is not defined`.
//
// IMPORTANT: we deliberately do NOT `implements DOMPoint` /
// `implements DOMMatrix` — the full DOM interfaces have ~30 properties
// between them and TypeScript refuses to compile unless every one is
// satisfied. Instead we define a minimal class and type-erase it at the
// globalThis boundary. The polyfills are smoke-test-grade (identity
// transforms, no-op observers); they exist only to keep anime.js from
// throwing at module-load and at first constructor call.

if (typeof globalThis.DOMPoint === 'undefined') {
  class DOMPointPolyfill {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    matrixTransform(_matrix?: unknown) {
      // Identity transform. anime.js only calls this on real pointer
      // math which we don't exercise in unit tests.
      return new DOMPointPolyfill(this.x, this.y, this.z, this.w);
    }
    toJSON() {
      return { x: this.x, y: this.y, z: this.z, w: this.w };
    }
  }
   
  (globalThis as any).DOMPoint = DOMPointPolyfill;
}

if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;
    multiply() { return this; }
    inverseSelf() { return this; }
    inverse() { return this; }
    translateSelf() { return this; }
    translate() { return this; }
    scaleSelf() { return this; }
    scale() { return this; }
    rotateSelf() { return this; }
    rotate() { return this; }
    rotateFromVectorSelf() { return this; }
    rotateFromVector() { return this; }
    rotateAxisAngleSelf() { return this; }
    rotateAxisAngle() { return this; }
    skewXSelf() { return this; }
    skewX() { return this; }
    skewYSelf() { return this; }
    skewY() { return this; }
    multiplySelf() { return this; }
    flipX() { return this; }
    flipY() { return this; }
    transformPoint(_point?: unknown) {
      // Type-erased: return a fresh DOMPoint (whatever's on globalThis).
      const DOMPointCtor = (globalThis as { DOMPoint?: new () => unknown }).DOMPoint;
      if (DOMPointCtor) return new DOMPointCtor();
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    toFloat32Array() { return new Float32Array(6); }
    toFloat64Array() { return new Float64Array(6); }
    toJSON() { return {}; }
    toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }
  }
   
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

// IntersectionObserver stub — jsdom does not implement it. A real browser
// fires the callback with isIntersecting: true for in-view elements, so the
// stub mimics that (synchronously, inside the observer's effect) instead of
// never firing — otherwise components gating on visibility never mount their
// content in tests.
if (typeof globalThis.IntersectionObserver === 'undefined') {
   
  (globalThis as any).IntersectionObserver = class {
    constructor(
      private callback: IntersectionObserverCallback,
      private options?: IntersectionObserverInit
    ) {}
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, intersectionRatio: 1, target, isVisible: true } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
    takeRecords() { return []; }
  };
}

// ResizeObserver stub — TextSplitter uses it internally.
if (typeof globalThis.ResizeObserver === 'undefined') {
   
  (globalThis as any).ResizeObserver = class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
  };
}

// matchMedia stub — jsdom doesn't ship one, but anime.js v4 + our
// useReducedMotion hook both read it. Without a stub, the reduced-motion
// test path errors with "matchMedia is not a function".
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// SVGPathElement.getTotalLength — jsdom does not implement this method,
// but anime.js v4's createMotionPath + createDrawable call it.
//
// IMPORTANT: in vitest + jsdom, `globalThis` is Node's global (NOT the
// jsdom `window`). jsdom's classes live on window. So we apply the
// stubs to BOTH globals to be safe.
function applySvgPathStub(
  proto: { getTotalLength?: unknown; getPointAtLength?: unknown } | undefined,
) {
  if (!proto) return;
  if (typeof proto.getTotalLength !== 'function') {
    proto.getTotalLength = function () {
      return 100;
    };
  }
  if (typeof proto.getPointAtLength !== 'function') {
    proto.getPointAtLength = function (length: number) {
      return { x: length / 2, y: length / 2 };
    };
  }
}
 
applySvgPathStub((globalThis as any).SVGPathElement?.prototype);
 
applySvgPathStub((window as any).SVGPathElement?.prototype);
