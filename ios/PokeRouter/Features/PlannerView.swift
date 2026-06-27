import SwiftUI
import MapKit

/// The single iPhone screen: pick a destination, tune the corridor, plan, then
/// hand the trip off to Apple Maps, Google Maps, or a Tesla.
struct PlannerView: View {
    @StateObject private var model = PlannerViewModel()
    @StateObject private var location = LocationProvider()
    @StateObject private var search = DestinationSearch()

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                RouteMapView(
                    plan: model.plan,
                    originName: model.originName,
                    destinationName: model.destination?.title ?? "Destination"
                )
                .ignoresSafeArea(edges: .top)

                controls
            }
            .navigationTitle("PokéRouter")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                location.start()
                await model.refreshTesla()
            }
            .onChange(of: location.lastLocation) { _, newValue in
                guard let newValue, model.origin == nil else { return }
                model.setOrigin(newValue.coordinate)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(model.errorMessage ?? "")
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 12) {
            destinationField

            if !search.results.isEmpty {
                resultsList
            }

            if location.lastLocation == nil {
                locationNotice
            }

            sliders

            Button(action: { Task { await model.plan() } }) {
                HStack {
                    if model.isPlanning { ProgressView().tint(.white) }
                    Text(model.isPlanning ? "Planning…" : "Plan route")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.canPlan)

            if model.plan != nil {
                tripSummary
                deliveryButtons
                teslaPanel
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding()
    }

    private var destinationField: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Where to?", text: $search.query)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .onChange(of: search.query) { _, _ in
                    search.search(near: regionAroundOrigin())
                }
            if search.isSearching { ProgressView() }
        }
        .padding(10)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
    }

    private var resultsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(search.results) { place in
                Button {
                    select(place)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(place.title).foregroundStyle(.primary)
                        if !place.subtitle.isEmpty {
                            Text(place.subtitle).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                }
                Divider()
            }
        }
        .padding(.horizontal, 10)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .frame(maxHeight: 220)
    }

    private var locationNotice: some View {
        HStack(spacing: 8) {
            Image(systemName: "location.slash")
            Text(location.errorMessage ?? "Finding your location…")
                .font(.footnote)
            Spacer()
            if !location.isAuthorized {
                Button("Enable") { location.requestPermission() }
                    .font(.footnote.weight(.semibold))
            }
        }
        .foregroundStyle(.secondary)
    }

    private var sliders: some View {
        VStack(spacing: 4) {
            HStack {
                Text("Max stops").font(.footnote)
                Spacer()
                Text("\(Int(model.maxStops))").font(.footnote.weight(.semibold))
            }
            Slider(value: $model.maxStops, in: 1...8, step: 1)

            HStack {
                Text("Corridor").font(.footnote)
                Spacer()
                Text("\(Int(model.corridorMiles)) mi").font(.footnote.weight(.semibold))
            }
            Slider(value: $model.corridorMiles, in: 1...25, step: 1)
        }
    }

    private var tripSummary: some View {
        Group {
            if let plan = model.plan {
                HStack {
                    Label(miles(plan.planned.distanceMeters), systemImage: "road.lanes")
                    Spacer()
                    Label(minutes(plan.planned.durationSeconds), systemImage: "clock")
                    Spacer()
                    Label("\(plan.stops.count) stops", systemImage: "cart")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var deliveryButtons: some View {
        HStack {
            Button { model.openAppleMaps() } label: {
                Label("Apple Maps", systemImage: "map").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button { Task { await model.openGoogleMaps() } } label: {
                Label("Google", systemImage: "globe").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    @ViewBuilder
    private var teslaPanel: some View {
        if let status = model.teslaStatus, status.connected, !model.vehicles.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Send to Tesla").font(.footnote.weight(.semibold))
                ForEach(model.vehicles) { vehicle in
                    Button {
                        Task { await model.sendToTesla(vehicle: vehicle) }
                    } label: {
                        Label(vehicle.displayName, systemImage: "car.fill")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                }
                if let message = model.statusMessage {
                    Text(message).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: Helpers

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )
    }

    private func select(_ place: PlaceResult) {
        model.destination = place
        search.query = place.title
        search.search(near: nil) // clears results below threshold next keystroke
        UIApplication.shared.dismissKeyboard()
    }

    private func regionAroundOrigin() -> MKCoordinateRegion? {
        guard let origin = model.origin ?? location.lastLocation?.coordinate else { return nil }
        return MKCoordinateRegion(center: origin, latitudinalMeters: 200_000, longitudinalMeters: 200_000)
    }

    private func miles(_ meters: Double) -> String {
        String(format: "%.0f mi", meters / 1609.34)
    }

    private func minutes(_ seconds: Double) -> String {
        String(format: "%.0f min", seconds / 60)
    }
}

private extension UIApplication {
    func dismissKeyboard() {
        sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
