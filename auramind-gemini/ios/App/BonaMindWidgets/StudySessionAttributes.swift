import ActivityKit
import Foundation

/**
 The shape of a study session as the system sees it.

 Compiled into both the app (which starts and updates the activity) and the
 widget extension (which draws it), so the two can never disagree about the
 payload. `deckTitle` is fixed for the life of the session; everything that
 moves lives in ContentState.
 */
@available(iOS 16.1, *)
struct StudySessionAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Cards graded so far.
        var done: Int
        /// Cards in the session.
        var total: Int
        /// Cards graded Again — the part that is coming back.
        var again: Int

        var remaining: Int { max(0, total - done) }
        var fraction: Double { total > 0 ? min(1, Double(done) / Double(total)) : 0 }
    }

    var deckTitle: String
}
