/**
 * Word tools, all offline: rhymes (perfect / near / multisyllabic), thesaurus,
 * dictionary and related words, filtered by syllable count and stress.
 * Picking a word only ever swaps it in where you asked; nothing is written
 * for you.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { toIpa } from '../../core/phonetics/arpabet';
import { multiRhymes, nearRhymes, perfectRhymes, relatedWords, senses, synonyms, type WordHit } from '../../core/phonetics/lookup';
import { countSyllables, pronounce, stressPattern } from '../../core/phonetics/pronounce';
import { useSong, findLine } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { choose, toast } from '../../ui/Dialogs';
import { Chip, Empty, Icon, Row, SectionTitle, Segmented } from '../../ui/kit';
import { font, radius, space, TAP, useTheme } from '../../ui/theme';

type Tab = 'rhymes' | 'synonyms' | 'meaning' | 'related';
type RhymeKind = 'perfect' | 'near' | 'multi';

export interface WordTarget {
  word: string;
  /** the line the word came from, so a pick can replace it there */
  lineId?: string | null;
}

const stressLabel = (p: string) =>
  p
    .split('')
    .map((d) => (d === '0' ? '·' : '●'))
    .join('');

export function WordSheet({ target, onClose }: { target: WordTarget | null; onClose: () => void }) {
  const t = useTheme();
  const [word, setWord] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('rhymes');
  const [kind, setKind] = useState<RhymeKind>('perfect');
  const [syl, setSyl] = useState<number | null>(null);
  const [stress, setStress] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setWord(target.word);
      setQuery(target.word);
      setSyl(null);
      setStress(null);
    }
  }, [target]);

  // a new word starts with no filters
  useEffect(() => {
    setSyl(null);
    setStress(null);
  }, [word, tab, kind]);

  const results: WordHit[] = useMemo(() => {
    if (!word) return [];
    if (tab === 'rhymes') return kind === 'perfect' ? perfectRhymes(word) : kind === 'near' ? nearRhymes(word) : multiRhymes(word);
    if (tab === 'synonyms') return synonyms(word, { limit: 300 });
    if (tab === 'related') return relatedWords(word, { limit: 300 });
    return [];
  }, [word, tab, kind]);

  const sylCounts = useMemo(() => [...new Set(results.map((r) => r.syllables))].sort((a, b) => a - b), [results]);
  const stressPatterns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) if (!syl || r.syllables === syl) counts.set(r.stress.replace(/2/g, '1'), (counts.get(r.stress.replace(/2/g, '1')) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p]) => p);
  }, [results, syl]);
  const shown = results.filter((r) => (!syl || r.syllables === syl) && (!stress || r.stress.replace(/2/g, '1') === stress));
  const meaning = useMemo(() => (word && tab === 'meaning' ? senses(word) : null), [word, tab]);
  const pron = word ? pronounce(word) : null;

  const pick = async (w: string) => {
    const lineId = target?.lineId;
    const st = useSong.getState();
    const at = lineId && st.doc ? findLine(st.doc, lineId) : null;
    const v = await choose(w, [
      ...(at && !at.line.locked && at.line.text.toLowerCase().includes(target!.word.toLowerCase()) ? [{ label: `Use instead of “${target!.word}”`, value: 'replace' }] : []),
      { label: `Look up “${w}”`, value: 'lookup' },
      { label: 'Save to Inbox', value: 'inbox' },
    ]);
    if (v === 'replace' && at) {
      const re = new RegExp(`\\b${target!.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const next = at.line.text.replace(re, (m) => (m[0] === m[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w));
      st.setLineText(at.line.id, next);
      toast('Swapped in');
      onClose();
    } else if (v === 'lookup') {
      setWord(w);
      setQuery(w);
      setSyl(null);
      setStress(null);
    } else if (v === 'inbox') {
      const { getDb } = await import('../../db/client');
      const repo = await import('../../db/repo');
      await repo.addIdea(await getDb(), 'text', w);
      toast('Saved to Inbox');
    }
  };

  return (
    <BottomSheet visible={!!target} onClose={onClose} title="Words" height={0.78} light testID="word-sheet">
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Row style={[styles.search, { backgroundColor: t.surface2 }]}>
          <Icon name="search" size={18} color={t.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setWord(query.trim().toLowerCase())}
            onBlur={() => setWord(query.trim().toLowerCase())}
            placeholder="Any word"
            placeholderTextColor={t.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: t.text, fontSize: font.body + 1, minHeight: TAP }}
            testID="word-input"
          />
        </Row>
        {pron && pron.prons[0] && (
          <Text style={{ color: t.textDim, fontSize: font.small }} testID="word-pron">
            /{toIpa(pron.prons[0])}/ · {countSyllables(pron.prons[0])} {countSyllables(pron.prons[0]) === 1 ? 'syllable' : 'syllables'} · {stressLabel(stressPattern(pron.prons[0]))}
            {pron.source === 'guess' ? ' · guessed' : ''}
          </Text>
        )}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rhymes', label: 'Rhymes' },
            { value: 'synonyms', label: 'Similar' },
            { value: 'meaning', label: 'Meaning' },
            { value: 'related', label: 'Related' },
          ]}
          testID="word-tabs"
        />
        {tab === 'rhymes' && (
          <Row>
            {(['perfect', 'near', 'multi'] as RhymeKind[]).map((k) => (
              <Chip key={k} label={k === 'perfect' ? 'Perfect' : k === 'near' ? 'Near' : 'Multi'} selected={kind === k} onPress={() => setKind(k)} testID={`rhyme-${k}`} />
            ))}
          </Row>
        )}
        {tab !== 'meaning' && results.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="Any length" selected={!syl} onPress={() => (setSyl(null), setStress(null))} />
            {sylCounts.map((n) => (
              <Chip key={n} label={`${n} syl`} selected={syl === n} onPress={() => (setSyl(n), setStress(null))} testID={`syl-${n}`} />
            ))}
            {stressPatterns.length > 1 &&
              stressPatterns.map((p) => <Chip key={p} label={stressLabel(p)} selected={stress === p} onPress={() => setStress(stress === p ? null : p)} />)}
          </ScrollView>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {tab === 'meaning' ? (
          meaning ? (
            meaning.senses.map((s, i) => (
              <View key={i} style={{ marginBottom: space.md }} testID={`sense-${i}`}>
                <Text style={{ color: t.textDim, fontSize: font.small, fontStyle: 'italic' }}>{s.pos}</Text>
                <Text style={{ color: t.text, fontSize: font.body }}>{s.definition}</Text>
                {s.synonyms.length > 0 && <Text style={{ color: t.textDim, fontSize: font.small, marginTop: 2 }}>also: {s.synonyms.join(', ')}</Text>}
                {s.antonyms.length > 0 && <Text style={{ color: t.textDim, fontSize: font.small }}>opposite: {s.antonyms.join(', ')}</Text>}
              </View>
            ))
          ) : (
            <Empty icon="book-outline" title={word ? `No dictionary entry for “${word}”` : 'Type a word'} />
          )
        ) : shown.length === 0 ? (
          <Empty icon="search" title={word ? 'Nothing found' : 'Type a word'} hint={tab === 'rhymes' && kind === 'perfect' ? 'Try Near or Multi.' : undefined} />
        ) : (
          <>
            <SectionTitle>{shown.length} words</SectionTitle>
            <View style={styles.cloud} testID="word-results">
              {shown.slice(0, 240).map((r) => (
                <Pressable
                  key={r.word}
                  onPress={() => pick(r.word)}
                  style={({ pressed }) => [styles.result, { backgroundColor: t.surface2, opacity: pressed ? 0.6 : r.score < 0.8 ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.word}, ${r.syllables} syllables`}
                >
                  <Text style={{ color: t.text, fontSize: font.body, fontWeight: r.freq >= 6 ? '600' : '400' }}>{r.word}</Text>
                  <Text style={{ color: t.textFaint, fontSize: 10 }}>{stressLabel(r.stress)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: radius.md, paddingLeft: space.md },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  result: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
