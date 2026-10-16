import { useEffect, useRef, useState } from "react";
import { isDesktopApp } from "../../lib/platform";

/** True only for devices with a real pointer — excludes phones and tablets. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  // Evaluated once on mount rather than during render so SSR/first paint
  // stay consistent. Touch devices skip the nodes entirely.
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    // The Windows app keeps the Windows pointer; the custom cursor is a web flourish.
    setFinePointer(!isDesktopApp() && window.matchMedia(FINE_POINTER).matches);
  }, []);

  useEffect(() => {
    if (!finePointer) return;
    document.body.classList.add("custom-cursor-active");

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = -100, mouseY = -100, ringX = -100, ringY = -100, raf = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const target = e.target as HTMLElement;
      const interactive = target.closest('button, a, [role="button"], input, textarea, select, [data-cursor="hover"]');
      dot.classList.toggle("cursor-hover", !!interactive);
      ring.classList.toggle("cursor-hover", !!interactive);
    };

    const tick = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      document.body.classList.remove("custom-cursor-active");
    };
  }, [finePointer]);

  if (!finePointer) return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden />
      <div ref={ringRef} className="cursor-ring" aria-hidden />
    </>
  );
}
