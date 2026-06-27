import UIKit

/// UIKit application lifecycle. We use a UIKit `@main` entry point (rather than
/// the SwiftUI `App` lifecycle) because it gives us precise, reliable control
/// over multi-scene configuration — specifically routing the CarPlay template
/// scene to its own delegate alongside the normal phone window scene.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // The scene manifest in Info.plist already maps each role to its
        // delegate class; we just echo the role-appropriate configuration name.
        if connectingSceneSession.role == .carTemplateApplication {
            return UISceneConfiguration(name: "CarPlay", sessionRole: connectingSceneSession.role)
        }
        return UISceneConfiguration(name: "Phone", sessionRole: connectingSceneSession.role)
    }
}
