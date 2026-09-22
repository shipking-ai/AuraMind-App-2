import ActivityKit
import SwiftUI
import WidgetKit

/**
 The study session on the Lock Screen and in the Dynamic Island.

 It is a mirror, not a control surface: the app owns the queue and the
 scheduling, and this only draws what the session pushes. Tapping it opens
 the review deep link, the same one Siri and the notifications use.
 */
@available(iOS 16.1, *)
struct StudySessionLiveActivity: Widget {

    private static let accent = Color(red: 0.486, green: 0.227, blue: 0.929)  // #7C3AED
    private static let again = Color(red: 0.984, green: 0.443, blue: 0.522)   // #FB7185

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: StudySessionAttributes.self) { context in
            // Lock Screen / banner.
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label(context.attributes.deckTitle, systemImage: "brain.head.profile")
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text("\(context.state.done)/\(context.state.total)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: context.state.fraction)
                    .tint(Self.accent)
                HStack {
                    Text(remainingText(context.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    if context.state.again > 0 {
                        Label("\(context.state.again) to revisit", systemImage: "arrow.uturn.left")
                            .font(.caption)
                            .foregroundStyle(Self.again)
                    }
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.55))
            .activitySystemActionForegroundColor(Self.accent)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.remaining)", systemImage: "rectangle.stack")
                        .font(.title3.monospacedDigit())
                        .foregroundStyle(Self.accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.again > 0 {
                        Label("\(context.state.again)", systemImage: "arrow.uturn.left")
                            .font(.title3.monospacedDigit())
                            .foregroundStyle(Self.again)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.deckTitle)
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.fraction)
                        .tint(Self.accent)
                }
            } compactLeading: {
                Image(systemName: "brain.head.profile")
                    .foregroundStyle(Self.accent)
            } compactTrailing: {
                Text("\(context.state.remaining)")
                    .font(.caption.monospacedDigit())
            } minimal: {
                Text("\(context.state.remaining)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Self.accent)
            }
            .widgetURL(URL(string: "auramind://app/dashboard/study"))
            .keylineTint(Self.accent)
        }
    }

    private func remainingText(_ state: StudySessionAttributes.ContentState) -> String {
        switch state.remaining {
        case 0: return "Session complete"
        case 1: return "1 card left"
        default: return "\(state.remaining) cards left"
        }
    }
}
