import SwiftUI

struct SignInView: View {
    @EnvironmentObject var app: AppState
    @EnvironmentObject var location: LocationManager
    @State private var phone = ""
    @State private var code = ""
    @State private var stage: Stage = .phone
    @State private var busy = false
    @State private var error: String?

    enum Stage { case phone, code }

    var body: some View {
        Form {
            if stage == .phone {
                Section {
                    TextField("555-123-4567", text: $phone)
                        .keyboardType(.phonePad)
                } header: {
                    Text("Sign in with your phone")
                } footer: {
                    Text("We text a 6-digit code from the relay's Google Voice number.")
                }
                Section {
                    Button(busy ? "Sending..." : "Text me a code") { Task { await requestCode() } }
                        .disabled(busy || phone.isEmpty)
                }
            } else {
                Section {
                    TextField("123456", text: $code)
                        .keyboardType(.numberPad)
                } header: {
                    Text("Enter the code")
                } footer: {
                    Text("Sent to \(app.phone ?? phone).")
                }
                Section {
                    Button(busy ? "Verifying..." : "Verify") { Task { await verify() } }
                        .disabled(busy || code.count < 6)
                    Button("Use a different number") { stage = .phone; code = "" }
                        .foregroundStyle(.secondary)
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Relay")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink("Server") { ServerSettingsView() }
            }
        }
    }

    private func requestCode() async {
        busy = true; error = nil
        do { try await app.requestCode(phone: phone); stage = .code }
        catch { self.error = (error as? AppError)?.text ?? error.localizedDescription }
        busy = false
    }

    private func verify() async {
        busy = true; error = nil
        do { try await app.verify(code: code); location.start() }
        catch { self.error = (error as? AppError)?.text ?? error.localizedDescription }
        busy = false
    }
}
