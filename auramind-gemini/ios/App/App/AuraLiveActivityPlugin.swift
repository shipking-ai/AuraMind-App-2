import ActivityKit
import Capacitor
import Foundation

/**
 AuraLiveActivity — the study session on the Lock Screen and in the Dynamic
 Island, through ActivityKit.

 The extension draws it (AuraMindWidgets/StudySessionLiveActivity.swift); this
 side only starts, moves and ends it. It is a mirror of session state: nothing
 here schedules or grades a card, and a failure to show an activity must never
 disturb a session, so every method resolves rather than rejecting.

 Live Activities need iOS 16.1, the user's permission (Settings › AuraMind ›
 Live Activities, which `areActivitiesEnabled` reports), and a session that is
 actually open — the system ends orphaned activities, but ending ours in
 `end()` is what keeps the Island honest.
 */
@objc(AuraLiveActivityPlugin)
public class AuraLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "AuraLiveActivityPlugin"
    public let jsName = "AuraLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// The session currently on screen, if any.
    private var current: Any?

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve([
                "supported": true,
                "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
            ])
        } else {
            call.resolve(["supported": false, "enabled": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false])
            return
        }
        // Starting twice would leave the first activity stranded on the Lock
        // Screen with a frozen count.
        endCurrent()
        let attributes = StudySessionAttributes(
            deckTitle: call.getString("deckTitle") ?? "Study session")
        do {
            let activity = try Activity.request(
                attributes: attributes,
                contentState: state(from: call),
                pushType: nil)
            current = activity
            call.resolve(["started": true, "id": activity.id])
        } catch {
            // Out of activity slots, or the user revoked permission mid-session.
            call.resolve(["started": false])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let activity = current as? Activity<StudySessionAttributes> else {
            call.resolve(["updated": false])
            return
        }
        let next = state(from: call)
        Task {
            await activity.update(using: next)
            call.resolve(["updated": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        endCurrent()
        call.resolve()
    }

    private func endCurrent() {
        guard #available(iOS 16.1, *),
              let activity = current as? Activity<StudySessionAttributes> else { return }
        current = nil
        Task { await activity.end(dismissalPolicy: .immediate) }
    }

    @available(iOS 16.1, *)
    private func state(from call: CAPPluginCall) -> StudySessionAttributes.ContentState {
        let total = max(1, call.getInt("total") ?? 1)
        let done = min(max(0, call.getInt("done") ?? 0), total)
        let again = min(max(0, call.getInt("again") ?? 0), done)
        return StudySessionAttributes.ContentState(done: done, total: total, again: again)
    }
}
