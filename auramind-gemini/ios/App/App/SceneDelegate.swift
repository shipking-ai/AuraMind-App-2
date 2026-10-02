import UIKit
import Capacitor

/**
 The window and its root view controller come from Main.storyboard, which
 Info.plist names via UISceneStoryboardFile and whose initial view controller
 carries customClass="MainViewController".

 That indirection is load-bearing. MainViewController is where the app-local
 plugins are registered (see MainViewController.swift) — creating a bare
 CAPBridgeViewController here instead discards it, so AuraListen and
 AuraLiveActivity are never registered and both features silently do nothing.
 The web layer cannot tell "plugin absent" from "the OS refused", so neither
 surfaces as an error.

 UIKit assigns the storyboard's window to this property before calling
 willConnectTo, so there is nothing to set up here. The proxy call still
 belongs: it is what forwards a cold-launch deep link (the intent that starts
 the app carries its URL in connectionOptions) to the web layer once the bridge
 is listening.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}