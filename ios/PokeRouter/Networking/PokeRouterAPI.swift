import Foundation

enum APIError: LocalizedError {
    case badStatus(Int, String)
    case decoding(String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case let .badStatus(code, body): return "Server error \(code): \(body)"
        case let .decoding(message): return "Could not read the server response: \(message)"
        case let .transport(message): return message
        }
    }
}

/// Thin async wrapper over the PokeRouter HTTP API. One instance per app is
/// plenty; it is stateless apart from the base URL.
struct PokeRouterAPI {
    var baseURL: URL
    var session: URLSession

    init(baseURL: URL = APIConfig.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    // MARK: Endpoints

    func health() async throws -> Health {
        try await get("/health")
    }

    func retailers() async throws -> [RetailerCount] {
        let response: RetailersResponse = try await get("/retailers")
        return response.retailers
    }

    func near(lat: Double, lng: Double, radiusMeters: Int = 25_000, limit: Int = 50) async throws -> [Machine] {
        let path = "/machines/near?lat=\(lat)&lng=\(lng)&radiusMeters=\(radiusMeters)&limit=\(limit)"
        let response: NearResponse = try await get(path)
        return response.machines
    }

    func plan(_ request: PlanRequest) async throws -> PlanResult {
        try await post("/plan", body: request)
    }

    func route(points: [LatLng]) async throws -> RouteResult {
        struct Body: Codable { let points: [LatLng] }
        return try await post("/route", body: Body(points: points))
    }

    func shareLinks(_ body: ShareBody) async throws -> ShareLinks {
        try await post("/share/links", body: body)
    }

    // MARK: Tesla

    func teslaStatus() async throws -> TeslaStatus {
        try await get("/tesla/status")
    }

    func teslaVehicles() async throws -> [TeslaVehicle] {
        let response: TeslaVehiclesResponse = try await get("/tesla/vehicles")
        return response.vehicles
    }

    func teslaSend(_ body: TeslaSendBody) async throws -> TeslaSendResult {
        try await post("/tesla/send", body: body)
    }

    /// The browser URL that begins Tesla's OAuth consent flow.
    func teslaLoginURL() -> URL {
        baseURL.appendingPathComponent("tesla/auth/login")
    }

    // MARK: Plumbing

    private func get<Response: Decodable>(_ path: String) async throws -> Response {
        let request = URLRequest(url: url(for: path))
        return try await send(request)
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        var request = URLRequest(url: url(for: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw APIError.decoding("encoding request: \(error.localizedDescription)")
        }
        return try await send(request)
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.badStatus(http.statusCode, body)
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    private func url(for path: String) -> URL {
        URL(string: path, relativeTo: baseURL) ?? baseURL
    }
}
