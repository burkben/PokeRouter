import Foundation
import MapKit

/// A geocoded place the user can pick as a destination.
struct PlaceResult: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let subtitle: String
    let coordinate: CLLocationCoordinate2D

    static func == (lhs: PlaceResult, rhs: PlaceResult) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Wraps `MKLocalSearch` for free-text destination lookup. No API key needed —
/// this uses Apple's on-device search backed by Apple Maps.
@MainActor
final class DestinationSearch: ObservableObject {
    @Published var query: String = ""
    @Published private(set) var results: [PlaceResult] = []
    @Published private(set) var isSearching = false

    private var searchTask: Task<Void, Never>?

    /// Debounced search around an optional region (bias results near the user).
    func search(near region: MKCoordinateRegion?) {
        searchTask?.cancel()
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 3 else {
            results = []
            return
        }

        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            await self.run(text: text, region: region)
        }
    }

    private func run(text: String, region: MKCoordinateRegion?) async {
        isSearching = true
        defer { isSearching = false }

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        if let region { request.region = region }

        do {
            let response = try await MKLocalSearch(request: request).start()
            guard !Task.isCancelled else { return }
            results = response.mapItems.prefix(8).map { item in
                PlaceResult(
                    title: item.name ?? item.placemark.title ?? text,
                    subtitle: Self.subtitle(for: item.placemark),
                    coordinate: item.placemark.coordinate
                )
            }
        } catch {
            results = []
        }
    }

    private static func subtitle(for placemark: MKPlacemark) -> String {
        [placemark.locality, placemark.administrativeArea, placemark.postalCode]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}
