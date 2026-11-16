import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { RecordWidget } from './RecordWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<RecordWidget />);
      break;
    default:
      break;
  }
}
