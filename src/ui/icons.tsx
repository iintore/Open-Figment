import { Dot, S } from './iconPrimitives';

// Original outline icon set, drawn to the editor's icon spec:
// 24×24 grid, 1px centred strokes with round caps and joins, glyphs inside 6–18 (circles and
// containers 5–19, tools 4.5–19.5), 1–1.5px corner radii, 2px solid bars for alignment, and a
// muted guide/back layer (opacity .35) where an icon shows a reference line or a second shape.
const MUTED = 0.35;

export const Icon = {
  move: () => (
    <S>
      <path d="M5.9 5.9a.5.5 0 0 1 .58-.1l12.1 5.05a.5.5 0 0 1-.03.94l-5.25 1.7-1.7 5.25a.5.5 0 0 1-.94.03L5.6 6.48a.5.5 0 0 1 .1-.58z" />
    </S>
  ),
  scale: () => (
    <S>
      <rect x="6.5" y="11.5" width="6" height="6" rx="1" />
      <path d="M12 6.5h5.5V12M17.5 6.5 12.5 11.5" />
    </S>
  ),
  hand: () => (
    <S>
      <path transform="translate(11.75 11.6) scale(.9) translate(-11.75 -12.4)" strokeWidth={1 / 0.9} d="M8.5 12.5V8.25a1 1 0 0 1 2 0v3.25-5a1 1 0 0 1 2 0v5-4a1 1 0 0 1 2 0v4.25-2.75a1 1 0 0 1 2 0v4.75c0 3.1-2 5.5-4.75 5.5h-.4c-1.55 0-2.6-.6-3.55-1.75l-2.4-3a1 1 0 0 1 1.5-1.3l1.6 1.55" />
    </S>
  ),
  frame: () => (
    <S>
      <path d="M8.5 4.5v15M15.5 4.5v15M4.5 8.5h15M4.5 15.5h15" />
    </S>
  ),
  section: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
      <path d="M6.5 10.5h4.25a.75.75 0 0 0 .75-.75V6.5" />
    </S>
  ),
  slice: () => (
    <S>
      <path d="M8.5 6 15.5 18M6 9.5h12" />
    </S>
  ),
  rectangle: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1" />
    </S>
  ),
  ellipse: () => (
    <S>
      <circle cx="12" cy="12" r="5.5" />
    </S>
  ),
  line: () => (
    <S>
      <path d="M6.5 17.5l11-11" />
    </S>
  ),
  arrow: () => (
    <S>
      <path d="M6.5 17.5l11-11M10.5 6.5h7v7" />
    </S>
  ),
  polygon: () => (
    <S>
      <path d="M11.13 7.4a1 1 0 0 1 1.74 0l5.2 9.1a.66.66 0 0 1-.57 1H6.5a.66.66 0 0 1-.57-1z" />
    </S>
  ),
  star: () => (
    <S>
      <path transform="translate(12 11.6) scale(.93) translate(-12 -12)" strokeWidth={1 / 0.93} d="M11.53 5.45a.5.5 0 0 1 .94 0l1.62 4.5h4.74a.5.5 0 0 1 .3.9l-3.82 2.84 1.47 4.55a.5.5 0 0 1-.77.56L12 15.97l-3.98 2.83a.5.5 0 0 1-.77-.56l1.47-4.55-3.82-2.84a.5.5 0 0 1 .3-.9h4.74z" />
    </S>
  ),
  image: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
      <circle cx="14.25" cy="9.75" r="1.25" />
      <path d="M6.5 15.5 9.75 12.25a.7.7 0 0 1 1 0l4.25 4.25" />
    </S>
  ),
  pen: () => (
    <S>
      <path d="M6.2 6.2 13.4 8.3l3.4 3.4-5.1 5.1-3.4-3.4zM6.2 6.2l4.3 4.3M16.8 11.7l1.5 1.5a.7.7 0 0 1 0 1l-3.1 3.1a.7.7 0 0 1-1 0l-1.5-1.5" />
      <circle cx="11.3" cy="11.3" r="1.25" />
    </S>
  ),
  pencil: () => (
    <S>
      <path d="M14.9 6.1a1.3 1.3 0 0 1 1.85 0l1.15 1.15a1.3 1.3 0 0 1 0 1.85L9.4 17.6l-3.4.9.9-3.4zM13.4 7.6l3 3" />
    </S>
  ),
  text: () => (
    <S>
      <path d="M6.5 8.75V6.5h11v2.25M12 6.5v11M9.75 17.5h4.5" />
    </S>
  ),
  comment: () => (
    <S>
      <path d="M12.5 5.5a6 6 0 0 1 0 12H7.5a1 1 0 0 1-1-1v-5a6 6 0 0 1 6-6z" />
    </S>
  ),
  insert: () => (
    <S>
      <rect x="5.25" y="5.25" width="4.5" height="4.5" rx="1" transform="rotate(45 7.5 7.5)" />
      <circle cx="16.5" cy="7.5" r="2.75" />
      <rect x="4.75" y="13.75" width="5.5" height="5.5" rx="1" />
      <path d="M16.5 13.5v6M13.5 16.5h6" />
    </S>
  ),
  draw: () => (
    <S>
      <path d="M6.5 13.5c2.5-4 5.5-6.75 7.25-6.75 1.5 0 1 2-1.75 5.25s-3.25 5.25-1.75 5.25c2 0 4.25-3.5 6.25-5.75 1.25-1.4 1.75-.5 1.25.75s-1.25 3.25.25 3.25" />
    </S>
  ),
  motion: () => (
    <S>
      <rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1.25" transform="rotate(45 12 12)" />
      <path d="M10.75 10v4l3.25-2z" />
    </S>
  ),
  code: () => (
    <S>
      <path d="M9 7.5 5.5 12 9 16.5M15 7.5l3.5 4.5-3.5 4.5M13 6.5l-2 11" />
    </S>
  ),
  sparkle: () => (
    <S>
      <path d="M12 5.5c.55 3.4 3.1 5.95 6.5 6.5-3.4.55-5.95 3.1-6.5 6.5-.55-3.4-3.1-5.95-6.5-6.5 3.4-.55 5.95-3.1 6.5-6.5z" />
    </S>
  ),
  assets: () => (
    <S>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 9.5v5M9.5 12h5" />
    </S>
  ),
  tools: () => (
    <S>
      <rect x="5.5" y="8.5" width="13" height="9" rx="1.5" />
      <path d="M9.75 8.5v-1a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v1M5.5 12.5h13M9.5 11.5v2M14.5 11.5v2" />
    </S>
  ),
  variables: () => (
    <S>
      <path d="M11.5 6.2a1 1 0 0 1 1 0l4.5 2.6a1 1 0 0 1 .5.87v4.66a1 1 0 0 1-.5.87l-4.5 2.6a1 1 0 0 1-1 0L7 15.2a1 1 0 0 1-.5-.87V9.67a1 1 0 0 1 .5-.87z" />
      <circle cx="12" cy="12" r="1.5" />
    </S>
  ),
  chevronDown: () => (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
      <path d="M1 2.75 4 5.75l3-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronRight: () => (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
      <path d="M2.75 1 5.75 4l-3 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: () => (
    <S>
      <path d="M12 6.5v11M6.5 12h11" />
    </S>
  ),
  minus: () => (
    <S>
      <path d="M6.5 12h11" />
    </S>
  ),
  eye: () => (
    <S>
      <path d="M5.5 12c1.5-2.75 3.9-4.5 6.5-4.5s5 1.75 6.5 4.5c-1.5 2.75-3.9 4.5-6.5 4.5s-5-1.75-6.5-4.5z" />
      <circle cx="12" cy="12" r="2" />
    </S>
  ),
  eyeOff: () => (
    <S>
      <path d="M5.5 10.25c1.5 2 3.75 3.25 6.5 3.25s5-1.25 6.5-3.25M8 13l-1.25 1.75M16 13l1.25 1.75M12 13.5v2.25" />
    </S>
  ),
  lock: () => (
    <S>
      <rect x="7.5" y="11.5" width="9" height="6.5" rx="1.25" />
      <path d="M9.5 11.5V9.25a2.5 2.5 0 0 1 5 0v2.25" />
    </S>
  ),
  unlock: () => (
    <S>
      <rect x="7.5" y="11.5" width="9" height="6.5" rx="1.25" />
      <path d="M9.5 11.5V9.25a2.5 2.5 0 0 1 4.85-.85" />
    </S>
  ),
  group: () => (
    <S>
      <path d="M6.5 9V7.5a1 1 0 0 1 1-1H9M15 6.5h1.5a1 1 0 0 1 1 1V9M17.5 15v1.5a1 1 0 0 1-1 1H15M9 17.5H7.5a1 1 0 0 1-1-1V15" />
    </S>
  ),
  component: () => (
    <S>
      <rect x="10.25" y="5.75" width="3.5" height="3.5" rx=".75" transform="rotate(45 12 7.5)" />
      <rect x="10.25" y="14.75" width="3.5" height="3.5" rx=".75" transform="rotate(45 12 16.5)" />
      <rect x="5.75" y="10.25" width="3.5" height="3.5" rx=".75" transform="rotate(45 7.5 12)" />
      <rect x="14.75" y="10.25" width="3.5" height="3.5" rx=".75" transform="rotate(45 16.5 12)" />
    </S>
  ),
  instance: () => (
    <S>
      <rect x="7.25" y="7.25" width="9.5" height="9.5" rx="1.25" transform="rotate(45 12 12)" />
    </S>
  ),
  vector: () => (
    <S>
      <path d="M8 16c1.5-5.5 6.5-2.5 8-8" />
      <rect x="6" y="15.5" width="3" height="3" rx=".5" />
      <rect x="15" y="5.5" width="3" height="3" rx=".5" />
    </S>
  ),
  boolean: () => (
    <S>
      <rect x="6.5" y="6.5" width="8" height="8" rx="1" />
      <rect x="9.5" y="9.5" width="8" height="8" rx="1" fill="currentColor" fillOpacity={MUTED} />
    </S>
  ),
  autoV: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="4" rx="1" />
      <rect x="6.5" y="13.5" width="11" height="4" rx="1" />
    </S>
  ),
  autoH: () => (
    <S>
      <rect x="6.5" y="6.5" width="4" height="11" rx="1" />
      <rect x="13.5" y="6.5" width="4" height="11" rx="1" />
    </S>
  ),
  wrap: () => (
    <S>
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" />
      <path d="M13.5 15.5h4M16 13.5l2 2-2 2" />
    </S>
  ),
  grid: () => (
    <S>
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" />
      <rect x="13.5" y="13.5" width="4" height="4" rx="1" />
    </S>
  ),
  freeform: () => (
    <S>
      <rect x="6.5" y="6.5" width="5" height="4" rx="1" />
      <circle cx="15" cy="15" r="2.5" />
    </S>
  ),
  alignLeft: () => (
    <S>
      <path d="M6 5.5v13" strokeOpacity={MUTED} />
      <path d="M9 9.5h8M9 14.5h4.5" strokeWidth="2" />
    </S>
  ),
  alignHCenter: () => (
    <S>
      <path d="M12 5.5v13" strokeOpacity={MUTED} />
      <path d="M8 9.5h8M9.75 14.5h4.5" strokeWidth="2" />
    </S>
  ),
  alignRight: () => (
    <S>
      <path d="M18 5.5v13" strokeOpacity={MUTED} />
      <path d="M7 9.5h8M10.5 14.5H15" strokeWidth="2" />
    </S>
  ),
  alignTop: () => (
    <S>
      <path d="M5.5 6h13" strokeOpacity={MUTED} />
      <path d="M9.5 9v8M14.5 9v4.5" strokeWidth="2" />
    </S>
  ),
  alignVCenter: () => (
    <S>
      <path d="M5.5 12h13" strokeOpacity={MUTED} />
      <path d="M9.5 8v8M14.5 9.75v4.5" strokeWidth="2" />
    </S>
  ),
  alignBottom: () => (
    <S>
      <path d="M5.5 18h13" strokeOpacity={MUTED} />
      <path d="M9.5 7v8M14.5 10.5V15" strokeWidth="2" />
    </S>
  ),
  distribute: () => (
    <S>
      <path d="M6.5 6v12M17.5 6v12" strokeOpacity={MUTED} />
      <rect x="10.5" y="8.5" width="3" height="7" rx="1" />
    </S>
  ),
  tidy: () => (
    <S>
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" />
      <rect x="13.5" y="13.5" width="4" height="4" rx="1" />
      <path d="M12 5v14M5 12h14" strokeOpacity={MUTED} />
    </S>
  ),
  rotate: () => (
    <S>
      <path d="M17.5 12a5.5 5.5 0 1 1-1.6-3.9M17.5 6.5v3h-3" />
    </S>
  ),
  radius: () => (
    <S>
      <path d="M6.5 17.5v-6a5 5 0 0 1 5-5h6" />
    </S>
  ),
  corners: () => (
    <S>
      <path d="M6.5 9.5V7.5a1 1 0 0 1 1-1h2M14.5 6.5h2a1 1 0 0 1 1 1v2M17.5 14.5v2a1 1 0 0 1-1 1h-2M9.5 17.5h-2a1 1 0 0 1-1-1v-2" />
    </S>
  ),
  link: () => (
    <S>
      <path d="M10.25 13.75l3.5-3.5M11 8.75l1.6-1.6a3 3 0 0 1 4.25 4.25L15.25 13M13 15.25l-1.6 1.6a3 3 0 0 1-4.25-4.25L8.75 11" />
    </S>
  ),
  unlink: () => (
    <S>
      <path d="M11 8.75l1.6-1.6a3 3 0 0 1 4.25 4.25L15.25 13M13 15.25l-1.6 1.6a3 3 0 0 1-4.25-4.25L8.75 11M6.5 6.5l11 11" />
    </S>
  ),
  flipH: () => (
    <S>
      <path d="M12 6v12" strokeOpacity={MUTED} />
      <path d="M9.5 7.5v9H6zM14.5 7.5v9H18z" />
    </S>
  ),
  flipV: () => (
    <S>
      <path d="M6 12h12" strokeOpacity={MUTED} />
      <path d="M7.5 9.5h9V6zM7.5 14.5h9V18z" />
    </S>
  ),
  play: () => (
    <S>
      <path d="M8.5 7.1a.6.6 0 0 1 .9-.52l8.3 4.9a.6.6 0 0 1 0 1.04l-8.3 4.9a.6.6 0 0 1-.9-.52z" />
    </S>
  ),
  search: () => (
    <S>
      <circle cx="11" cy="11" r="4.75" />
      <path d="M14.5 14.5l3 3" />
    </S>
  ),
  close: () => (
    <S>
      <path d="M7 7l10 10M17 7 7 17" />
    </S>
  ),
  home: () => (
    <S>
      <path d="M6.5 10.9a1 1 0 0 1 .37-.78l4.5-3.6a1 1 0 0 1 1.26 0l4.5 3.6a1 1 0 0 1 .37.78v5.6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
    </S>
  ),
  file: () => (
    <S>
      <path d="M7.5 6.5a1 1 0 0 1 1-1h4.6l3.4 3.4v8.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1zM13 5.5v3.5h3.5" />
    </S>
  ),
  trash: () => (
    <S>
      <path d="M6.5 8h11M10 8V6.75a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V8M8 8l.75 9.1a1 1 0 0 0 1 .9h4.5a1 1 0 0 0 1-.9L16 8" />
    </S>
  ),
  clock: () => (
    <S>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 9v3l2 1.25" />
    </S>
  ),
  users: () => (
    <S>
      <circle cx="10" cy="9.25" r="2.5" />
      <path d="M6 17.5a4 4 0 0 1 8 0M14.75 7a2.4 2.4 0 0 1 0 4.6M16 13.75a4 4 0 0 1 2 3.75" />
    </S>
  ),
  panel: () => (
    <S>
      <rect x="5.5" y="7.5" width="13" height="9" rx="1.25" />
      <path d="M10 7.5v9" />
    </S>
  ),
  dots: () => (
    <S>
      <Dot cx={6} cy={12} r={1.5} />
      <Dot cx={12} cy={12} r={1.5} />
      <Dot cx={18} cy={12} r={1.5} />
    </S>
  ),
  style: () => (
    <S>
      <circle cx="9" cy="9" r="2" />
      <circle cx="15" cy="9" r="2" />
      <circle cx="9" cy="15" r="2" />
      <circle cx="15" cy="15" r="2" />
    </S>
  ),
  check: () => (
    <S>
      <path d="M7.5 12.25 11 15.75 17.5 7" />
    </S>
  ),
  page: () => (
    <S>
      <rect x="8" y="6.5" width="8" height="11" rx="1" />
    </S>
  ),
  mask: () => (
    <S>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </S>
  ),
  union: () => (
    <S>
      <path d="M6.5 7.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2h-2a1 1 0 0 1-1-1z" />
    </S>
  ),
  subtract: () => (
    <S>
      <path d="M14.5 9.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2v-4a1 1 0 0 1 1-1z" />
      <rect x="9.5" y="9.5" width="8" height="8" rx="1" strokeOpacity={MUTED} />
    </S>
  ),
  intersect: () => (
    <S>
      <rect x="6.5" y="6.5" width="8" height="8" rx="1" strokeOpacity={MUTED} />
      <rect x="9.5" y="9.5" width="8" height="8" rx="1" strokeOpacity={MUTED} />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" />
    </S>
  ),
  exclude: () => (
    <S>
      <rect x="6.5" y="6.5" width="8" height="8" rx="1" />
      <rect x="9.5" y="9.5" width="8" height="8" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" fillOpacity={MUTED} stroke="none" />
    </S>
  ),
  sun: () => (
    <S>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5.5v1.25M12 17.25v1.25M5.5 12h1.25M17.25 12h1.25M7.4 7.4l.9.9M15.7 15.7l.9.9M7.4 16.6l.9-.9M15.7 8.3l.9-.9" />
    </S>
  ),
  moon: () => (
    <S>
      <path d="M17.5 13.75A5.75 5.75 0 0 1 10.25 6.5a6 6 0 1 0 7.25 7.25z" />
    </S>
  ),
  history: () => (
    <S>
      <path d="M5.75 12a6.25 6.25 0 1 0 1.85-4.45M7.5 5.5v2.25h2.25M12 9v3l2 1.25" />
    </S>
  ),
  share: () => (
    <S>
      <path d="M12 13.5v-7M9.25 9.25 12 6.5l2.75 2.75M7 12v4.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V12" />
    </S>
  ),
  bell: () => (
    <S>
      <path d="M8 14.75v-3.25a4 4 0 0 1 8 0v3.25l1.25 1.5H6.75zM11 17.5a1 1 0 0 0 2 0M12 5.5v2" />
    </S>
  ),
  book: () => (
    <S>
      <path d="M12 8c-1.25-.95-3-1.5-5.5-1.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1c2.5 0 4.25.55 5.5 1.5 1.25-.95 3-1.5 5.5-1.5a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1C15 6.5 13.25 7.05 12 8zM12 8v9" />
    </S>
  ),
  folder: () => (
    <S>
      <path d="M5.5 7.5a1 1 0 0 1 1-1h3.4l1.6 1.75h6a1 1 0 0 1 1 1v7.25a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
    </S>
  ),
  starFill: () => (
    <S>
      <path transform="translate(12 11.6) scale(.93) translate(-12 -12)" strokeWidth={1 / 0.93} d="M11.53 5.45a.5.5 0 0 1 .94 0l1.62 4.5h4.74a.5.5 0 0 1 .3.9l-3.82 2.84 1.47 4.55a.5.5 0 0 1-.77.56L12 15.97l-3.98 2.83a.5.5 0 0 1-.77-.56l1.47-4.55-3.82-2.84a.5.5 0 0 1 .3-.9h4.74z" fill="currentColor" />
    </S>
  ),
  mic: () => (
    <S>
      <rect x="9.5" y="5.5" width="5" height="8.5" rx="2.5" />
      <path d="M7.5 11.75a4.5 4.5 0 0 0 9 0M12 16.25v2.25" />
    </S>
  ),
  send: () => (
    <S>
      <path d="M12 18V6M7.5 10.5 12 6l4.5 4.5" />
    </S>
  ),
  filter: () => (
    <S>
      <path d="M6 8h12M8.25 12h7.5M10.5 16h3" />
    </S>
  ),
  list: () => (
    <S>
      <path d="M9.5 7h9M9.5 12h9M9.5 17h9" />
      <Dot cx={6} cy={7} r={1} />
      <Dot cx={6} cy={12} r={1} />
      <Dot cx={6} cy={17} r={1} />
    </S>
  ),
  layoutGuide: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
      <path d="M10 6.5v11M14 6.5v11" strokeOpacity={MUTED} />
    </S>
  ),
  blend: () => (
    <S>
      <path d="M12 5.75c1.6 2.15 4.5 5.05 4.5 7.75a4.5 4.5 0 0 1-9 0c0-2.7 2.9-5.6 4.5-7.75z" />
    </S>
  ),
  hug: () => (
    <S>
      <path d="M6.5 6.5l3 3M9.5 7v2.5H7M17.5 6.5l-3 3M14.5 7v2.5H17M6.5 17.5l3-3M9.5 17v-2.5H7M17.5 17.5l-3-3M14.5 17v-2.5H17" />
    </S>
  ),
};


export function nodeIcon(type: string, layoutMode?: string) {
  switch (type) {
    case 'FRAME':
      if (layoutMode === 'HORIZONTAL') return <Icon.autoH />;
      if (layoutMode === 'VERTICAL') return <Icon.autoV />;
      if (layoutMode === 'GRID') return <Icon.grid />;
      return <Icon.frame />;
    case 'SECTION':
      return <Icon.section />;
    case 'GROUP':
      return <Icon.group />;
    case 'COMPONENT':
      return <Icon.component />;
    case 'INSTANCE':
      return <Icon.instance />;
    case 'BOOLEAN':
      return <Icon.boolean />;
    case 'RECTANGLE':
      return <Icon.rectangle />;
    case 'ELLIPSE':
      return <Icon.ellipse />;
    case 'LINE':
      return <Icon.line />;
    case 'ARROW':
      return <Icon.arrow />;
    case 'POLYGON':
      return <Icon.polygon />;
    case 'STAR':
      return <Icon.star />;
    case 'TEXT':
      return <Icon.text />;
    case 'VECTOR':
      return <Icon.vector />;
    default:
      return <Icon.rectangle />;
  }
}
