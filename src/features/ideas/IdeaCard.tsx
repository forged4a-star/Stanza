/** Idea of the day on the library screen: a prompt to write from, never lyrics. */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { dayKey, ideaFor } from '../../core/ideas/daily';
import { cardById } from '../../core/lyrics/constraints';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSettings } from '../../store/settings';
import { toast } from '../../ui/Dialogs';
import { Button, Row } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

export function IdeaCard({ onStart }: { onStart: () => void }) {
  const t = useTheme();
  const settings = useSettings();
  const today = dayKey();
  const idea = useMemo(() => ideaFor(), [today]);
  if (!settings.dailyIdea || settings.ideaHiddenDay === today) return null;
  const card = cardById(idea.card);
  return (
    <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2, marginBottom: space.md, gap: 6 }} testID="idea-card">
      <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8 }}>IDEA OF THE DAY</Text>
      <Text style={{ color: t.text, fontSize: font.body + 1, lineHeight: 23 }} testID="idea-text">
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
