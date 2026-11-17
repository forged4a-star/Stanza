/** Idea of the day on the library screen: a prompt to write from, never lyrics. */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { dayKey, ideaFor } from '../../core/ideas/daily';
import { cardById } from '../../core/lyrics/constraints';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSettings } from '../../store/settings';
import { toast } from '../../ui/Dialogs';
import { Button, Row, Icon } from '../../ui/kit';
import { alpha } from '../../ui/color';
import { font, radius, space, useTheme } from '../../ui/theme';

export function IdeaCard({ onStart }: { onStart: () => void }) {
  const t = useTheme();
  const settings = useSettings();
  const today = dayKey();
  const idea = useMemo(() => ideaFor(), [today]);
  if (!settings.dailyIdea || settings.ideaHiddenDay === today) return null;
  const card = cardById(idea.card);
  return (
    <View
      style={[
        { padding: t.sp(space.lg), borderRadius: t.r.xl, marginBottom: space.md, gap: 8, borderWidth: 1, borderColor: alpha(t.accent, 0.35) },
        ({ backgroundImage: `linear-gradient(135deg, ${alpha(t.accent, 0.2)} 0%, ${alpha(t.accent2, 0.08)} 100%)` } as object),
      ]}
      testID="idea-card"
    >
      <Row>
        <Icon name="sparkles" size={15} color={t.chord} />
        <Text style={{ color: t.chord, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 1 }}>IDEA OF THE DAY</Text>
      </Row>
      <Text style={[{ color: t.text, fontSize: font.body + 3, lineHeight: 26 }, t.fonts.display ? { fontFamily: t.fonts.display } : null]} testID="idea-text">
        {idea.prompt}
      </Text>
      {card && (
        <Text style={{ color: t.textDim, fontSize: font.small + 1 }} testID="idea-card-rule">
          Comes with a card: {card.title}. {card.rule}
        </Text>
      )}
      <Row style={{ flexWrap: 'wrap', marginTop: space.xs }}>
        <Button
          compact
          kind="primary"
          title="Start a song"
          onPress={() => {
            settings.set({ constraint: card ? { id: card.id, scope: 'song' } : null });
            onStart();
          }}
          testID="idea-start"
        />
        <Button
          compact
          title="Save to Inbox"
          onPress={async () => {
            await repo.addIdea(await getDb(), 'text', idea.prompt);
            toast('Saved to Inbox');
          }}
          testID="idea-save"
        />
        <Button compact kind="ghost" title="Not today" onPress={() => settings.set({ ideaHiddenDay: today })} testID="idea-hide" />
      </Row>
    </View>
  );
}
