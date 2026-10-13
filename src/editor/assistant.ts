import { get } from '../store/store';
import * as A from './actions';
import { generateButtons, generateLogin, generatePricingCard } from './generators';
import { solid } from '../model/doc';
import type { SceneNode } from '../model/types';

// A small, local, rule-based assistant. It understands a fixed set of phrasings and maps them
// to editor commands. It never calls a network service or an AI model.

const COLORS: Record<string, string> = {
  red: 'F24822',
  orange: 'FFA629',
  yellow: 'FFCD29',
  green: '14AE5C',
  blue: '0D99FF',
  purple: '9747FF',
  pink: 'FF24BD',
  black: '000000',
  white: 'FFFFFF',
  gray: '9E9E9E',
  grey: '9E9E9E',
};

export interface AssistantResult {
  ok: boolean;
  reply: string;
}

function selected(): SceneNode[] {
  const s = get();
  return s.selection.map((id) => s.doc!.nodes[id]).filter(Boolean);
}

function needSelection(): AssistantResult | null {
  return selected().length ? null : { ok: false, reply: 'Select one or more layers first, then ask again.' };
}

export const ASSISTANT_EXAMPLES = [
  'Make it blue',
  'Round corners 12',
  'Add auto layout',
  'Tidy up',
  'Generate a login screen',
  'Make a pricing card',
  'Rename layers by content',
  'Add a drop shadow',
];

/** Runs one assistant request; everything it changes is a single undo step. */
export function runAssistant(input: string): AssistantResult {
  let result: AssistantResult = { ok: false, reply: '' };
  A.asOneStep(() => {
    result = runRequest(input);
  });
  return result;
}

function runRequest(input: string): AssistantResult {
  const t = input.toLowerCase().trim();
  if (!t) return { ok: false, reply: 'Type a request, for example “make it blue”.' };

  if (/login|sign.?in/.test(t)) {
    generateLogin();
    return { ok: true, reply: 'Added a login screen to the right of your designs.' };
  }
  if (/pricing|price card|plan card/.test(t)) {
    generatePricingCard();
    return { ok: true, reply: 'Added a pricing card.' };
  }
  if (/button/.test(t) && /(generate|make|create|add)/.test(t)) {
    generateButtons();
    return { ok: true, reply: 'Added primary, secondary and ghost buttons.' };
  }

  const color = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (color && /(make|color|colour|fill|turn|paint)/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    const target = /stroke|border|outline/.test(t) ? 'strokes' : 'fills';
    A.updateNodes(get().selection, (n) => ({ [target]: [solid(COLORS[color])], strokeWeight: target === 'strokes' ? n.strokeWeight || 1 : n.strokeWeight }));
    return { ok: true, reply: `Set the ${target === 'strokes' ? 'stroke' : 'fill'} to ${color}.` };
  }

  const radius = t.match(/(?:round|radius|corner)[^\d]*(\d+)/);
  if (radius || /rounded|round corners/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    const r = radius ? Number(radius[1]) : 8;
    A.updateNodes(get().selection, { cornerRadius: r, cornerRadii: undefined });
    return { ok: true, reply: `Set the corner radius to ${r}.` };
  }

  if (/auto ?layout|stack/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    if (/remove/.test(t)) {
      A.removeAutoLayout();
      return { ok: true, reply: 'Removed auto layout.' };
    }
    A.addAutoLayout();
    return { ok: true, reply: 'Added auto layout.' };
  }

  if (/tidy|clean ?up|polish/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    // Round geometry to whole pixels, then tidy positions.
    A.updateNodes(get().selection, (n) => ({ x: Math.round(n.x), y: Math.round(n.y), w: Math.max(1, Math.round(n.w)), h: n.type === 'LINE' || n.type === 'ARROW' ? 0 : Math.max(1, Math.round(n.h)) }));
    if (selected().length > 1) A.tidyUp();
    return { ok: true, reply: 'Snapped the selection to whole pixels and tidied the spacing.' };
  }

  if (/rename/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    const d = get().doc!;
    const ids = selected().flatMap((n) => [n.id, ...(n.children ?? [])]);
    A.updateNodes(ids, (n) => {
      if (n.type === 'TEXT') return { name: (n.characters ?? '').slice(0, 40) || n.name };
      const firstText = (n.children ?? []).map((c) => d.nodes[c]).find((c) => c?.type === 'TEXT');
      return firstText ? { name: (firstText.characters ?? '').slice(0, 40) } : undefined;
    });
    return { ok: true, reply: 'Renamed layers using their text content.' };
  }

  if (/shadow/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    if (/remove|no /.test(t)) {
      A.updateNodes(get().selection, (n) => ({ effects: n.effects.filter((e) => e.type !== 'DROP_SHADOW') }));
      return { ok: true, reply: 'Removed drop shadows.' };
    }
    A.updateNodes(get().selection, (n) => ({
      effects: [...n.effects, { id: Math.random().toString(36).slice(2), type: 'DROP_SHADOW', visible: true, color: '000000', opacity: 0.15, x: 0, y: 6, blur: 18, spread: 0 }],
    }));
    return { ok: true, reply: 'Added a soft drop shadow.' };
  }

  if (/component/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    A.createComponent();
    return { ok: true, reply: 'Created a component from the selection.' };
  }

  if (/center|centre/.test(t)) {
    const miss = needSelection();
    if (miss) return miss;
    A.align('hcenter');
    A.align('vcenter');
    return { ok: true, reply: 'Centered the selection.' };
  }

  const scale = t.match(/(bigger|larger|smaller)/);
  if (scale) {
    const miss = needSelection();
    if (miss) return miss;
    const k = scale[1] === 'smaller' ? 0.8 : 1.25;
    A.updateNodes(get().selection, (n) => ({ w: n.w * k, h: n.h * k, fontSize: n.fontSize ? Math.round(n.fontSize * k) : n.fontSize }));
    return { ok: true, reply: `Made the selection ${scale[1] === 'smaller' ? 'smaller' : 'bigger'}.` };
  }

  return {
    ok: false,
    reply: `I don't understand that yet. I'm a local, rule-based assistant. Try: ${ASSISTANT_EXAMPLES.slice(0, 4).map((e) => `“${e}”`).join(', ')}.`,
  };
}
