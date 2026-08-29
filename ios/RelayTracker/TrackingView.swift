import SwiftUI
import CoreLocation

struct TrackingView: View {
    @EnvironmentObject var app: AppState
    @EnvironmentObject var location: LocationManager

    var body: some View {
        List {
            Section {
                HStack {
                    Circle().fill(statusColor).frame(width: 10, height: 10)
                    Text(statusText).font(.headline)
                }
                if let loc = location.latest {
                    LabeledContent("Position", value: String(format: "%.5f, %.5f", loc.coordinate.latitude, loc.coordinate.longitude))
                }
                if let acc = app.lastAccuracy {
                    LabeledContent("Accuracy", value: "\(Int(acc)) m")
                }
                if let at = app.lastUploadAt {
                    LabeledContent("Last sent", value: at.formatted(date: .omitted, time: .standard))
                }
            } footer: {
                Text("While this is running, your location is shared with the relay so it can be read out when someone you're expecting a call from texts it. Grant \"Always\" and keep location on for background updates.")
            }

            if let err = app.lastError {
                Section { Text(err).foregroundStyle(.red) }
            }

            Section("Account") {
                LabeledContent("Signed in as", value: app.phone ?? "-")
                NavigationLink("Server") { ServerSettingsView() }
                Button("Sign out", role: .destructive) {
                    location.stop()
                    app.signOut()
                }
            }
        }
        .navigationTitle("Sharing location")
        .onAppear { if !location.tracking { location.start() } }
    }

    private var statusText: String {
        switch location.authorization {
        case .authorizedAlways: return "Sharing location (background)"
        case .authorizedWhenInUse: return "Sharing while open"
        case .denied, .restricted: return "Location denied - enable in Settings"
        default: return "Requesting location..."
        }
    }
    private var statusColor: Color {
        switch location.authorization {
        case .authorizedAlways: return .green
        case .authorizedWhenInUse: return .yellow
        case .denied, .restricted: return .red
        default: return .gray
        }
    }
}
