/**
 * Look & feel: pick a look, then make it yours. A live preview stays at the top
 * so every change is seen as it is made.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fromHsl, isHex, toHsl } from '../ui/color';
import { FONT_FAMILIES, FONT_ORDER, type FontKey } from '../ui/fontFamilies';
import { ACCENT_SWATCHES, LOOKS, lookById, type Look } from '../ui/looks';
import { decodeLook, encodeLook } from '../ui/lookCode';
import { LINE_SPACING, LYRIC_SIZE, resolveTheme } from '../ui/themeEngine';
import { useSettings } from '../store/settings';
import { askText, toast } from '../ui/Dialogs';
import { alpha } from '../ui/color';
import { Button, Field, IconButton, Icon, Row, SectionTitle, Segmented, Slider, Toggle, cardStyle, pageStyle } from '../ui/kit';
import { displayText, font, space, TAP, useIsDark, useTheme } from '../ui/theme';

const fx = (o: object) => o as object;

export default function Appearance() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const dark = useIsDark();
  const base = lookById(s.look);
  const c = s.custom;
  const hasTweaks = Object.keys(c).length > 0;

  const radius = c.radius ?? base.radius;
  const lyricSize = c.lyricSize ?? LYRIC_SIZE.default;
  const spacing = c.lineSpacing ?? LINE_SPACING.default;
  const hue = toHsl(t.accent)[0] / 360;

  const [hex, setHex] = useState(t.accent);
  useEffect(() => setHex(t.accent), [t.accent]);

  const shareLook = async () => {
    const code = encodeLook(s.look, s.theme, c);
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(code);
        toast('Look code copied. Paste it in a message.');
      } else await Share.share({ message: code });
    } catch {
      await askText('Copy this look code', code, { ok: 'Done' });
    }
  };
  const importLook = async () => {
    const text = await askText('Paste a look code', '', { placeholder: 'stanza-look/1/…', ok: 'Use it' });
    if (text === null) return;
    const r = decodeLook(text);
    if (!r.ok) return toast(r.error);
    s.set({ look: r.look, custom: r.custom, theme: r.mode });
    toast(`Switched to ${lookById(r.look).name}`);
  };

  return (
    <View style={[pageStyle(t), { paddingTop: insets.top }]}>
      <Row style={{ minHeight: TAP + 8, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="appearance-back" />
        <View style={{ flex: 1 }}>
          <Text style={[{ color: t.text }, displayText(t, 24)]} accessibilityRole="header">
            Look & feel
          </Text>
        </View>
        <Button compact kind="ghost" title="Reset" disabled={!hasTweaks} onPress={() => s.resetCustom()} testID="appearance-reset" />
      </Row>

      <Preview />

      <ScrollView contentContainerStyle={{ paddingBottom: 80 + insets.bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" testID="appearance-scroll">
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionTitle>Look</SectionTitle>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingVertical: 4 }} testID="look-gallery">
          {LOOKS.map((l) => (
            <LookTile key={l.id} look={l} dark={dark} selected={l.id === s.look} onPress={() => s.chooseLook(l.id)} />
          ))}
        </ScrollView>
        <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg, marginTop: space.xs }} testID="look-blurb">
          {base.blurb}
        </Text>

        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <SectionTitle>Light or dark</SectionTitle>
          <Segmented
            value={s.theme}
            onChange={(v) => s.set({ theme: v })}
            options={[
              { value: 'system', label: 'Follow phone' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            testID="appearance-mode"
          />

          <SectionTitle>Accent colour</SectionTitle>
          <Row style={{ flexWrap: 'wrap', gap: 10 }}>
            <Swatch color={resolveTheme(s.look, dark, { ...c, accent: undefined }).accent} label="Look's own colour" selected={!c.accent} onPress={() => s.setCustom({ accent: undefined })} testID="accent-look" own />
            {ACCENT_SWATCHES.map((a) => (
              <Swatch key={a} color={a} label={`Accent ${a}`} selected={c.accent === a} onPress={() => s.setCustom({ accent: a })} testID={`accent-${a.slice(1)}`} />
            ))}
          </Row>
          <Slider value={hue} onChange={(v) => s.setCustom({ accent: fromHsl(v * 360, 0.82, dark ? 0.64 : 0.46) })} label="Accent hue" rainbow testID="accent-hue" />
          <Field
            label="Or type a colour"
            value={hex}
            onChangeText={setHex}
            onBlur={() => (isHex(hex) ? s.setCustom({ accent: hex.startsWith('#') ? hex : '#' + hex }) : setHex(t.accent))}
            onSubmitEditing={() => isHex(hex) && s.setCustom({ accent: hex.startsWith('#') ? hex : '#' + hex })}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={7}
            testID="accent-hex"
          />

          <SectionTitle>Shape and space</SectionTitle>
          <LabelRow label="Roundness" value={radius < 0.2 ? 'Sharp' : radius < 0.55 ? 'Soft' : radius < 0.8 ? 'Round' : 'Very round'} />
          <Slider value={radius} onChange={(v) => s.setCustom({ radius: Math.round(v * 20) / 20 })} label="Corner roundness" testID="radius-slider" />
          <Segmented
            value={t.density}
            onChange={(v) => s.setCustom({ density: v })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'roomy', label: 'Roomy' },
            ]}
            testID="density"
          />

          <SectionTitle>Lyric typeface</SectionTitle>
          <FontPicker value={c.lyricFont ?? base.lyricFont} onPick={(k) => s.setCustom({ lyricFont: k })} testPrefix="font-lyric" sample="I walked along the river" />
          <LabelRow label="Size" value={`${lyricSize}`} />
          <Slider value={(lyricSize - LYRIC_SIZE.min) / (LYRIC_SIZE.max - LYRIC_SIZE.min)} onChange={(v) => s.setCustom({ lyricSize: Math.round(LYRIC_SIZE.min + v * (LYRIC_SIZE.max - LYRIC_SIZE.min)) })} label="Lyric size" testID="lyric-size" />
          <LabelRow label="Line spacing" value={`${spacing.toFixed(2)}×`} />
          <Slider value={(spacing - LINE_SPACING.min) / (LINE_SPACING.max - LINE_SPACING.min)} onChange={(v) => s.setCustom({ lineSpacing: Math.round((LINE_SPACING.min + v * (LINE_SPACING.max - LINE_SPACING.min)) * 20) / 20 })} label="Line spacing" testID="line-spacing" />

          <SectionTitle>Heading typeface</SectionTitle>
          <FontPicker value={c.displayFont ?? base.displayFont} onPick={(k) => s.setCustom({ displayFont: k })} testPrefix="font-display" sample="Your songs" bold />

          <SectionTitle>Background</SectionTitle>
          <Segmented
            value={t.bgStyle}
            onChange={(v) => s.setCustom({ bgStyle: v })}
            options={[
              { value: 'glow', label: 'Soft glow' },
              { value: 'solid', label: 'Plain' },
            ]}
            testID="bg-style"
          />
          <View style={{ height: space.sm }} />
          <Segmented
            value={t.surfaceStyle}
            onChange={(v) => s.setCustom({ surfaceStyle: v })}
            options={[
              { value: 'soft', label: 'Soft cards' },
              { value: 'flat', label: 'Flat' },
              { value: 'outline', label: 'Outlined' },
            ]}
            testID="surface-style"
          />

          <SectionTitle>Rhyme highlight colours</SectionTitle>
          <Segmented
            value={s.palette}
            onChange={(v) => s.set({ palette: v })}
            options={[
              { value: 'calm', label: 'Calm' },
              { value: 'vivid', label: 'Vivid' },
              { value: 'colorblind', label: 'Colour-blind safe' },
            ]}
            testID="appearance-palette"
          />

          <SectionTitle>Share your look</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button compact icon="share-outline" title="Share as a code" onPress={() => void shareLook()} testID="look-share" />
            <Button compact icon="download-outline" title="Use someone's code" onPress={() => void importLook()} testID="look-import" />
          </Row>
        </View>
      </ScrollView>
    </View>
  );
}

/** A small page that shows the current look: heading, lyrics with a highlight, and the controls. */
function Preview() {
  const t = useTheme();
  const ly = { fontFamily: t.lyric.fontFamily, fontSize: t.lyric.fontSize, lineHeight: t.lyric.lineHeight };
  return (
    <View style={[cardStyle(t), { marginHorizontal: space.lg, marginBottom: space.sm, padding: t.sp(space.md), borderRadius: t.r.xl }]} testID="look-preview">
      <Row>
        <Text style={[{ color: t.text, flex: 1 }, displayText(t, 20)]} numberOfLines={1} testID="preview-title">
          Rivers in Winter
        </Text>
        <View style={{ backgroundColor: alpha(t.accent, 0.14), borderRadius: t.r.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: t.chord, fontSize: font.small - 1, fontWeight: '700', letterSpacing: 0.9 }}>VERSE</Text>
        </View>
      </Row>
      <Text style={[ly, { color: t.text, marginTop: 4 }]} numberOfLines={1} testID="preview-lyric">
        Down by the river, in the <Text style={{ backgroundColor: t.palette[0], borderRadius: 3 }}>rain</Text>
      </Text>
      <Text style={{ color: t.chord, fontWeight: '700', fontSize: font.small, marginTop: 2 }}>Am     F     C</Text>
      <Row style={{ marginTop: t.sp(space.sm) }}>
        <Pressable style={[{ borderRadius: t.r.md, paddingHorizontal: t.sp(16), minHeight: t.sp(36), alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }, fx({ backgroundImage: t.gradient, boxShadow: t.shadow.glow })]} accessibilityRole="button" accessibilityLabel="Sample button" testID="preview-record">
          <Text style={{ color: t.accentText, fontWeight: '700' }}>Record</Text>
        </Pressable>
        <View style={{ borderRadius: t.r.pill, borderWidth: 1, borderColor: alpha(t.accent, 0.7), backgroundColor: alpha(t.accent, 0.15), paddingHorizontal: 12, minHeight: t.sp(32), justifyContent: 'center' }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: font.small + 1 }}>Chip</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Toggle value />
      </Row>
    </View>
  );
}

