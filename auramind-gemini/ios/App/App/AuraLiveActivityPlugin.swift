import ActivityKit
import Capacitor
import Foundation
import os

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

    /**
     Adopts an activity left behind by a previous process.

     `current` is in-memory, so it is empty after iOS relaunches the app —
     which it does whenever the user swipes the app away and opens it again,
     and that is not an app crash. Without adopting, a session that was
     interrupted that way leaves its activity on the Lock Screen showing a
     count frozen at whatever it last received, with no way to update or end
     it, until the user swipes it away.

     ActivityKit keeps ended activities in `activities` briefly, so a session
     that is being torn down right now can still appear here. Adopting it is
     harmless: the next end() dismisses it.
     */
    override public func load() {
        if #available(iOS 16.1, *) {
            Task { @MainActor in
                let existing = Activity<StudySessionAttributes>.activities
                guard !existing.isEmpty else { return }
                #if DEBUG
                Self.ciLog.notice("LIVE_ACTIVITY_ADOPTED count=\(existing.count, privacy: .public)")
                #endif
                // Oldest first, so `current` ends up being the newest session.
                let newest = existing.sorted { $0.id < $1.id }.last
                self.current = newest
            }
        }
    }

    /// CI signal: the simulator log is the only channel back from this
    /// process (WKWebView console never reaches it, and Swift `print` is not
    /// reliably captured either). `os_log` always lands in the log store, so
    /// `mobile-ios.yml` greps for these lines. Release builds are unaffected.
    private static let ciLog = Logger(
        subsystem: "com.auramind.app", category: "LiveActivity")

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
            call.resolve([
                "supported": true,
                "enabled": enabled,
            ])
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_PROBE supported=true enabled=\(enabled, privacy: .public)")
            #endif
        } else {
            call.resolve(["supported": false, "enabled": false])
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_PROBE supported=false")
            #endif
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false])
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_STARTED:false (unsupported or not permitted)")
            #endif
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
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_STARTED:true id=\(activity.id, privacy: .public)")
            #endif
        } catch {
            // Out of activity slots, or the user revoked permission mid-session.
            call.resolve(["started": false])
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_STARTED:false (request threw)")
            #endif
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let activity = current as? Activity<StudySessionAttributes> else {
            call.resolve(["updated": false])
            return
        }
        let next = state(from: call)
        // activity.update is async, so this suspends and resumes on an
        // arbitrary thread. call.resolve reaches the web view, which expects
        // it on the main queue — resolving from here would deliver the reply
        // off-main.
        Task { @MainActor in
            await activity.update(using: next)
            call.resolve(["updated": true])
            #if DEBUG
            Self.ciLog.notice("LIVE_ACTIVITY_UPDATED:true")
            #endif
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
