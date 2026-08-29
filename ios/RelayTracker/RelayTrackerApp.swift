import SwiftUI

@main
struct RelayTrackerApp: App {
    @StateObject private var app = AppState()
    @StateObject private var location = LocationManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(app)
                .environmentObject(location)
                .onAppear {
                    // Every location fix is handed to AppState, which uploads it (throttled).
                    location.onUpdate = { loc in
                        Task { await app.uploadLocation(loc) }
                    }
                    if app.isSignedIn { location.start() }
                }
        }
    }
}
