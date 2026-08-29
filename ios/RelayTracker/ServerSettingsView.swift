import SwiftUI

struct ServerSettingsView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    var firstRun = false
    @State private var draft = ""

    var body: some View {
        Form {
            Section {
                TextField("https://your-subdomain.ngrok-free.app", text: $draft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
            } header: {
                Text("Relay server")
            } footer: {
                Text("The address your Mac serves the relay on. Use the ngrok URL from `npm run tunnel`, or your Mac's LAN address like http://192.168.1.20:3000 while on the same Wi-Fi.")
            }
            Section {
                Button("Save") {
                    app.serverURL = draft.trimmingCharacters(in: .whitespaces)
                    if !firstRun { dismiss() }
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle(firstRun ? "Connect to relay" : "Server")
        .onAppear { draft = app.serverURL }
    }
}
