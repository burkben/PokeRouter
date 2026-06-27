import CarPlay

/// Entry point for the CarPlay (template) scene. CarPlay hands us a
/// `CPInterfaceController` to push templates onto and a `CPWindow` to host our
/// own map view. We delegate the real work to `CarPlayController`.
///
/// NOTE: This scene only activates on a head unit when the
/// `com.apple.developer.carplay-maps` entitlement is present (see
/// ios/README.md). The code compiles and links without it.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var controller: CarPlayController?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController,
        to window: CPWindow
    ) {
        controller = CarPlayController(interfaceController: interfaceController, window: window)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        controller = nil
    }
}
