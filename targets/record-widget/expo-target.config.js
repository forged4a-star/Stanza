/** iOS widget extension: home-screen and lock-screen "Record idea" widgets. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'RecordWidget',
  displayName: 'Stanza',
  deploymentTarget: '17.0',
  colors: { $accent: { color: '#d93b3b', darkColor: '#ef5350' }, $widgetBackground: { color: '#ffffff', darkColor: '#1d1d1d' } },
  frameworks: ['SwiftUI', 'WidgetKit'],
};
