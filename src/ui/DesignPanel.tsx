import { useStore } from '../store/store';
import * as A from '../editor/actions';
import { Icon } from './icons';
import { ancestors } from '../model/doc';
import { ComponentHeader, FramePresets, TypeHeader } from './design/Headers';
import { PositionSection } from './design/PositionSection';
import { LayoutSection } from './design/LayoutSection';
import { TextSection } from './design/TextSection';
import { FillSection, SelectionColors, StrokeSection } from './design/PaintSections';
import { EffectsSection } from './design/EffectsSection';
import { AppearanceSection } from './design/AppearanceSection';
import { LayoutGuideSection } from './design/LayoutGuideSection';
import { ExportSection } from './design/ExportSection';
import { PageSection } from './design/PageSection';

export function DesignPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.version);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const framePreset = useStore((s) => s.framePreset);
  if (!doc) return null;
  if (tool === 'FRAME' && framePreset) return <FramePresets />;
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);
  if (!nodes.length)
    return (
      <div className="panel-scroll">
        <PageSection />
      </div>
    );
  const allText = nodes.every((n) => n.type === 'TEXT');
  const anyText = nodes.some((n) => n.type === 'TEXT');
  const isGroupOnly = nodes.every((n) => n.type === 'GROUP');
  const inInstance = nodes.some((n) => ancestors(doc, n.id).some((a) => a.type === 'INSTANCE'));
  const frameLike = nodes.length === 1 && ['FRAME', 'COMPONENT', 'INSTANCE'].includes(nodes[0].type);
  return (
    <div className="panel-scroll" key={selection.join(',')}>
      <TypeHeader nodes={nodes} />
      <ComponentHeader nodes={nodes} />
      {inInstance && nodes.length === 1 && (
        <div className="prop-section">
          <div className="prop-row" style={{ color: 'var(--color-text-component)' }}>
            <Icon.instance /> <span style={{ flex: 1 }}>Layer inside instance</span>
            <button className="btn ghost" onClick={A.goToMainComponent}>
              Main
            </button>
          </div>
        </div>
      )}
      <PositionSection nodes={nodes} />
      <LayoutSection nodes={nodes} />
      <AppearanceSection nodes={nodes} />
      {allText && <TextSection nodes={nodes} />}
      {!isGroupOnly && <FillSection nodes={nodes} showInExports={frameLike} />}
      {!isGroupOnly && <StrokeSection nodes={nodes} />}
      <EffectsSection nodes={nodes} />
      {(nodes.length > 1 || nodes[0].children) && !anyText && <SelectionColors nodes={nodes} />}
      <LayoutGuideSection nodes={nodes} />
      <ExportSection nodes={nodes} />
    </div>
  );
}
