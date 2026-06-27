import SwiftUI
import MapKit

/// Draws the planned route polyline plus origin, destination, and ordered
/// vending-machine stop markers. iOS 17 `Map` content-builder API.
struct RouteMapView: View {
    let plan: PlanResult?
    let originName: String
    let destinationName: String

    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $camera) {
            if let plan {
                MapPolyline(coordinates: plan.coordinates)
                    .stroke(.blue, lineWidth: 4)

                Marker(originName, systemImage: "location.fill", coordinate: plan.origin.coordinate)
                    .tint(.green)

                ForEach(plan.stops.sorted(by: { $0.order < $1.order })) { stop in
                    Marker("\(stop.order). \(stop.retailer)", systemImage: "cart.fill", coordinate: stop.coordinate)
                        .tint(.red)
                }

                Marker(destinationName, systemImage: "flag.checkered", coordinate: plan.destination.coordinate)
                    .tint(.purple)
            }
        }
        .mapStyle(.standard(elevation: .flat))
        .onChange(of: plan?.routeGeometry.count ?? 0) {
            camera = .automatic
        }
    }
}
