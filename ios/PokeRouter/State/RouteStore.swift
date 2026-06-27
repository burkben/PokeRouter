import Foundation
import Combine

/// A plan plus the human-readable endpoint names, persisted so the CarPlay
/// scene and the phone scene always show the same trip — even across launches.
struct PersistedPlan: Codable {
    var plan: PlanResult
    var originName: String
    var destinationName: String
}

/// Single source of truth for "the route the user is currently working with".
///
/// Deliberately a plain `ObservableObject` singleton rather than an actor or a
/// `@MainActor` type: the phone UI and the CarPlay templates live in the same
/// process and both touch it from the main thread, so a shared instance plus a
/// small JSON file in Application Support is all the coordination we need (no
/// App Group required).
final class RouteStore: ObservableObject {
    static let shared = RouteStore()

    @Published private(set) var current: PersistedPlan?

    private let fileURL: URL

    private init() {
        let dir = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("current-plan.json")
        current = Self.load(from: fileURL)
    }

    func update(plan: PlanResult, originName: String, destinationName: String) {
        let persisted = PersistedPlan(plan: plan, originName: originName, destinationName: destinationName)
        current = persisted
        save(persisted)
    }

    func clear() {
        current = nil
        try? FileManager.default.removeItem(at: fileURL)
    }

    // MARK: Persistence

    private func save(_ persisted: PersistedPlan) {
        do {
            let data = try JSONEncoder().encode(persisted)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Persistence is best-effort; the in-memory copy is still valid.
            print("RouteStore: failed to persist plan – \(error)")
        }
    }

    private static func load(from url: URL) -> PersistedPlan? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PersistedPlan.self, from: data)
    }
}
