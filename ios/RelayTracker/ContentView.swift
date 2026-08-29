import SwiftUI

struct ContentView: View {
    @EnvironmentObject var app: AppState
    @EnvironmentObject var location: LocationManager

    var body: some View {
        NavigationStack {
            if !app.hasServer {
                ServerSettingsView(firstRun: true)
            } else if !app.isSignedIn {
                SignInView()
            } else {
                TrackingView()
            }
        }
    }
}
