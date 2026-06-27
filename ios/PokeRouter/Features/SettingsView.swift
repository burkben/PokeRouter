import SwiftUI

/// Lets the user point the app at a different PokeRouter backend — a LAN IP for
/// a real device, or a deployed https host — instead of the localhost default.
///
/// The text field is bound straight to the same `apiBaseURL` user-default that
/// `APIConfig.baseURL` reads, so edits take effect on the next request. A "Test
/// connection" button hits `/health` so the user gets immediate feedback before
/// leaving the screen.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    @AppStorage(APIConfig.storageKey) private var baseURLString = APIConfig.defaultBaseURL.absoluteString

    @State private var test: TestState = .idle

    private enum TestState: Equatable {
        case idle
        case testing
        case success(machines: Int, routing: String, tesla: String)
        case failure(String)
    }

    private var isValid: Bool { APIConfig.normalized(baseURLString) != nil }

    private var isDefault: Bool {
        APIConfig.normalized(baseURLString) == APIConfig.defaultBaseURL
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://your-host", text: $baseURLString)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: baseURLString) { _, _ in test = .idle }

                    if !isValid {
                        Label("Enter a full http:// or https:// URL.", systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                } header: {
                    Text("Backend URL")
                } footer: {
                    Text("Where the app sends planning and Tesla requests. The Simulator reaches the Mac at localhost; a real device needs your computer's LAN IP (e.g. http://192.168.1.20:8080) or a deployed host.")
                }

                Section {
                    Button {
                        Task { await runTest() }
                    } label: {
                        HStack {
                            if test == .testing { ProgressView().controlSize(.small) }
                            Text(test == .testing ? "Testing…" : "Test connection")
                        }
                    }
                    .disabled(!isValid || test == .testing)

                    testResultRow

                    Button("Reset to default", role: .destructive) {
                        baseURLString = APIConfig.defaultBaseURL.absoluteString
                        test = .idle
                    }
                    .disabled(isDefault)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var testResultRow: some View {
        switch test {
        case .idle, .testing:
            EmptyView()
        case let .success(machines, routing, tesla):
            VStack(alignment: .leading, spacing: 4) {
                Label("Connected", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.subheadline.weight(.semibold))
                Text("\(machines) machines · routing: \(routing) · Tesla: \(tesla)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case let .failure(message):
            VStack(alignment: .leading, spacing: 4) {
                Label("Couldn't connect", systemImage: "xmark.circle.fill")
                    .foregroundStyle(.red)
                    .font(.subheadline.weight(.semibold))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func runTest() async {
        guard let url = APIConfig.normalized(baseURLString) else { return }
        test = .testing
        do {
            let api = PokeRouterAPI(baseURL: url)
            let health = try await api.health()
            test = .success(
                machines: health.machines,
                routing: health.routing.provider,
                tesla: health.tesla?.mode ?? "disabled"
            )
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            test = .failure(message)
        }
    }
}

#Preview {
    SettingsView()
}
