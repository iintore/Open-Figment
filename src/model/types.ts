// Core document model. Nodes live in a flat map; pages and containers hold ordered child ids
// (index 0 = bottom of the z-order, last = top).

export type NodeType =
  | 'FRAME'
  | 'GROUP'
  | 'SECTION'
  | 'COMPONENT'
  | 'INSTANCE'
  | 'BOOLEAN'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'LINE'
  | 'ARROW'
  | 'POLYGON'
  | 'STAR'
  | 'TEXT'
  | 'VECTOR';

export type BlendMode =
  | 'NORMAL'
  | 'MULTIPLY'
  | 'SCREEN'
  | 'OVERLAY'
  | 'DARKEN'
  | 'LIGHTEN'
  | 'COLOR_DODGE'
  | 'COLOR_BURN'
  | 'HARD_LIGHT'
  | 'SOFT_LIGHT'
  | 'DIFFERENCE'
  | 'EXCLUSION'
  | 'HUE'
  | 'SATURATION'
  | 'COLOR'
  | 'LUMINOSITY';

export interface ColorStop {
  position: number; // 0..1
  color: string; // RRGGBB
  opacity: number; // 0..1
}

export type Paint =
  | { id: string; type: 'SOLID'; color: string; opacity: number; visible: boolean; blendMode?: BlendMode }
  | {
      id: string;
      type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR';
      stops: ColorStop[];
      angle: number; // degrees, for linear/angular
      opacity: number;
      visible: boolean;
    }
  | {
      id: string;
      type: 'IMAGE';
      imageId: string;
      scaleMode: 'FILL' | 'FIT' | 'TILE' | 'STRETCH';
      opacity: number;
      visible: boolean;
    };

export type EffectType = 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';

export interface Effect {
  id: string;
  type: EffectType;
  visible: boolean;
  color: string;
  opacity: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
}

export interface VectorPoint {
  x: number;
  y: number;
  // Bezier handles, relative to the anchor.
  hIn?: { x: number; y: number };
  hOut?: { x: number; y: number };
}

export interface VectorPath {
  points: VectorPoint[];
  closed: boolean;
}

export type Constraint = 'MIN' | 'MAX' | 'CENTER' | 'STRETCH' | 'SCALE';
export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
export type AxisAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
export type Sizing = 'FIXED' | 'HUG' | 'FILL';

export interface LayoutGuide {
  id: string;
  type: 'GRID' | 'COLUMNS' | 'ROWS';
  visible: boolean;
  size: number; // grid cell size
  count: number; // columns/rows count
  gutter: number;
  margin: number;
  color: string;
  opacity: number;
}

export type VariableType = 'COLOR' | 'NUMBER' | 'STRING' | 'BOOLEAN';

export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  values: Record<string, string | number | boolean>; // modeId -> value (COLOR values are RRGGBB)
}

export interface VariableCollection {
  id: string;
  name: string;
  modes: { id: string; name: string }[];
  variables: Variable[];
}

export interface ExportSetting {
  id: string;
  scale: number;
  format: 'PNG' | 'JPG' | 'SVG';
  suffix: string;
}

export type TransitionType = 'INSTANT' | 'DISSOLVE' | 'SMART_ANIMATE' | 'MOVE_IN' | 'PUSH' | 'SLIDE_IN';
export type TriggerType = 'ON_CLICK' | 'ON_HOVER' | 'ON_DRAG' | 'AFTER_DELAY';
export type ActionType = 'NAVIGATE' | 'BACK' | 'OPEN_URL' | 'SCROLL_TO';

export interface Interaction {
  id: string;
  trigger: TriggerType;
  delay?: number;
  action: ActionType;
  destinationId?: string;
  url?: string;
  transition: TransitionType;
  direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  duration: number; // ms
  easing: 'EASE_OUT' | 'EASE_IN' | 'EASE_IN_OUT' | 'LINEAR';
}

export interface SceneNode {
  id: string;
  type: NodeType;
  name: string;
  parentId: string; // page id or node id
  children?: string[];

  // Transform: translate(x, y) then rotate(rotation) — rotation about the node origin.
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, clockwise positive (the UI shows the negation, counter-clockwise positive)
  flipX?: boolean;
  flipY?: boolean;

  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  isMask?: boolean;

