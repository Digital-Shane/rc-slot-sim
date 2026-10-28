import { Fragment, useLayoutEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import VolatilityBucketCharts from './VolatilityBucketCharts';

type IntroFoldoutItem = { title: string; summary?: string; markdown: string };
type IntroFoldoutGroupProps = { items: IntroFoldoutItem[]; className?: string };

/** A native modal gives long Markdown articles their own scroll area and focus scope. */
export default function IntroFoldoutGroup({ items, className }: IntroFoldoutGroupProps) {
  const sanitized = items.filter((item) => item.markdown.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const activeItem = activeIndex === null ? null : sanitized[activeIndex];

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (activeItem && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('.reference-body')?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeItem]);

  if (!sanitized.length) return null;
  const parts = activeItem?.markdown.split('VOLATILITY_GRAPHS') ?? [];
  return (
    <div className={['reference-library', className].filter(Boolean).join(' ')}>
      <div className="reference-cards">
        {sanitized.map((item, index) => (
          <button key={item.title} type="button" className="reference-card"
            aria-haspopup="dialog" onClick={() => setActiveIndex(index)}>
            <span className="reference-number" aria-hidden="true">{index + 1}.</span>
            <span className="reference-copy"><strong>{item.title}</strong><span>{item.summary}</span></span>
            <span className="reference-arrow" aria-hidden="true">+</span>
          </button>
        ))}
      </div>
      <dialog ref={dialogRef} className="reference-dialog" aria-labelledby={titleId}
        onClose={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex="0"]',
          )).filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
        <article className="reference-article">
          <header className="reference-header">
            <div><span className="handwritten">From my notebook</span><h2 id={titleId}>{activeItem?.title}</h2></div>
            <button type="button" className="close-button" aria-label="Close reference" autoFocus
              onClick={() => dialogRef.current?.close()}>✕</button>
          </header>
          <div className="reference-body" tabIndex={0} role="region" aria-label="Reference article content">
            {parts.map((part, index) => (
              <Fragment key={index}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  table: ({ children }) => <div className="markdown-table-scroll" tabIndex={0} role="region" aria-label="Scrollable reference table"><table>{children}</table></div>,
                }}>{part}</ReactMarkdown>
                {index < parts.length - 1 ? <VolatilityBucketCharts variant="inline" /> : null}
              </Fragment>
            ))}
          </div>
        </article>
      </dialog>
    </div>
  );
}
