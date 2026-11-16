import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { sectionDisplayNames } from '../core/model';
import { findLine, useSong } from '../store/song';
import { BottomSheet } from '../ui/BottomSheet';
import { Empty, IconButton, Row, SectionTitle } from '../ui/kit';
import { font, radius, space, TAP, useTheme } from '../ui/theme';
import { addComment, resolveComment, useCollab } from './collab';

export function CommentsSheet({ visible, onClose, lineId }: { visible: boolean; onClose: () => void; lineId: string | null }) {
  const t = useTheme();
  const comments = useCollab((s) => s.comments);
  const peers = useCollab((s) => s.peers);
  const doc = useSong((s) => s.doc);
  const [text, setText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  if (!doc) return null;
  const names = sectionDisplayNames(doc.sections);
  const at = lineId ? findLine(doc, lineId) : null;
  const where = (id: string | null) => {
    if (!id) return 'Whole song';
    const a = findLine(doc, id);
    return a ? `${names[a.s]}: “${a.line.text.slice(0, 40)}”` : 'A line that was removed';
  };
  const list = comments.filter((c) => showResolved || !c.resolved).sort((a, b) => a.createdAt - b.createdAt);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Comments" height={0.7} testID="comments-sheet">
      <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg }}>Here now: {peers.map((p) => p.name).join(', ') || 'just you'}</Text>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}>
        {list.length === 0 && <Empty icon="chatbubble-ellipses-outline" title="No comments yet" />}
        {list.map((c) => (
          <View key={c.id} style={{ marginBottom: space.md, opacity: c.resolved ? 0.5 : 1 }} testID={`comment-${c.id}`}>
            <Text style={{ color: t.textDim, fontSize: font.tiny }}>{where(c.lineId)}</Text>
            <Row style={{ alignItems: 'flex-start' }}>
              <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{c.author}: </Text>
                {c.text}
              </Text>
              <IconButton icon={c.resolved ? 'arrow-undo-outline' : 'checkmark'} label={c.resolved ? 'Reopen' : 'Resolve'} size={18} onPress={() => resolveComment(c.id, !c.resolved)} />
            </Row>
          </View>
        ))}
        <Pressable onPress={() => setShowResolved(!showResolved)}>
          <Text style={{ color: t.accent, fontSize: font.small }}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
        </Pressable>
      </ScrollView>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <SectionTitle>{at ? `On ${names[at.s]}, line ${at.l + 1}` : 'On the whole song'}</SectionTitle>
        <Row>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment"
            placeholderTextColor={t.textFaint}
            style={{ flex: 1, minHeight: TAP, color: t.text, backgroundColor: t.surface2, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.body }}
            testID="comment-input"
            onSubmitEditing={() => {
              if (text.trim()) addComment(text.trim(), lineId);
              setText('');
            }}
          />
          <IconButton
            icon="send"
            label="Send comment"
            onPress={() => {
              if (text.trim()) addComment(text.trim(), lineId);
              setText('');
            }}
            testID="comment-send"
          />
        </Row>
      </View>
    </BottomSheet>
  );
}
