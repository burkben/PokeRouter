import Foundation
import UIKit
import MapKit

/// Hands a planned route off to an external navigator. Apple Maps works with no
/// setup; Google Maps and Tesla go through the backend so the link-building and
/// OAuth logic stays in one place (shared with the web app).
@MainActor
enum RouteDelivery {
    /// Open Apple Maps with the full ordered set of stops.
    ///
    /// Apple Maps' multi-stop support via `MKMapItem.openMaps` is best-effort:
    /// it reliably honors the first and last items and will route through
    /// intermediate ones where the installed Maps version allows. For a long
    /// vending-machine crawl this is the "good enough, zero-config" path.
    static func openAppleMaps(plan: PlanResult, originName: String, destinationName: String) {
        var items: [MKMapItem] = []
        items.append(mapItem(plan.origin.coordinate, name: originName))
        for stop in plan.stops.sorted(by: { $0.order < $1.order }) {
            items.append(mapItem(stop.coordinate, name: stop.name))
        }
        items.append(mapItem(plan.destination.coordinate, name: destinationName))

        MKMapItem.openMaps(
            with: items,
            launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving]
        )
    }

    /// Ask the backend to build a Google Maps multi-stop link, then open it
    /// (the Google Maps app if installed, otherwise the web URL).
    static func openGoogleMaps(
        plan: PlanResult,
        originName: String,
        destinationName: String,
        api: PokeRouterAPI
    ) async throws {
        let body = shareBody(plan: plan, originName: originName, destinationName: destinationName)
        let links = try await api.shareLinks(body)
        guard let url = URL(string: links.google) else {
            throw APIError.decoding("Google Maps link was empty.")
        }
        await UIApplication.shared.open(url)
    }

    /// Push the route to a Tesla via the backend Fleet-API bridge.
    static func sendToTesla(
        plan: PlanResult,
        originName: String,
        destinationName: String,
        vehicleTag: String,
        api: PokeRouterAPI
    ) async throws -> TeslaSendResult {
        let stops = plan.stops
            .sorted { $0.order < $1.order }
            .map { NamedLatLng(lat: $0.lat, lng: $0.lng, name: $0.name) }
        let body = TeslaSendBody(
            vehicleTag: vehicleTag,
            origin: NamedLatLng(lat: plan.origin.lat, lng: plan.origin.lng, name: originName),
            destination: NamedLatLng(lat: plan.destination.lat, lng: plan.destination.lng, name: destinationName),
            stops: stops
        )
        return try await api.teslaSend(body)
    }

    // MARK: Helpers

    static func shareBody(plan: PlanResult, originName: String, destinationName: String) -> ShareBody {
        let stops = plan.stops
            .sorted { $0.order < $1.order }
            .map { NamedLatLng(lat: $0.lat, lng: $0.lng, name: $0.name) }
        return ShareBody(
            origin: NamedLatLng(lat: plan.origin.lat, lng: plan.origin.lng, name: originName),
            destination: NamedLatLng(lat: plan.destination.lat, lng: plan.destination.lng, name: destinationName),
            stops: stops,
            name: "PokéRouter trip"
        )
    }

    private static func mapItem(_ coordinate: CLLocationCoordinate2D, name: String) -> MKMapItem {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = name
        return item
    }
}