  fills: Paint[];
  strokes: Paint[];
  strokeWeight: number;
  strokeAlign: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  strokeDash?: number[];
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW';
  strokeJoin?: 'MITER' | 'ROUND' | 'BEVEL';
  effects: Effect[];

  cornerRadius: number;
  cornerRadii?: [number, number, number, number]; // tl, tr, br, bl when independent
  cornerSmoothing?: number;

  // Containers
  clipContent?: boolean;
  layoutMode?: LayoutMode;
  itemSpacing?: number;
  padding?: { t: number; r: number; b: number; l: number };
  primaryAxisAlign?: AxisAlign;
  counterAxisAlign?: 'MIN' | 'CENTER' | 'MAX';
  primarySizing?: 'FIXED' | 'HUG';
  counterSizing?: 'FIXED' | 'HUG';
  layoutWrap?: boolean; // wrap overflowing items onto new rows (horizontal) or columns (vertical)
  counterAxisSpacing?: number; // gap between wrapped rows/columns, and grid row gap
  gridColumns?: number;
  gridRows?: number;
  layoutGuides?: LayoutGuide[];
  exportFills?: boolean; // "Show in exports" — false hides this frame's fills when exporting

  // As a child
  constraintH?: Constraint;
  constraintV?: Constraint;
  layoutSizingH?: Sizing;
  layoutSizingV?: Sizing;
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';

  // Shapes
  pointCount?: number;
  innerRadius?: number; // star ratio 0..1
  arcStart?: number;
  arcSweep?: number; // ellipse arc data (degrees)
  arcInner?: number;

  // Vector
  vector?: VectorPath;
  vectorBase?: { w: number; h: number }; // size at which points were authored

  // Boolean
  booleanOp?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

  // Text
  characters?: string;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  fontSize?: number;
  lineHeight?: number | 'AUTO'; // px
  letterSpacing?: number; // percent of font size
  paragraphSpacing?: number;
  textAlign?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignV?: 'TOP' | 'CENTER' | 'BOTTOM';
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';

  // Components
  mainComponentId?: string; // on INSTANCE
  refId?: string; // inside an instance: id of the mirrored node in the main component
  overrides?: string[]; // property keys overridden on an instance sublayer
  description?: string;

  // Prototype
  interactions?: Interaction[];
  flowStart?: string; // flow name if this top-level frame starts a flow

  exports?: ExportSetting[];
}

export interface Page {
  id: string;
  name: string;
  background: string;
  children: string[];
}

export interface CommentMessage {
  id: string;
  author: string;
  color: string;
  text: string;
  at: number;
}

export interface CommentThread {
  id: string;
  pageId: string;
  x: number;
  y: number;
  resolved: boolean;
  messages: CommentMessage[];
}

export interface ColorStyle {
  id: string;
  name: string;
  paints: Paint[];
}

export interface TextStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number | 'AUTO';
  letterSpacing: number;
}

export interface EffectStyle {
  id: string;
  name: string;
  effects: Effect[];
}

export interface Version {
  id: string;
  name: string;
  at: number;
  data: string;
}

export interface DocumentData {
  id: string;
  name: string;
  pages: Page[];
  nodes: Record<string, SceneNode>;
  comments: CommentThread[];
  colorStyles: ColorStyle[];
  textStyles: TextStyle[];
  effectStyles: EffectStyle[];
  variableCollections?: VariableCollection[];
  versions: Version[];
  createdAt: number;
  updatedAt: number;
}

export interface FileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  trashed?: boolean;
  starred?: boolean;
}

export type ToolId =
  | 'MOVE'
  | 'SCALE'
  | 'HAND'
  | 'FRAME'
  | 'SECTION'
  | 'SLICE'
  | 'RECTANGLE'
  | 'LINE'
  | 'ARROW'
  | 'ELLIPSE'
  | 'POLYGON'
  | 'STAR'
  | 'IMAGE'
  | 'PEN'
  | 'PENCIL'
  | 'ERASER'
  | 'TEXT'
  | 'COMMENT';

export const CONTAINER_TYPES: NodeType[] = ['FRAME', 'GROUP', 'SECTION', 'COMPONENT', 'INSTANCE', 'BOOLEAN'];
export const FRAME_LIKE: NodeType[] = ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION'];
