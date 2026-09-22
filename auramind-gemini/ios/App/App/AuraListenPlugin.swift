import AVFoundation
import Capacitor
import Foundation
import Speech

/// AuraListen — native speech recognition for voice study on iOS.
///
/// WKWebView exposes `webkitSpeechRecognition` but it never delivers results
/// (WebKit bug 239816), so spoken answers would silently fail in the iOS app.
/// This wraps SFSpeechRecognizer and reports the same events as the Android
/// plugin (android/.../AuraListenPlugin.java): start, partial, final, level,
/// error and end, each tagged with the session passed to start(), in Web
/// Speech API vocabulary. src/services/voice/nativeRecognition.ts turns them
/// into a browser-shaped recogniser for useVoiceStudy.
///
/// Android's recogniser ends by itself after a pause; SFSpeechRecognizer keeps
/// listening until told to stop, so a silence timer ends the utterance to
/// behave the same way.
@objc(AuraListenPlugin)
public class AuraListenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuraListenPlugin"
    public let jsName = "AuraListen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abort", returnType: CAPPluginReturnPromise)
    ]

    /// Pause after the last recognised words that ends the utterance.
    private let endOfSpeechSilence: TimeInterval = 1.6
    /// How long to wait for any speech at all before reporting no-speech.
    private let noSpeechTimeout: TimeInterval = 8.0

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var session = ""
    private var heardText = ""
    private var finalSent = false
    private var active = false
    private var silenceTimer: Timer?
    private var lastLevelAt: TimeInterval = 0

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Leaving the app releases the microphone rather than listening in the background.
    @objc private func appWillResignActive() {
        DispatchQueue.main.async { self.endSession(announce: true) }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))?.isAvailable ?? false
        call.resolve(["available": available])
    }

    @objc func start(_ call: CAPPluginCall) {
        let nextSession = call.getString("session") ?? ""
        let lang = call.getString("lang") ?? "en-US"
        let partial = call.getBool("interimResults") ?? true

        requestPermissions { granted in
            guard granted else {
                call.reject("Microphone or speech recognition permission denied", "not-allowed")
                return
            }
            DispatchQueue.main.async {
                self.begin(call, session: nextSession, lang: lang, partial: partial)
            }
        }
    }

    /// Stop and deliver what was heard (like SpeechRecognition.stop()).
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishListening()
            call.resolve()
        }
    }

    /// Stop and discard (like SpeechRecognition.abort()).
    @objc func abort(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endSession(announce: true)
            call.resolve()
        }
    }

    // MARK: - Permissions

    private func requestPermissions(_ done: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done(false)
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                done(granted)
            }
        }
    }

    // MARK: - Session

    private func begin(_ call: CAPPluginCall, session nextSession: String, lang: String, partial: Bool) {
        // A new session replaces the old one, which is told it ended.
        endSession(announce: true)

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) else {
            call.reject("Speech recognition does not support \(lang)", "language-not-supported")
            return
        }
        guard recognizer.isAvailable else {
            call.reject("Speech recognition is not available right now", "unavailable")
            return
        }

        session = nextSession
        heardText = ""
        finalSent = false
        self.recognizer = recognizer

        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Could not open the microphone", "audio-capture")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = partial
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            restoreAudioSession()
            call.reject("No microphone input is available", "audio-capture")
            return
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
            self?.reportLevel(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            input.removeTap(onBus: 0)
            restoreAudioSession()
            call.reject("Could not start listening", "audio-capture")
            return
        }

        active = true
        let mine = nextSession
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self = self, self.active, self.session == mine else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    if !text.isEmpty { self.heardText = text }
                    if result.isFinal {
                        self.deliverFinal()
                        self.endSession(announce: false)
                        return
                    }
                    if !text.isEmpty {
                        self.emit("partial", ["text": text])
                        self.armSilenceTimer(self.endOfSpeechSilence)
                    }
                }
                if error != nil {
                    if self.heardText.isEmpty {
                        self.emit("error", ["error": "no-speech"])
                    } else {
                        self.deliverFinal()
                    }
                    self.endSession(announce: false)
                }
            }
        }

        emit("start", [:])
        armSilenceTimer(noSpeechTimeout)
        call.resolve()
    }

    /// Ends the audio and lets the recogniser deliver its final result.
    private func finishListening() {
        guard active else { return }
        silenceTimer?.invalidate()
        silenceTimer = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        // If the recogniser never answers, close out with what was heard.
        let mine = session
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self, self.active, self.session == mine else { return }
            if self.heardText.isEmpty {
                self.emit("error", ["error": "no-speech"])
            } else {
                self.deliverFinal()
            }
            self.endSession(announce: false)
        }
    }

    private func armSilenceTimer(_ interval: TimeInterval) {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            self?.finishListening()
        }
    }

    private func deliverFinal() {
        guard !finalSent else { return }
        finalSent = true
        if !heardText.isEmpty {
            emit("final", ["text": heardText])
        }
    }

    /// Tears everything down; announces "aborted" first when asked, and
    /// always announces "end" for a session that was running.
    private func endSession(announce: Bool) {
        guard active else { return }
        active = false
        silenceTimer?.invalidate()
        silenceTimer = nil
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        task?.cancel()
        task = nil
        request = nil
        recognizer = nil
        restoreAudioSession()
        if announce {
            emit("error", ["error": "aborted"])
        }
        emit("end", [:])
    }

    /// Back to playback so read-aloud is audible again after listening.
    private func restoreAudioSession() {
        let audio = AVAudioSession.sharedInstance()
        try? audio.setActive(false, options: .notifyOthersOnDeactivation)
        try? audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    }

    // MARK: - Events

    private func reportLevel(_ buffer: AVAudioPCMBuffer) {
        guard let samples = buffer.floatChannelData?[0] else { return }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return }
        var sum: Float = 0
        for i in 0..<count {
            sum += samples[i] * samples[i]
        }
        let rms = sqrt(sum / Float(count))
        let db = 20 * log10(max(rms, 0.000_001))
        // -50 dB (quiet room) … -10 dB (speaking close to the mic) → 0 … 1
        let level = min(1, max(0, (db + 50) / 40))

        let now = Date().timeIntervalSince1970
        guard now - lastLevelAt >= 0.1 else { return }
        lastLevelAt = now
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.active else { return }
            self.emit("level", ["level": Double(level)])
        }
    }

    private func emit(_ event: String, _ data: [String: Any]) {
        var payload = data
        payload["session"] = session
        notifyListeners(event, data: payload)
    }
}
