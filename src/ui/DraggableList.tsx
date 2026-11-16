/**
 * Reorder a short list by dragging a handle. Rows have a fixed height so the
 * maths stays simple and smooth on every platform.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  rowHeight: number;
  renderRow: (item: T, index: number, handle: ReactNode, dragging: boolean) => ReactNode;
  renderHandle: () => ReactNode;
  onMove: (from: number, to: number) => void;
}

/** On web a mouse drag would also select text, which cancels the gesture. */
export const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none', touchAction: 'none', cursor: 'grab' } as object) : null;

export function DraggableList<T>({ items, keyOf, rowHeight, renderRow, renderHandle, onMove }: Props<T>) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const state = useRef({ from: -1, to: -1 });
  const countRef = useRef(items.length);
  countRef.current = items.length;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const responders = useRef(new Map<number, ReturnType<typeof PanResponder.create>>()).current;
  const responderFor = (index: number) => {
    let r = responders.get(index);
    if (r) return r;
    r = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        state.current = { from: index, to: index };
        dy.setValue(0);
        setDrag({ from: index, to: index });
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
      },
      onPanResponderMove: (_, g) => {
        dy.setValue(g.dy);
        const to = Math.max(0, Math.min(countRef.current - 1, state.current.from + Math.round(g.dy / rowHeight)));
        if (to !== state.current.to) {
          state.current.to = to;
          setDrag({ from: state.current.from, to });
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: () => {
        const { from, to } = state.current;
        setDrag(null);
        dy.setValue(0);
        if (from !== to) onMoveRef.current(from, to);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        dy.setValue(0);
      },
    });
    responders.set(index, r);
    return r;
  };

  return (
    <View>
      {items.map((item, i) => {
        let offset = 0;
        if (drag && i !== drag.from) {
          if (drag.from < drag.to && i > drag.from && i <= drag.to) offset = -rowHeight;
          if (drag.from > drag.to && i < drag.from && i >= drag.to) offset = rowHeight;
        }
        const isDragged = drag?.from === i;
        const handle = (
          <View {...responderFor(i).panHandlers} style={[{ alignSelf: 'stretch', justifyContent: 'center' }, NO_SELECT]}>
            {/* renderHandle draws the grip icon */}
            {renderHandle()}
          </View>
        );
        return (
          <Animated.View
            key={keyOf(item)}
            style={{
              ...(NO_SELECT ?? {}),
              height: rowHeight,
              zIndex: isDragged ? 10 : 0,
              transform: [{ translateY: isDragged ? dy : offset }],
              opacity: isDragged ? 0.92 : 1,
            }}
          >
            {renderRow(item, i, handle, isDragged)}
          </Animated.View>
        );
      })}
    </View>
  );
}
