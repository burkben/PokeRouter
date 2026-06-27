import Foundation
import CoreLocation

/// Small `CLLocationManager` wrapper that publishes the latest fix and the
/// current authorization state for SwiftUI. Requests "when in use" permission
/// on demand and serves a one-shot location to seed the route origin.
@MainActor
final class LocationProvider: NSObject, ObservableObject {
    @Published var authorization: CLAuthorizationStatus
    @Published var lastLocation: CLLocation?
    @Published var errorMessage: String?

    private let manager = CLLocationManager()

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// True once the user has granted "when in use" (or "always") access.
    var isAuthorized: Bool {
        authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }

    func requestPermission() {
        manager.requestWhenInUseAuthorization()
    }

    /// Ask for permission if needed, then start updates so a fix arrives.
    func start() {
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            errorMessage = "Location access is off. Enable it in Settings to start routes from where you are."
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }
}

extension LocationProvider: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                manager.startUpdatingLocation()
                self.errorMessage = nil
            } else if status == .denied || status == .restricted {
                self.errorMessage = "Location access was denied. Enable it in Settings to use your current location."
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            self.lastLocation = location
            self.errorMessage = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            // A transient "unknown location" is common right after startup; ignore it.
            if (error as? CLError)?.code == .locationUnknown { return }
            self.errorMessage = error.localizedDescription
        }
    }
}
