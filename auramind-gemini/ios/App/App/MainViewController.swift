import Capacitor
import UIKit

/// The app's web view controller. App-local plugins (the ones that live in
/// this project rather than in an npm package) are registered here; npm
/// plugins are found automatically.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuraListenPlugin())
    }
}