function LookTile({ look, dark, selected, onPress }: { look: Look; dark: boolean; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const tt = resolveTheme(look.id, dark);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${look.name} look`}
      testID={`look-${look.id}`}
      style={[
        { width: 148, borderRadius: tt.r.lg + 2, padding: 10, gap: 8, backgroundColor: tt.bg, borderWidth: selected ? 2 : 1, borderColor: selected ? t.accent : tt.border },
        tt.pageGradient ? fx({ backgroundImage: tt.pageGradient }) : null,
        selected ? fx({ boxShadow: t.shadow.glow }) : null,
      ]}
    >
      <Text style={[{ color: tt.text }, displayText(tt, 18)]}>{look.name}</Text>
      <View style={{ backgroundColor: tt.surface, borderRadius: tt.r.md, borderWidth: 1, borderColor: tt.border, padding: 8, gap: 5 }}>
        <Text style={{ color: tt.text, fontSize: 12, fontFamily: tt.lyric.fontFamily }} numberOfLines={1}>
          I walked along
        </Text>
        <View style={{ height: 5, width: '55%', borderRadius: 3, backgroundColor: tt.border }} />
      </View>
      <View style={[{ height: 26, borderRadius: tt.r.md, alignItems: 'center', justifyContent: 'center', backgroundColor: tt.accent }, fx({ backgroundImage: tt.gradient })]}>
        <Text style={{ color: tt.accentText, fontWeight: '700', fontSize: 12 }}>Aa</Text>
      </View>
      {selected && (
        <View style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark" size={14} color={t.accentText} />
        </View>
      )}
    </Pressable>
  );
}

function Swatch({ color, label, selected, onPress, testID, own }: { color: string; label: string; selected: boolean; onPress: () => void; testID: string; own?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} testID={testID} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? t.text : 'transparent' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, borderWidth: own ? 2 : 0, borderColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
        {own && <Icon name="sparkles" size={13} color={alpha('#000000', 0.55)} />}
      </View>
    </Pressable>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
      <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
      <Text style={{ color: t.textDim, fontSize: font.body }}>{value}</Text>
    </Row>
  );
}

/** Each choice is drawn in its own typeface, so you pick by looking. */
function FontPicker({ value, onPick, testPrefix, sample, bold }: { value: FontKey; onPick: (k: FontKey) => void; testPrefix: string; sample: string; bold?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {FONT_ORDER.map((k) => {
        const f = FONT_FAMILIES[k];
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onPick(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${f.label} typeface`}
            testID={`${testPrefix}-${k}`}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.r.md, borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? alpha(t.accent, 0.12) : 'transparent', minWidth: 96 }}
          >
            <Text style={{ color: t.text, fontFamily: bold ? f.bold : f.regular, fontSize: 17 * (f.scale > 1 ? 1.1 : 1), fontWeight: f.regular ? 'normal' : bold ? '700' : '400' }} numberOfLines={1}>
              {sample.split(' ').slice(0, 2).join(' ')}
            </Text>
            <Text style={{ color: t.textDim, fontSize: font.tiny + 1, marginTop: 1 }}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
