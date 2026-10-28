// Reference library labels and summaries. Full copy lives in the adjacent Markdown files.
import volatility from './volatility.md?raw';
import determination from './volatility-determination.md?raw';
import poker from './video-poker.md?raw';
import scores from './scores.md?raw';
import strategy from './point-strategy.md?raw';

export const guideItems = [
  { title: 'Volatility & payout logic', summary: 'Why some sessions swing so much', markdown: volatility },
  { title: 'Determining machine volatility', summary: 'What the machine’s features can tell you', markdown: determination },
  { title: 'Video poker tradeoffs', summary: 'How the points work differently', markdown: poker },
  { title: 'Industry metrics', summary: 'What all those casino terms mean', markdown: scores },
  { title: 'My point strategy', summary: 'My own plan, notes, and observations', markdown: strategy },
];
