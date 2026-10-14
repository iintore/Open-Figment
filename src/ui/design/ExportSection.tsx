import { useMemo, useState } from 'react';
import type { ExportSetting } from '../../model/types';
import { useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { Section, Select } from '../controls';
import { Icon } from '../icons';
import { uid, absBounds } from '../../model/doc';
import { exportNode, download } from '../../editor/exporter';
import { renderNodesToCanvas } from '../../render/renderer';
import type { Nodes } from './shared';

export function ExportSection({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const version = useStore((s) => s.version);
  const [preview, setPreview] = useState(false);
  const n = nodes[0];
  const settings = nodes.length === 1 ? n.exports ?? [] : [];
  const update = (e: ExportSetting[]) => A.updateNodes([n.id], { exports: e });
  const doExport = async () => {
    for (const node of nodes) {
      const list = node.exports?.length ? node.exports : [{ id: 'x', scale: 1, format: 'PNG' as const, suffix: '' }];
      for (const st of list) {
        const { blob, name } = await exportNode(doc, node.id, st);
        download(blob, name);
      }
    }
  };
  const previewUrl = useMemo(() => {
    if (!preview || nodes.length !== 1) return '';
    const b = absBounds(doc, n.id);
    const k = Math.min(2, 400 / Math.max(b.w, b.h, 1));
    try {
      return renderNodesToCanvas(doc, [n.id], b, k).toDataURL();
    } catch {
      return '';
    }
  }, [preview, n?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section
      title="Export"
      muted={!settings.length}
      actions={
        nodes.length === 1 ? (
          <button className="icon-btn" title="Add export setting" onClick={() => update([...settings, { id: uid(), scale: settings.length ? settings.length + 1 : 1, format: 'PNG', suffix: '' }])}>
            <Icon.plus />
          </button>
        ) : null
      }
    >
      {settings.map((st, i) => (
        <div key={st.id} className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 24px' }}>
          <Select value={st.scale} options={[0.5, 0.75, 1, 1.5, 2, 3, 4].map((v) => ({ value: v, label: `${v}x` }))} onChange={(v) => update(settings.map((x, j) => (j === i ? { ...x, scale: v } : x)))} />
          <Select
            value={st.format}
            options={[
              { value: 'PNG', label: 'PNG' },
              { value: 'JPG', label: 'JPG' },
              { value: 'SVG', label: 'SVG' },
            ]}
            onChange={(v) => update(settings.map((x, j) => (j === i ? { ...x, format: v } : x)))}
          />
          <button className="icon-btn" onClick={() => update(settings.filter((_, j) => j !== i))}>
            <Icon.minus />
          </button>
        </div>
      ))}
      {(settings.length > 0 || nodes.length > 1) && (
        <>
          <div className="prop-row">
            <button className="btn secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={doExport}>
              Export {nodes.length === 1 ? n.name : `${nodes.length} layers`}
            </button>
          </div>
          {nodes.length === 1 && (
            <button className="prop-row" style={{ color: 'var(--color-text-secondary)', width: '100%' }} onClick={() => setPreview(!preview)}>
              <span style={{ transform: preview ? 'rotate(90deg)' : '' }}>
                <Icon.chevronRight />
              </span>
              Preview
            </button>
          )}
          {preview && previewUrl && (
            <div className="preview-box checker">
              <img src={previewUrl} alt="Export preview" />
            </div>
          )}
        </>
      )}
    </Section>
  );
}
