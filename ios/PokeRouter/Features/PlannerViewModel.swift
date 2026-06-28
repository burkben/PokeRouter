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
    @Published var extraMinutes: Double = 15

    // Output
    @Published private(set) var plan: PlanResult?
    @Published private(set) var isPlanning = false
    @Published var errorMessage: String?

    // Tesla
    @Published private(set) var teslaStatus: TeslaStatus?
    @Published private(set) var vehicles: [TeslaVehicle] = []
    @Published var teslaNextIndex: Int = 0
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
            maxAddedDurationSeconds: extraMinutes * 60,
            corridorMeters: nil,
            maxAddedMetersPerStop: nil,
            retailers: nil
        )

        do {
            let result = try await api.plan(request)
            plan = result
            teslaNextIndex = 0
            statusMessage = nil
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

    /// Ordered legs the car will visit: every stop, then the final destination.
    var teslaWaypoints: [(label: String, isStop: Bool)] {
        guard let plan else { return [] }
        let stops = plan.stops
            .sorted { $0.order < $1.order }
            .map { (label: $0.name, isStop: true) }
        return stops + [(label: destination?.title ?? "Destination", isStop: false)]
    }

    func sendToTesla(vehicle: TeslaVehicle, targetIndex: Int) async {
        guard let plan else { return }
        statusMessage = nil
        do {
            let result = try await RouteDelivery.sendToTesla(
                plan: plan,
                originName: originName,
                destinationName: destination?.title ?? "Destination",
                vehicleTag: vehicle.id,
                targetIndex: targetIndex,
                api: api
            )
            guard result.sent else {
                statusMessage = "Tesla did not accept the route."
                return
            }
            let waypoints = teslaWaypoints
            let count = result.waypointCount ?? waypoints.count
            let idx = result.targetIndex ?? targetIndex
            let name = result.targetName
                ?? (waypoints.indices.contains(idx) ? waypoints[idx].label : nil)
            let isFinal = result.isFinal ?? (idx == count - 1)
            let what = isFinal ? "final destination" : "stop \(idx + 1) of \(count)"
            statusMessage = "Sent \(what)\(name.map { " (\($0))" } ?? "") to \(result.vehicle)."
            teslaNextIndex = min(targetIndex + 1, max(waypoints.count - 1, 0))
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
