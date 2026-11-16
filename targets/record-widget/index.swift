import SwiftUI
import WidgetKit

@main
struct StanzaWidgets: WidgetBundle {
  var body: some Widget {
    RecordWidget()
    if #available(iOS 18.0, *) {
      RecordControl()
    }
  }
}
