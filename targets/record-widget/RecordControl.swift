import AppIntents
import SwiftUI
import WidgetKit

/// iOS 18 Control: put "Record idea" on the Lock Screen (bottom buttons),
/// in Control Center or on the Action button. Opens stanza://record.
@available(iOS 18.0, *)
struct RecordControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "StanzaRecordControl") {
      ControlWidgetButton(action: OpenURLIntent(URL(string: "stanza://record")!)) {
        Label("Record idea", systemImage: "mic.fill")
      }
    }
    .displayName("Record idea")
    .description("Opens Stanza and starts recording.")
  }
}
