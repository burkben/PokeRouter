import Foundation

/// Where the app finds the PokeRouter backend.
///
/// Defaults to the local dev server. On the iOS Simulator `localhost` reaches
/// the host Mac, so `npm start` in `backend/` just works. Override at runtime
/// by setting the `apiBaseURL` user-default (e.g. a LAN IP for a real device,
/// or your deployed https host).
enum APIConfig {
    /// UserDefaults key holding the user's backend override. Shared with the
    /// Settings screen's `@AppStorage` binding so the two stay in sync.
    static let storageKey = "apiBaseURL"

    static let defaultBaseURL = URL(string: "http://localhost:8080")!

    static var baseURL: URL {
        if let raw = UserDefaults.standard.string(forKey: storageKey),
           let url = normalized(raw) {
            return url
        }
        return defaultBaseURL
    }

    /// Validate and canonicalize a user-entered backend URL. Returns `nil` for
    /// anything that isn't an `http`/`https` URL with a host, so the Settings
    /// screen can reject typos before they break every request.
    static func normalized(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = components.host, !host.isEmpty
        else { return nil }
        return components.url
    }
}
