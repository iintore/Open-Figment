import { useState } from 'react';
import { get, mutate, set, useStore } from '../store/store';
import { uid } from '../model/doc';
import { worldToScreen } from './viewport';

function timeAgo(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function CommentThreadPopover({ id, onClose }: { id: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const me = useStore((s) => s.me);
  const [text, setText] = useState('');
  const thread = doc?.comments.find((c) => c.id === id);
  if (!thread) return null;
  const send = () => {
    if (!text.trim()) return;
    mutate((d) => {
      const t = d.comments.find((c) => c.id === id);
      t?.messages.push({ id: uid(), author: me.name, color: me.color, text: text.trim(), at: Date.now() });
    });
    setText('');
  };
  return (
    <div className="comment-popover" onPointerDown={(e) => e.stopPropagation()}>
      <div className="comment-popover-head">
        <span>Comment</span>
        <div className="row-actions">
          {thread.messages.length > 0 && (
            <button
              className="icon-btn"
              title={thread.resolved ? 'Re-open' : 'Resolve'}
              onClick={() =>
                mutate((d) => {
                  const t = d.comments.find((c) => c.id === id);
                  if (t) t.resolved = !t.resolved;
                })
              }
            >
              {thread.resolved ? '↺' : '✓'}
            </button>
          )}
          <button
            className="icon-btn"
            title="Delete thread"
            onClick={() => {
              mutate((d) => {
                d.comments = d.comments.filter((c) => c.id !== id);
              });
              onClose();
            }}
          >
            🗑
          </button>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="comment-msgs">
        {thread.messages.map((m) => (
          <div key={m.id} className="comment-msg">
            <div className="avatar sm" style={{ background: m.color }}>
              {m.author[0]}
            </div>
            <div>
              <div className="comment-meta">
                <b>{m.author}</b> <span>{timeAgo(m.at)}</span>
              </div>
              <div className="comment-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="comment-input">
        <textarea
          autoFocus
          placeholder={thread.messages.length ? 'Reply' : 'Add a comment'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <button className="send-btn" disabled={!text.trim()} onClick={send} title="Post">
          ↑
        </button>
      </div>
    </div>
  );
}

export function CanvasDomOverlay() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.version);
  const vp = useStore((s) => s.viewport);
  const pageId = useStore((s) => s.pageId);
  const tool = useStore((s) => s.tool);
  const commentsOpen = useStore((s) => s.commentsOpen);
  const active = useStore((s) => s.activeCommentId);
  const peers = useStore((s) => s.peers);
  const showCursors = useStore((s) => s.showCursors);
  if (!doc) return null;
  const showComments = tool === 'COMMENT' || commentsOpen;
  const close = () => {
    const t = get().doc?.comments.find((c) => c.id === active);
    if (t && !t.messages.length)
      mutate((d) => {
        d.comments = d.comments.filter((c) => c.id !== t.id);
      });
    set({ activeCommentId: null });
  };
  return (
    <div className="canvas-dom-overlay">
      {showComments &&
        doc.comments
          .filter((c) => c.pageId === pageId && (!c.resolved || c.id === active))
          .map((c) => {
            const p = worldToScreen({ x: c.x, y: c.y }, vp);
            const first = c.messages[0];
            return (
              <div key={c.id} className="comment-pin-wrap" style={{ left: p.x, top: p.y }}>
                <button
                  className={'comment-pin' + (c.id === active ? ' active' : '')}
                  style={{ background: first?.color ?? '#0D99FF' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    set({ activeCommentId: c.id === active ? null : c.id });
                  }}
                >
                  {first ? first.author[0] : '+'}
                </button>
                {c.id === active && <CommentThreadPopover id={c.id} onClose={close} />}
              </div>
            );
          })}
      {showCursors &&
        Object.values(peers)
          .filter((p) => p.pageId === pageId && p.cursor)
          .map((p) => {
            const sp = worldToScreen(p.cursor!, vp);
            return (
              <div key={p.id} className="peer-cursor" style={{ transform: `translate(${sp.x}px, ${sp.y}px)` }}>
                <svg width="16" height="20" viewBox="0 0 16 20">
                  <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill={p.color} stroke="#fff" strokeWidth="1.2" />
                </svg>
                <span style={{ background: p.color }}>{p.name}</span>
              </div>
            );
          })}
    </div>
  );
}
