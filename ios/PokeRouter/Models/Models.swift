import Foundation
import CoreLocation

// Codable models mirroring the PokeRouter backend (see backend/src/planner/types.ts
// and web/src/types.ts). All metric fields are decoded as Double; counts as Int.

struct LatLng: Codable, Hashable {
    var lat: Double
    var lng: Double

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }

    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.lat = coordinate.latitude
        self.lng = coordinate.longitude
    }
}

struct NamedLatLng: Codable, Hashable {
    var lat: Double
    var lng: Double
    var name: String?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

struct RoutingInfo: Codable, Hashable {
    var provider: String
    var isRoadRouting: Bool
}

struct TeslaModeInfo: Codable, Hashable {
    var mode: String
}

struct Health: Codable {
    var status: String
    var machines: Int
    var routing: RoutingInfo
    var tesla: TeslaModeInfo?
}

struct RetailerCount: Codable, Identifiable {
    var retailer: String
    var count: Int
    var id: String { retailer }
}

struct RetailersResponse: Codable {
    var retailers: [RetailerCount]
}

// MARK: - Machines (/machines/near)

struct Machine: Codable, Identifiable {
    var id: String
    var name: String
    var retailer: String
    var city: String?
    var stateProvince: String?
    var lat: Double
    var lng: Double
    var distanceMeters: Double?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

struct NearResponse: Codable {
    var count: Int
    var machines: [Machine]
}

// MARK: - Plan (/plan)

struct PlannedStop: Codable, Identifiable {
    var id: String
    var name: String
    var retailer: String
    var address: String
    var lat: Double
    var lng: Double
    var order: Int
    var offRouteMeters: Double
    var addedDetourMeters: Double

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

struct CandidateMachine: Codable, Identifiable {
    var id: String
    var name: String
    var retailer: String
    var address: String
    var lat: Double
    var lng: Double
    var offRouteMeters: Double

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

struct RouteSummary: Codable {
    var distanceMeters: Double
    var durationSeconds: Double
}

struct PlannedSummary: Codable {
    var distanceMeters: Double
    var durationSeconds: Double
    var addedDistanceMeters: Double
    var addedDurationSeconds: Double
}

struct PlanResult: Codable {
    var origin: LatLng
    var destination: LatLng
    var base: RouteSummary
    var planned: PlannedSummary
    var stops: [PlannedStop]
    var candidateCount: Int
    var candidates: [CandidateMachine]
    var routeGeometry: [[Double]]
    var routing: RoutingInfo
    /// The controls actually applied; optional for forward/backward compatibility.
    var budget: PlanBudget?

    /// routeGeometry is [[lng, lat], …]; expose it as map coordinates.
    var coordinates: [CLLocationCoordinate2D] {
        routeGeometry.compactMap { pair in
            guard pair.count == 2 else { return nil }
            return CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0])
        }
    }
}

/// Echo of the planning controls the backend actually applied. `corridorMeters`
/// is derived from the time budget when one is supplied.
struct PlanBudget: Codable {
    var maxStops: Int
    var corridorMeters: Double
    var maxAddedDurationSeconds: Double?
    var estimatedAddedDurationSeconds: Double
}

struct PlanRequest: Codable {
    var origin: LatLng
    var destination: LatLng
    var maxStops: Int?
    var maxAddedDurationSeconds: Double?
    var corridorMeters: Double?
    var maxAddedMetersPerStop: Double?
    var retailers: [String]?
}

// MARK: - Manual route (/route)

struct RouteResult: Codable {
    var distanceMeters: Double
    var durationSeconds: Double
    var routeGeometry: [[Double]]
    var routing: RoutingInfo
}

// MARK: - Share (/share/links)

struct ShareBody: Codable {
    var origin: NamedLatLng
    var destination: NamedLatLng
    var stops: [NamedLatLng]?
    var name: String?
}

struct ShareLinks: Codable {
    var google: String
    var apple: String
    var waze: String
    var geo: String
}

// MARK: - Tesla (/tesla/*)

enum TeslaMode: String, Codable {
    case mock, live, disabled
}

struct TeslaStatus: Codable {
    var mode: TeslaMode
    var configured: Bool
    var connected: Bool
    var vehicleCount: Int?
}

struct TeslaVehicle: Codable, Identifiable {
    var id: String
    var vin: String
    var displayName: String
    var state: String
}

struct TeslaVehiclesResponse: Codable {
    var vehicles: [TeslaVehicle]
}

struct TeslaSendBody: Codable {
    var vehicleTag: String
    var origin: NamedLatLng?
    var destination: NamedLatLng
    var stops: [NamedLatLng]?
}

struct TeslaSendResult: Codable {
    var sent: Bool
    var url: String
    var vehicle: String
}
