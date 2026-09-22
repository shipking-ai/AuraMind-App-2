import AppIntents
import Capacitor
import Foundation
import UIKit

/**
 Siri and Shortcuts entry points.

 Two things the phone can do that a web app cannot: answer "how many cards are
 due?" without opening anything, and start a review from a voice command, the
 Action button, a Home Screen shortcut or an automation.

 Neither intent schedules or grades anything. The due count is the one the web
 app already published for the widget (Capacitor Preferences, which is
 UserDefaults underneath), because due-ness is an FSRS question TypeScript
 already answers — Swift must never get its own opinion about it. Starting a
 review hands the app the same `auramind://app/dashboard/study` deep link the
 shortcuts and notifications use.
 */

@available(iOS 16.0, *)
enum AuraMindSiri {

    /// Capacitor Preferences stores under UserDefaults with this prefix.
    private static let preferencesPrefix = "CapacitorStorage."
    private static let dueKey = preferencesPrefix + "auramind_widget_due"
    private static let deckKey = preferencesPrefix + "auramind_widget_deck"
    /// Read (and cleared) by the web layer on boot; see src/lib/deepLinks.ts.
    private static let pendingRouteKey = preferencesPrefix + "auramind_pending_route"

    static let reviewURL = URL(string: "auramind://app/dashboard/study")!

    static func dueCount() -> Int {
        Int(UserDefaults.standard.string(forKey: dueKey) ?? "") ?? 0
    }

    static func nextDeck() -> String? {
        let deck = UserDefaults.standard.string(forKey: deckKey)?.trimmingCharacters(in: .whitespaces)
        return (deck?.isEmpty ?? true) ? nil : deck
    }

    /**
     Route the app to the review queue.

     Both halves are needed. The notification covers a warm open, where the
     web layer is already listening for `appUrlOpen`; the stored route covers
     a cold launch, where the intent starts the process and the listener does
     not exist yet. Whichever arrives first clears the other.
     */
    @MainActor
    static func openReview() {
        UserDefaults.standard.set("/dashboard/study", forKey: pendingRouteKey)
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, open: reviewURL, options: [:])
    }

    /// "12 cards due in Neuroscience" — the sentence both intents speak.
    static func dueSentence() -> String {
        let due = dueCount()
        if due == 0 { return "Nothing is due right now. You're all caught up." }
        let cards = due == 1 ? "1 card is due" : "\(due) cards are due"
        if let deck = nextDeck() { return "\(cards), starting with \(deck)." }
        return "\(cards)."
    }
}

/// "Hey Siri, quiz me in AuraMind."
@available(iOS 16.0, *)
struct StartReviewIntent: AppIntent {
    static var title: LocalizedStringResource = "Quiz me"
    static var description = IntentDescription(
        "Start a review session with the cards AuraMind says are due.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        AuraMindSiri.openReview()
        return .result(dialog: IntentDialog(stringLiteral: AuraMindSiri.dueSentence()))
    }
}

/// "Hey Siri, what's due in AuraMind?" — answered without opening the app.
@available(iOS 16.0, *)
struct DueCountIntent: AppIntent {
    static var title: LocalizedStringResource = "Cards due"
    static var description = IntentDescription(
        "Ask how many cards are waiting for review.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<Int> {
        let due = AuraMindSiri.dueCount()
        return .result(
            value: due,
            dialog: IntentDialog(stringLiteral: AuraMindSiri.dueSentence()))
    }
}

/// The phrases Siri accepts, and the entries in the Shortcuts app.
@available(iOS 16.0, *)
struct AuraMindShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartReviewIntent(),
            phrases: [
                "Quiz me in \(.applicationName)",
                "Start a review in \(.applicationName)",
                "Study with \(.applicationName)",
            ],
            shortTitle: "Quiz me",
            systemImageName: "brain.head.profile")
        AppShortcut(
            intent: DueCountIntent(),
            phrases: [
                "What's due in \(.applicationName)",
                "How many cards are due in \(.applicationName)",
            ],
            shortTitle: "Cards due",
            systemImageName: "tray.full")
    }
}
