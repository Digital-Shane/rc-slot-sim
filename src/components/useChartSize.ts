import { RefObject, useEffect, useState } from 'react';
import type { EChartsType } from 'echarts';

/** Respond to container changes as well as viewport changes, including a newly opened sheet. */
export function useChartSize(container: RefObject<HTMLDivElement>, chart: RefObject<EChartsType | null>) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 600);
      chart.current?.resize();
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [container, chart]);
  return narrow;
}
