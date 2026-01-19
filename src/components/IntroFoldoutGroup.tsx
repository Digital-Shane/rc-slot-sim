import { Fragment, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import VolatilityBucketCharts from './VolatilityBucketCharts';

type IntroFoldoutItem = {
  title: string;
  markdown: string;
};

type IntroFoldoutGroupProps = {
  items: IntroFoldoutItem[];
  className?: string;
};

export default function IntroFoldoutGroup({ items, className }: IntroFoldoutGroupProps) {
  const sanitized = items
    .map((item) => ({ ...item, markdown: item.markdown.trim() }))
    .filter((item) => item.markdown.length > 0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (sanitized.length === 0) {
    return null;
  }

  const activeItem = activeIndex === null ? null : sanitized[activeIndex];
  const graphPlaceholder = 'VOLATILITY_GRAPHS';

  const groupClassName = [
    'intro-tab-group',
    activeItem ? 'is-open' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={groupClassName}>
      <div className="intro-tabs">
        {sanitized.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={item.title}
              type="button"
              className={`intro-tab${isActive ? ' is-active' : ''}`}
              aria-expanded={isActive}
              onClick={() => setActiveIndex(isActive ? null : index)}
            >
              <span className="intro-tab-title">
                <span className="intro-tab-icon" aria-hidden="true" />
                {item.title}
              </span>
              <span className="intro-tab-caret" aria-hidden="true">
                {isActive ? '⌄' : '›'}
              </span>
            </button>
          );
        })}
      </div>
      {activeItem ? (
        <div className="intro-tab-panel">
          {activeItem.markdown.includes(graphPlaceholder) ? (
            <div className="intro-markdown-with-graphs">
              {activeItem.markdown.split(graphPlaceholder).map((part, index, arr) => (
                <Fragment key={`volatility-part-${index}`}>
                  {part.trim().length > 0 ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>
                  ) : null}
                  {index < arr.length - 1 ? (
                    <VolatilityBucketCharts variant="inline" />
                  ) : null}
                </Fragment>
              ))}
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeItem.markdown}</ReactMarkdown>
          )}
        </div>
      ) : null}
    </div>
  );
}
