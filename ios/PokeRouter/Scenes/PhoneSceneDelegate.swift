import UIKit
import SwiftUI

/// Hosts the SwiftUI planner inside the iPhone window scene.
final class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: PlannerView())
        self.window = window
        window.makeKeyAndVisible()
    }
}
