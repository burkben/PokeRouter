import Foundation
import CoreLocation
import MapKit

/// Drives the planner screen: holds the chosen origin/destination, runs the
/// `/plan` request, and exposes the result for the map + delivery actions.
@MainActor
final class PlannerViewModel: ObservableObject {
    // Inputs
    @Published var origin: CLLocationCoordinate2D?
    @Published var originName: String = "Current location"
    @Published var destination: PlaceResult?
    @Published var maxStops: Double = 3
    @Published var corridorMiles: Double = 5

    // Output
    @Published private(set) var plan: PlanResult?
    @Published private(set) var isPlanning = false
    @Published var errorMessage: String?

    // Tesla
    @Published private(set) var teslaStatus: TeslaStatus?
    @Published private(set) var vehicles: [TeslaVehicle] = []
    @Published var statusMessage: String?

    private let api: PokeRouterAPI
    private let store = RouteStore.shared

    init(api: PokeRouterAPI = PokeRouterAPI()) {
        self.api = api
    }

    var canPlan: Bool { origin != nil && destination != nil && !isPlanning }

    func setOrigin(_ coordinate: CLLocationCoordinate2D, name: String = "Current location") {
        origin = coordinate
        originName = name
    }

    func plan() async {
        guard let origin, let destination else { return }
        isPlanning = true
        errorMessage = nil
        defer { isPlanning = false }

        let request = PlanRequest(
            origin: LatLng(origin),
            destination: LatLng(destination.coordinate),
            maxStops: Int(maxStops),
            corridorMeters: corridorMiles * 1609.34,
            maxAddedMetersPerStop: nil,
            retailers: nil
        )

        do {
            let result = try await api.plan(request)
            plan = result
            store.update(plan: result, originName: originName, destinationName: destination.title)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: Delivery

    func openAppleMaps() {
        guard let plan else { return }
        RouteDelivery.openAppleMaps(
            plan: plan,
            originName: originName,
            destinationName: destination?.title ?? "Destination"
        )
    }

    func openGoogleMaps() async {
        guard let plan else { return }
        do {
            try await RouteDelivery.openGoogleMaps(
                plan: plan,
                originName: originName,
                destinationName: destination?.title ?? "Destination",
                api: api
            )
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: Tesla

    func refreshTesla() async {
        do {
            let status = try await api.teslaStatus()
            teslaStatus = status
            if status.connected {
                vehicles = try await api.teslaVehicles()
            }
        } catch {
            // Tesla is optional; a failure here just hides the panel.
            teslaStatus = nil
        }
    }

    func sendToTesla(vehicle: TeslaVehicle) async {
        guard let plan else { return }
        statusMessage = nil
        do {
            let result = try await RouteDelivery.sendToTesla(
                plan: plan,
                originName: originName,
                destinationName: destination?.title ?? "Destination",
                vehicleTag: vehicle.id,
                api: api
            )
            statusMessage = result.sent ? "Sent to \(result.vehicle)." : "Tesla did not accept the route."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
