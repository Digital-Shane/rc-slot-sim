import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Shared, viewport-safe help for mouse, touch, and keyboard users. */
export default function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = pinned || hovered || focused;

  const dismiss = () => { setPinned(false); setHovered(false); setFocused(false); };
  const keepHover = () => { clearTimeout(closeTimer.current); setHovered(true); };
  const leaveHover = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 120);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!button.current || !tip.current) return;
      const anchor = button.current.getBoundingClientRect();
      // Keep help attached to its control instead of floating at the screen edge
      // when a focused control has been scrolled out of view.
      if (anchor.bottom < 0 || anchor.top > innerHeight) { setPosition(null); return; }
      const box = tip.current.getBoundingClientRect();
      const above = anchor.top - box.height - 10;
      setPosition({
        left: Math.max(12, Math.min(innerWidth - box.width - 12, anchor.left + anchor.width / 2 - box.width / 2)),
        top: Math.max(12, Math.min(innerHeight - box.height - 12, above >= 12 ? above : anchor.bottom + 10)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node) && !tip.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  return <>
    <button ref={button} type="button" className="info-tip" aria-label={label}
      aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setPinned((value) => !value)}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setFocused(true); }}
      onBlur={dismiss}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') keepHover(); }}
      onPointerLeave={leaveHover}>
      <span aria-hidden="true">i</span>
    </button>
    {open && createPortal(
      <div ref={tip} id={id} role="tooltip" className="help-popover"
        style={position ?? { visibility: 'hidden' }} onPointerEnter={keepHover} onPointerLeave={leaveHover}>
        {text}
      </div>, document.body,
    )}
  </>;
}
