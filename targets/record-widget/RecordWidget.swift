import SwiftUI
import WidgetKit

/// A static widget: it never needs data, it only opens stanza://record.
struct RecordEntry: TimelineEntry {
  let date: Date
}

struct RecordProvider: TimelineProvider {
  func placeholder(in context: Context) -> RecordEntry { RecordEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (RecordEntry) -> Void) { completion(RecordEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<RecordEntry>) -> Void) {
    completion(Timeline(entries: [RecordEntry(date: .now)], policy: .never))
  }
}

struct RecordWidgetView: View {
  @Environment(\.widgetFamily) var family
  var entry: RecordEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      // lock screen: a round mic button
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "mic.fill").font(.title2)
      }
      .widgetAccentable()
    case .accessoryRectangular:
      HStack(spacing: 8) {
        Image(systemName: "mic.fill").font(.title3)
        Text("Record idea").font(.headline)
      }
      .widgetAccentable()
    case .accessoryInline:
      Label("Record idea", systemImage: "mic.fill")
    default:
      VStack(spacing: 10) {
        ZStack {
          Circle().fill(Color("$accent")).frame(width: 60, height: 60)
          Image(systemName: "mic.fill").font(.system(size: 26, weight: .semibold)).foregroundStyle(.white)
        }
        Text("Record idea").font(.subheadline.weight(.medium))
      }
    }
  }
}

struct RecordWidget: Widget {
  let kind = "StanzaRecordWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: RecordProvider()) { entry in
      RecordWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
        .widgetURL(URL(string: "stanza://record"))
    }
    .configurationDisplayName("Record idea")
    .description("One tap to start recording a song idea.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
