/**
 * Android home-screen / lock-screen widget: one tap opens the app recording.
 * Rendered by react-native-android-widget from JS (no Kotlin needed).
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function RecordWidget() {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'stanza://record' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#1d1d1d', borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
    >
      <FlexWidget style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef5350', alignItems: 'center', justifyContent: 'center' }}>
        <TextWidget text="●" style={{ fontSize: 24, color: '#ffffff' }} />
      </FlexWidget>
      <TextWidget text="Record idea" style={{ fontSize: 14, color: '#ecebe8', marginTop: 8 }} />
    </FlexWidget>
  );
}
