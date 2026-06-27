import XCTest
@testable import PokeRouter

/// Decoding tests that pin the Swift models to the real backend JSON shapes
/// (see backend/src/server/app.ts and backend/src/share/routes.ts). If the API
/// contract drifts, these fail instead of the UI silently showing nothing.
final class ModelDecodingTests: XCTestCase {
    private let decoder = JSONDecoder()

    func testDecodeHealth() throws {
        let json = """
        {"status":"ok","machines":1863,"routing":{"provider":"openrouteservice","isRoadRouting":true},"tesla":{"mode":"mock"}}
        """.data(using: .utf8)!
        let health = try decoder.decode(Health.self, from: json)
        XCTAssertEqual(health.machines, 1863)
        XCTAssertTrue(health.routing.isRoadRouting)
        XCTAssertEqual(health.tesla?.mode, "mock")
    }

    func testDecodePlanResultAndCoordinates() throws {
        let json = """
        {
          "origin":{"lat":47.6,"lng":-122.33},
          "destination":{"lat":45.52,"lng":-122.68},
          "base":{"distanceMeters":233000,"durationSeconds":12000},
          "planned":{"distanceMeters":245000,"durationSeconds":13500,"addedDistanceMeters":12000,"addedDurationSeconds":1500},
          "stops":[
            {"id":"rec1","name":"Q00562","retailer":"GameStop","address":"1 Main St","lat":46.2,"lng":-122.9,"order":1,"offRouteMeters":800,"addedDetourMeters":1600}
          ],
          "candidateCount":1,
          "candidates":[
            {"id":"rec2","name":"Q00999","retailer":"Target","address":"2 Oak Ave","lat":46.4,"lng":-122.95,"offRouteMeters":1200}
          ],
          "routeGeometry":[[-122.33,47.6],[-122.68,45.52]],
          "routing":{"provider":"openrouteservice","isRoadRouting":true}
        }
        """.data(using: .utf8)!

        let plan = try decoder.decode(PlanResult.self, from: json)
        XCTAssertEqual(plan.stops.count, 1)
        XCTAssertEqual(plan.stops.first?.order, 1)
        XCTAssertEqual(plan.candidateCount, 1)
        // routeGeometry is [lng, lat]; coordinates must swap to (lat, lng).
        XCTAssertEqual(plan.coordinates.count, 2)
        let first = try XCTUnwrap(plan.coordinates.first)
        XCTAssertEqual(first.latitude, 47.6, accuracy: 0.0001)
        XCTAssertEqual(first.longitude, -122.33, accuracy: 0.0001)
    }

    func testDecodeNearResponse() throws {
        let json = """
        {"count":1,"machines":[{"id":"rec1","name":"Q1","retailer":"GameStop","city":"Tacoma","stateProvince":"WA","lat":47.2,"lng":-122.4,"distanceMeters":1234}]}
        """.data(using: .utf8)!
        let near = try decoder.decode(NearResponse.self, from: json)
        XCTAssertEqual(near.count, 1)
        XCTAssertEqual(near.machines.first?.distanceMeters, 1234)
    }

    func testDecodeShareLinks() throws {
        let json = """
        {"google":"https://maps.google.com/x","apple":"https://maps.apple.com/y","waze":"https://waze.com/z","geo":"geo:0,0"}
        """.data(using: .utf8)!
        let links = try decoder.decode(ShareLinks.self, from: json)
        XCTAssertEqual(links.google, "https://maps.google.com/x")
    }

    func testDecodeTeslaStatusAndVehicles() throws {
        let statusJSON = """
        {"mode":"mock","configured":true,"connected":true,"vehicleCount":2}
        """.data(using: .utf8)!
        let status = try decoder.decode(TeslaStatus.self, from: statusJSON)
        XCTAssertEqual(status.mode, .mock)
        XCTAssertTrue(status.connected)

        let vehiclesJSON = """
        {"vehicles":[{"id":"100021","vin":"5YJ3E1EA1KF000001","displayName":"Ash's Model 3","state":"online"}]}
        """.data(using: .utf8)!
        let vehicles = try decoder.decode(TeslaVehiclesResponse.self, from: vehiclesJSON)
        XCTAssertEqual(vehicles.vehicles.first?.displayName, "Ash's Model 3")
    }

    func testEncodePlanRequestRoundTrips() throws {
        let request = PlanRequest(
            origin: LatLng(lat: 47.6, lng: -122.3),
            destination: LatLng(lat: 45.5, lng: -122.6),
            maxStops: 3,
            corridorMeters: 8046.7,
            maxAddedMetersPerStop: nil,
            retailers: ["GameStop"]
        )
        let data = try JSONEncoder().encode(request)
        let back = try decoder.decode(PlanRequest.self, from: data)
        XCTAssertEqual(back.maxStops, 3)
        XCTAssertEqual(back.retailers, ["GameStop"])
    }
}
