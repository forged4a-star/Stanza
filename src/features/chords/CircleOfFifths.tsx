/**
 * Interactive circle of fifths: outer ring major keys, inner ring relative
 * minors. The chosen key's diatonic chords light up with their numerals.
 * Tap to hear, long-press to add to the progression.
 */
import Svg, { G, Path, Text as SvgText, Circle } from 'react-native-svg';
import { View } from 'react-native';
import { mod12, noteName, type Key } from '../../core/music/theory';
import { useTheme } from '../../ui/theme';

/** pitch classes clockwise from the top: C G D A E B F# Db Ab Eb Bb F */
const ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const MAJOR_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯/G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];

export interface CircleProps {
  /** song key (highlights its chords) */
  keySig: Key | null;
  size: number;
  selected: string | null;
  onTap: (chord: string) => void;
  onLongPress: (chord: string) => void;
}

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/** numerals of the diatonic chords around a major-key position on the circle */
function litPositions(k: Key | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!k) return m;
  const majorTonic = k.mode === 'major' ? k.tonic : mod12(k.tonic + 3);
  const i = ORDER.indexOf(majorTonic);
  const at = (d: number) => (i + d + 12) % 12;
  const minor = k.mode === 'minor';
  m.set(`o${at(-1)}`, minor ? 'VI' : 'IV');
  m.set(`o${at(0)}`, minor ? 'III' : 'I');
  m.set(`o${at(1)}`, minor ? 'VII' : 'V');
  m.set(`i${at(-1)}`, minor ? 'iv' : 'ii');
  m.set(`i${at(0)}`, minor ? 'i' : 'vi');
  m.set(`i${at(1)}`, minor ? 'v' : 'iii');
  return m;
}

export function CircleOfFifths({ keySig, size, selected, onTap, onLongPress }: CircleProps) {
  const t = useTheme();
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 2;
  const rMid = R * 0.68;
  const rIn = R * 0.4;
  const lit = litPositions(keySig);
  const step = (2 * Math.PI) / 12;
  const flatSide = (i: number) => i >= 7;
  const homeIndex = keySig ? ORDER.indexOf(keySig.mode === 'major' ? keySig.tonic : mod12(keySig.tonic + 3)) : -1;

  const cell = (ring: 'o' | 'i', i: number) => {
    const pc = ORDER[i];
    const chord = ring === 'o' ? noteName(pc, flatSide(i)) : noteName(pc + 9, flatSide(i)) + 'm';
    const label = ring === 'o' ? MAJOR_NAMES[i] : noteName(pc + 9, flatSide(i)).replace('#', '♯').replace(/b$/, '♭') + 'm';
    const numeral = lit.get(`${ring}${i}`);
    const isHome = i === homeIndex && ((ring === 'o' && keySig?.mode === 'major') || (ring === 'i' && keySig?.mode === 'minor'));
    const a0 = i * step - step / 2;
    const a1 = a0 + step;
    const r0 = ring === 'o' ? rMid : rIn;
    const r1 = ring === 'o' ? R : rMid;
    const mid = (r0 + r1) / 2;
    const ax = cx + mid * Math.sin(i * step);
    const ay = cy - mid * Math.cos(i * step);
    const isSel = selected === chord;
    const fill = isHome ? t.accent : numeral ? t.accent + '55' : ring === 'o' ? t.surface2 : t.surface;
    return (
      <G key={ring + i} onPress={() => onTap(chord)} onLongPress={() => onLongPress(chord)} accessibilityLabel={`${chord}${numeral ? `, ${numeral}` : ''}`}>
        <Path d={wedge(cx, cy, r0, r1, a0, a1)} fill={fill} stroke={isSel ? t.text : t.border} strokeWidth={isSel ? 2.5 : 1} />
        <SvgText x={ax} y={ay + (numeral ? -2 : 4)} fontSize={ring === 'o' ? (label.length > 3 ? 10 : 15) : 11} fontWeight="700" fill={isHome ? t.accentText : t.text} textAnchor="middle">
          {label}
        </SvgText>
        {numeral && (
          <SvgText x={ax} y={ay + 12} fontSize={10} fill={isHome ? t.accentText : t.textDim} textAnchor="middle">
            {numeral}
          </SvgText>
        )}
      </G>
    );
  };
  // the diminished chord (vii° in major, ii° in minor) sits in the middle
  const majorTonic = keySig ? (keySig.mode === 'major' ? keySig.tonic : mod12(keySig.tonic + 3)) : null;
  const dim = majorTonic === null ? null : noteName(majorTonic + 11, homeIndex >= 7) + 'dim';
  return (
    <View testID="circle-of-fifths">
      <Svg width={size} height={size}>
        {Array.from({ length: 12 }, (_, i) => cell('o', i))}
        {Array.from({ length: 12 }, (_, i) => cell('i', i))}
        <Circle cx={cx} cy={cy} r={rIn} fill={t.bg} stroke={t.border} />
        {dim && (
          <G onPress={() => onTap(dim)} onLongPress={() => onLongPress(dim)} accessibilityLabel={`${dim}, diminished`}>
            <Circle cx={cx} cy={cy} r={rIn - 6} fill={selected === dim ? t.surface2 : 'transparent'} />
            <SvgText x={cx} y={cy - 4} fontSize={12} fill={t.textDim} textAnchor="middle">
              {keySig?.mode === 'minor' ? 'ii°' : 'vii°'}
            </SvgText>
            <SvgText x={cx} y={cy + 13} fontSize={14} fontWeight="700" fill={t.text} textAnchor="middle">
              {dim}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}
