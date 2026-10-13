import { Dot, S } from './iconPrimitives';

// Original outline icon set: 1px strokes on a 24×24 grid (glyphs sit inside ~5.5–18.5).
export const Icon = {
  move: () => (
    <S>
      <path d="M8.5 6.5v10.2l2.6-2.5 1.8 4.1 1.6-.7-1.8-4h3.6z" fill="currentColor" stroke="none" />
    </S>
  ),
  scale: () => (
    <S>
      <rect x="6.5" y="10.5" width="7" height="7" />
      <path d="M11 6.5h6.5V13M17.5 6.5l-6 6" />
    </S>
  ),
  hand: () => (
    <S>
      <path d="M8.5 12.5V8a1 1 0 0 1 2 0v3.5V6.5a1 1 0 0 1 2 0v5-4a1 1 0 0 1 2 0v4.5-3a1 1 0 0 1 2 0v5c0 3-2 5-4.5 5h-.6c-1.6 0-2.6-.6-3.6-1.8l-2.3-2.9a1 1 0 0 1 1.5-1.3l1.5 1.4" />
    </S>
  ),
  frame: () => (
    <S>
      <path d="M9.5 5.5v13M14.5 5.5v13M5.5 9.5h13M5.5 14.5h13" />
    </S>
  ),
  section: () => (
    <S>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
      <path d="M5.5 9.5h6v-4" />
    </S>
  ),
  slice: () => (
    <S>
      <path d="M8 5.5 16 18.5M5.5 9h13" />
    </S>
  ),
  rectangle: () => (
    <S>
      <rect x="6.5" y="6.5" width="11" height="11" />
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
      <path d="M6.5 17.5l11-11M11 6.5h6.5V13" />
    </S>
  ),
  polygon: () => (
    <S>
      <path d="M12 6l6.5 11.5h-13z" />
    </S>
  ),
  star: () => (
    <S>
      <path d="M12 5.8l1.9 4.1 4.4.5-3.3 3 .9 4.4L12 15.6l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" />
    </S>
  ),
  image: () => (
    <S>
      <rect x="5.5" y="6.5" width="13" height="11" rx="1" />
      <circle cx="9.5" cy="10.5" r="1.2" />
      <path d="M5.5 15.5l4-3.5 3 2.5 2-1.5 4 3" />
    </S>
  ),
  pen: () => (
    <S>
      <path d="M12 5.5l4.5 8.5-2 4.5h-5l-2-4.5zM12 5.5v6" />
      <circle cx="12" cy="12.5" r="1" />
    </S>
  ),
  pencil: () => (
    <S>
      <path d="M15.5 5.5l3 3-9 9-3.8.8.8-3.8zM13.5 7.5l3 3" />
    </S>
  ),
  text: () => (
    <S>
      <path d="M7 7.5V6h10v1.5M12 6v12M10 18h4" />
    </S>
  ),
  comment: () => (
    <S>
      <path d="M12 5.5a6.5 6.5 0 0 1 0 13H5.5V12A6.5 6.5 0 0 1 12 5.5z" />
    </S>
  ),
  insert: () => (
    <S>
      <path d="M9 5.5l3 3-3 3-3-3z" />
      <circle cx="15.5" cy="8.5" r="2.5" />
      <rect x="6.5" y="13.5" width="5" height="5" rx="1" />
      <path d="M15.5 13.5v5M13 16h5" />
    </S>
  ),
  draw: () => (
    <S>
      <path d="M16 5.5l2.5 2.5-7 7-3 .5.5-3zM5.5 18.5c1.5-2 3-2 4-1s2 1 3.5-.5 2.5-1 3 0" />
    </S>
  ),
  motion: () => (
    <S>
      <path d="M12 5l7 7-7 7-7-7z" />
      <path d="M10.5 9.8v4.4l3.3-2.2z" />
    </S>
  ),
  code: () => (
    <S>
      <path d="M9.5 8.5 6 12l3.5 3.5M14.5 8.5 18 12l-3.5 3.5" />
    </S>
  ),
  sparkle: () => (
    <S>
      <path d="M12 5.5c.5 3.5 3 6 6.5 6.5-3.5.5-6 3-6.5 6.5-.5-3.5-3-6-6.5-6.5 3.5-.5 6-3 6.5-6.5z" />
    </S>
  ),
  assets: () => (
    <S>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 9v6M9 12h6" />
    </S>
  ),
  tools: () => (
    <S>
      <rect x="5.5" y="8.5" width="13" height="9" rx="1.5" />
      <path d="M9.5 8.5v-2h5v2M5.5 12.5h13M10.5 11.5v2M13.5 11.5v2" />
    </S>
  ),
  variables: () => (
    <S>
      <path d="M12 5.5l5.6 3.2v6.6L12 18.5l-5.6-3.2V8.7z" />
      <circle cx="12" cy="12" r="1.8" />
    </S>
  ),
  chevronDown: () => (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
      <path d="M1.5 3 4 5.5 6.5 3" fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  ),
  chevronRight: () => (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
      <path d="M3 1.5 5.5 4 3 6.5" fill="none" stroke="currentColor" strokeLinecap="round" />
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
      <path d="M4.5 12s2.8-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.8 4.5-7.5 4.5S4.5 12 4.5 12z" />
      <circle cx="12" cy="12" r="2" />
    </S>
  ),
  eyeOff: () => (
    <S>
      <path d="M5.5 10.5c1.5 2 3.7 3 6.5 3s5-1 6.5-3M8 13.3l-1.3 1.7M16 13.3l1.3 1.7M12 13.5v2" />
    </S>
  ),
  lock: () => (
    <S>
      <rect x="7.5" y="11.5" width="9" height="7" rx="1" />
      <path d="M9.5 11.5V9.5a2.5 2.5 0 0 1 5 0v2" />
    </S>
  ),
  unlock: () => (
    <S>
      <rect x="7.5" y="11.5" width="9" height="7" rx="1" />
      <path d="M9.5 11.5V9.5a2.5 2.5 0 0 1 4.9-.7" />
    </S>
  ),
  group: () => (
    <S>
      <path d="M6.5 8.5v-2h2M15.5 6.5h2v2M17.5 15.5v2h-2M8.5 17.5h-2v-2" />
    </S>
  ),
  component: () => (
    <S>
      <path d="M12 5.5l2.5 2.5L12 10.5 9.5 8zM12 13.5l2.5 2.5-2.5 2.5L9.5 16zM8 9.5l2.5 2.5L8 14.5 5.5 12zM16 9.5l2.5 2.5-2.5 2.5-2.5-2.5z" />
    </S>
  ),
  instance: () => (
    <S>
      <path d="M12 5.5l6.5 6.5-6.5 6.5L5.5 12z" />
    </S>
  ),
  vector: () => (
    <S>
      <path d="M6.5 17.5c2-8 9-3 11-11" />
      <rect x="5" y="16" width="3" height="3" />
      <rect x="16" y="5" width="3" height="3" />
    </S>
  ),
  boolean: () => (
    <S>
      <rect x="5.5" y="5.5" width="9" height="9" />
      <rect x="9.5" y="9.5" width="9" height="9" />
    </S>
  ),
  autoV: () => (
    <S>
      <rect x="7.5" y="5.5" width="9" height="5" rx="1" />
      <rect x="7.5" y="13.5" width="9" height="5" rx="1" />
    </S>
  ),
  autoH: () => (
    <S>
      <rect x="5.5" y="7.5" width="5" height="9" rx="1" />
      <rect x="13.5" y="7.5" width="5" height="9" rx="1" />
    </S>
  ),
  wrap: () => (
    <S>
      <rect x="5.5" y="6.5" width="5" height="4" rx="1" />
      <rect x="13.5" y="6.5" width="5" height="4" rx="1" />
      <rect x="5.5" y="13.5" width="5" height="4" rx="1" />
    </S>
  ),
  grid: () => (
    <S>
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
      <rect x="13.5" y="5.5" width="5" height="5" rx="1" />
      <rect x="5.5" y="13.5" width="5" height="5" rx="1" />
      <rect x="13.5" y="13.5" width="5" height="5" rx="1" />
    </S>
  ),
  freeform: () => (
    <S>
      <rect x="5.5" y="5.5" width="6" height="5" rx="1" />
      <circle cx="15.5" cy="15.5" r="3" />
    </S>
  ),
  alignLeft: () => (
    <S>
      <path d="M6.5 5.5v13" />
      <rect x="8.5" y="8.5" width="9" height="2.5" />
      <rect x="8.5" y="13" width="5" height="2.5" />
    </S>
  ),
  alignHCenter: () => (
    <S>
      <path d="M12 5.5v13" />
      <rect x="7.5" y="8.5" width="9" height="2.5" />
      <rect x="9.5" y="13" width="5" height="2.5" />
    </S>
  ),
  alignRight: () => (
    <S>
      <path d="M17.5 5.5v13" />
      <rect x="6.5" y="8.5" width="9" height="2.5" />
      <rect x="10.5" y="13" width="5" height="2.5" />
    </S>
  ),
  alignTop: () => (
    <S>
      <path d="M5.5 6.5h13" />
      <rect x="8.5" y="8.5" width="2.5" height="9" />
      <rect x="13" y="8.5" width="2.5" height="5" />
    </S>
  ),
  alignVCenter: () => (
    <S>
      <path d="M5.5 12h13" />
      <rect x="8.5" y="7.5" width="2.5" height="9" />
      <rect x="13" y="9.5" width="2.5" height="5" />
    </S>
  ),
  alignBottom: () => (
    <S>
      <path d="M5.5 17.5h13" />
      <rect x="8.5" y="6.5" width="2.5" height="9" />
      <rect x="13" y="10.5" width="2.5" height="5" />
    </S>
  ),
  distribute: () => (
    <S>
      <path d="M6.5 5.5v13M17.5 5.5v13" />
      <rect x="10.5" y="8.5" width="3" height="7" />
    </S>
  ),
  tidy: () => (
    <S>
      <rect x="6.5" y="6.5" width="4" height="4" />
      <rect x="13.5" y="6.5" width="4" height="4" />
      <rect x="6.5" y="13.5" width="4" height="4" />
      <rect x="13.5" y="13.5" width="4" height="4" />
    </S>
  ),
  rotate: () => (
    <S>
      <path d="M7.5 16.5a6 6 0 1 1 3 2M7.5 16.5V13M7.5 16.5h3.5" />
    </S>
  ),
  radius: () => (
    <S>
      <path d="M6.5 17.5v-6a5 5 0 0 1 5-5h6" />
    </S>
  ),
  corners: () => (
    <S>
      <path d="M6.5 9.5v-3h3M14.5 6.5h3v3M17.5 14.5v3h-3M9.5 17.5h-3v-3" />
    </S>
  ),
  link: () => (
    <S>
      <path d="M10.5 13.5l3-3M9 11l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L12.5 14.5M15 13l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L11.5 9.5" />
    </S>
  ),
  unlink: () => (
    <S>
      <path d="M9 11l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L12.5 14.5M15 13l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L11.5 9.5" />
    </S>
  ),
  flipH: () => (
    <S>
      <path d="M12 5.5v13M10 8.5 6 15.5h4zM14 8.5l4 7h-4z" />
    </S>
  ),
  flipV: () => (
    <S>
      <path d="M5.5 12h13M8.5 10l7-4v4zM8.5 14l7 4v-4z" />
    </S>
  ),
  play: () => (
    <S>
      <path d="M9 7v10l8-5z" />
    </S>
  ),
  search: () => (
    <S>
      <circle cx="11" cy="11" r="4.5" />
      <path d="M14.5 14.5 18 18" />
    </S>
  ),
  close: () => (
    <S>
      <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" />
    </S>
  ),
  home: () => (
    <S>
      <path d="M6.5 11 12 6.5l5.5 4.5v6.5h-11z" />
    </S>
  ),
  file: () => (
    <S>
      <path d="M7.5 5.5h6l3 3v10h-9z" />
    </S>
  ),
  trash: () => (
    <S>
      <path d="M7.5 8.5h9M10 8.5V7h4v1.5M8.5 8.5l.7 9h5.6l.7-9" />
    </S>
  ),
  clock: () => (
    <S>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 8.5V12l2.5 1.5" />
    </S>
  ),
  users: () => (
    <S>
      <circle cx="10" cy="9.5" r="2.5" />
      <path d="M5.5 17.5a4.5 4.5 0 0 1 9 0M15 7.5a2.5 2.5 0 0 1 0 5M17 13.5a4.5 4.5 0 0 1 1.5 4" />
    </S>
  ),
  panel: () => (
    <S>
      <rect x="5.5" y="6.5" width="13" height="11" rx="1" />
      <path d="M10 6.5v11" />
    </S>
  ),
  dots: () => (
    <S>
      <Dot cx={7} cy={12} />
      <Dot cx={12} cy={12} />
      <Dot cx={17} cy={12} />
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
      <path d="M7 12.5l3 3 7-7" />
    </S>
  ),
  page: () => (
    <S>
      <path d="M8.5 6.5h7v11h-7z" />
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
      <path d="M5.5 5.5h9v4h4v9h-9v-4h-4z" />
    </S>
  ),
  subtract: () => (
    <S>
      <path d="M5.5 5.5h9v4h-5v5h-4z" />
      <rect x="9.5" y="9.5" width="9" height="9" strokeDasharray="1.5 1.5" />
    </S>
  ),
  intersect: () => (
    <S>
      <rect x="5.5" y="5.5" width="9" height="9" strokeDasharray="1.5 1.5" />
      <rect x="9.5" y="9.5" width="9" height="9" strokeDasharray="1.5 1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" />
    </S>
  ),
  exclude: () => (
    <S>
      <path d="M5.5 5.5h9v4h-5v5h-4zM14.5 9.5h4v9h-9v-4h5z" />
    </S>
  ),
  sun: () => (
    <S>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5.5v1.5M12 17v1.5M5.5 12H7M17 12h1.5M7.4 7.4l1 1M15.6 15.6l1 1M7.4 16.6l1-1M15.6 8.4l1-1" />
    </S>
  ),
  moon: () => (
    <S>
      <path d="M16.5 14A6 6 0 0 1 10 7.5a5 5 0 1 0 6.5 6.5z" />
    </S>
  ),
  history: () => (
    <S>
      <path d="M6.5 12a5.5 5.5 0 1 0 1.6-3.9M6.5 6.5v2.5H9M12 9v3l2 1.5" />
    </S>
  ),
  share: () => (
    <S>
      <path d="M12 14V5.5M9 8.5l3-3 3 3M7.5 11.5v6h9v-6" />
    </S>
  ),
  bell: () => (
    <S>
      <path d="M7.5 15.5v-5a4.5 4.5 0 0 1 9 0v5l1.5 1.5h-12zM10.5 18.5a1.5 1.5 0 0 0 3 0" />
    </S>
  ),
  book: () => (
    <S>
      <path d="M12 7.5c-1.2-1.3-3-2-6.5-2v11c3.5 0 5.3.7 6.5 2 1.2-1.3 3-2 6.5-2v-11c-3.5 0-5.3.7-6.5 2zM12 7.5v11" />
    </S>
  ),
  folder: () => (
    <S>
      <path d="M5.5 7.5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
    </S>
  ),
  starFill: () => (
    <S>
      <path d="M12 5.8l1.9 4.1 4.4.5-3.3 3 .9 4.4L12 15.6l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" fill="currentColor" />
    </S>
  ),
  mic: () => (
    <S>
      <rect x="9.5" y="5.5" width="5" height="8" rx="2.5" />
      <path d="M7.5 11.5a4.5 4.5 0 0 0 9 0M12 16v2.5" />
    </S>
  ),
  send: () => (
    <S>
      <path d="M12 17.5v-11M7.5 11 12 6.5l4.5 4.5" />
    </S>
  ),
  filter: () => (
    <S>
      <path d="M5.5 7.5h13M8 12h8M10.5 16.5h3" />
    </S>
  ),
  list: () => (
    <S>
      <path d="M9.5 7.5h9M9.5 12h9M9.5 16.5h9" />
      <Dot cx={6.5} cy={7.5} r={0.9} />
      <Dot cx={6.5} cy={12} r={0.9} />
      <Dot cx={6.5} cy={16.5} r={0.9} />
    </S>
  ),
  layoutGuide: () => (
    <S>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
      <path d="M9.5 5.5v13M14.5 5.5v13" />
    </S>
  ),
  blend: () => (
    <S>
      <path d="M12 5.5c1.6 2.2 4.5 5.2 4.5 8a4.5 4.5 0 0 1-9 0c0-2.8 2.9-5.8 4.5-8z" />
    </S>
  ),
  hug: () => (
    <S>
      <path d="M6 6l3.5 3.5M9.5 6.5v3h-3M18 6l-3.5 3.5M14.5 6.5v3h3M6 18l3.5-3.5M9.5 17.5v-3h-3M18 18l-3.5-3.5M14.5 17.5v-3h3" />
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
