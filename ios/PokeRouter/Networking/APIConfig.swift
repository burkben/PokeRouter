import Foundation

/// Where the app finds the PokeRouter backend.
///
/// Defaults to the local dev server. On the iOS Simulator `localhost` reaches
/// the host Mac, so `npm start` in `backend/` just works. Override at runtime
/// by setting the `apiBaseURL` user-default (e.g. a LAN IP for a real device,
/// or your deployed https host).
enum APIConfig {
    static let defaultBaseURL = URL(string: "http://localhost:8080")!

    static var baseURL: URL {
        if let raw = UserDefaults.standard.string(forKey: "apiBaseURL"),
           let url = URL(string: raw) {
            return url
        }
        return defaultBaseURL
    }
}
