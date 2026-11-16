/** Guitar chord box and a small piano keyboard, drawn with SVG. */
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Text, View } from 'react-native';
import { guitarShapes, pianoVoicing } from '../../core/music/voicings';
import { font, useTheme } from '../../ui/theme';

export function GuitarDiagram({ chord, capo = 0, size = 1, index = 0 }: { chord: string; capo?: number; size?: number; index?: number }) {
  const t = useTheme();
  const shapes = guitarShapes(chord, { capo, max: index + 1 });
  const shape = shapes[index] ?? shapes[0];
  const W = 92 * size;
  const H = 112 * size;
  if (!shape) return <Text style={{ color: t.textFaint, fontSize: font.small, width: W }}>No shape</Text>;
  const left = 14 * size;
  const top = 22 * size;
  const sw = (W - left * 2) / 5;
  const fh = (H - top - 8 * size) / 5;
  const base = shape.baseFret;
  return (
    <View style={{ width: W, height: H }} accessible accessibilityLabel={`${chord} guitar shape ${shape.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`}>
      <Svg width={W} height={H}>
        {/* nut or position */}
        {base === 1 ? <Rect x={left} y={top - 3 * size} width={sw * 5} height={3 * size} fill={t.text} /> : <SvgText x={2} y={top + fh * 0.65} fontSize={10 * size} fill={t.textDim}>{`${base}`}</SvgText>}
        {Array.from({ length: 6 }, (_, i) => (
          <Line key={'s' + i} x1={left + i * sw} y1={top} x2={left + i * sw} y2={top + fh * 5} stroke={t.textDim} strokeWidth={1} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <Line key={'f' + i} x1={left} y1={top + i * fh} x2={left + sw * 5} y2={top + i * fh} stroke={t.border} strokeWidth={1} />
        ))}
        {shape.barre && (
          <Rect
            x={left + shape.barre.from * sw - 5 * size}
            y={top + (shape.barre.fret - base + 0.5) * fh - 5 * size}
            width={(shape.barre.to - shape.barre.from) * sw + 10 * size}
            height={10 * size}
            rx={5 * size}
            fill={t.text}
          />
        )}
        {shape.frets.map((f, i) => {
          const x = left + i * sw;
          if (f < 0)
            return (
              <SvgText key={i} x={x} y={top - 7 * size} fontSize={10 * size} fill={t.textDim} textAnchor="middle">
                ×
              </SvgText>
            );
          if (f === 0) return <Circle key={i} cx={x} cy={top - 10 * size} r={3.5 * size} stroke={t.textDim} strokeWidth={1.2} fill="none" />;
          return <Circle key={i} cx={x} cy={top + (f - base + 0.5) * fh} r={5.5 * size} fill={t.text} />;
        })}
      </Svg>
    </View>
  );
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK_X: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

/** Two octaves from C3; chord tones (and an optional set of notes) highlighted. */
export function PianoKeys({ chord, notes, width = 230, from = 48, octaves = 2 }: { chord?: string; notes?: number[]; width?: number; from?: number; octaves?: number }) {
  const t = useTheme();
  const v = chord ? pianoVoicing(chord) : null;
  const lit = new Set(notes ?? (v ? [v.bass, ...v.notes] : []));
  const whites = octaves * 7;
  const ww = width / whites;
  const h = ww * 4;
  const keys = [];
  for (let o = 0; o < octaves; o++) {
    WHITE.forEach((pc, i) => {
      const midi = from + o * 12 + pc;
      keys.push(<Rect key={'w' + midi} x={(o * 7 + i) * ww} y={0} width={ww - 1} height={h} rx={2} fill={lit.has(midi) ? t.accent : t.dark ? '#d9d6cf' : '#ffffff'} stroke={t.border} />);
    });
  }
  for (let o = 0; o < octaves; o++) {
    for (const [pc, pos] of Object.entries(BLACK_X)) {
      const midi = from + o * 12 + Number(pc);
      keys.push(<Rect key={'b' + midi} x={(o * 7 + pos) * ww - ww * 0.32} y={0} width={ww * 0.64} height={h * 0.62} rx={2} fill={lit.has(midi) ? t.accent : '#222'} />);
    }
  }
  return (
    <View style={{ width, height: h + 1 }} accessible accessibilityLabel={chord ? `${chord} on piano` : 'Piano keys'}>
      <Svg width={width} height={h + 1}>
        {keys}
      </Svg>
    </View>
  );
}
