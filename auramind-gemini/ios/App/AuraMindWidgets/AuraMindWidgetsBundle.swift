import SwiftUI
import WidgetKit

/// Everything this extension publishes. Today that is the study session's
/// Live Activity; home-screen widgets will join it here.
@main
struct AuraMindWidgetsBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            StudySessionLiveActivity()
        }
    }
}
