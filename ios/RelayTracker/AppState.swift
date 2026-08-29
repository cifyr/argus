import Foundation
import CoreLocation

@MainActor
final class AppState: ObservableObject {
    @Published var serverURL: String { didSet { defaults.set(serverURL, forKey: "serverURL") } }
    @Published private(set) var token: String? { didSet { defaults.set(token, forKey: "token") } }
    @Published private(set) var phone: String? { didSet { defaults.set(phone, forKey: "phone") } }

    @Published var lastUploadAt: Date?
    @Published var lastAccuracy: Double?
    @Published var lastError: String?

    private let defaults = UserDefaults.standard
    private var lastPostAt: Date = .distantPast
    private var lastPostLocation: CLLocation?

    var isSignedIn: Bool { token != nil }
    var hasServer: Bool { !serverURL.trimmingCharacters(in: .whitespaces).isEmpty }

    private var client: APIClient { APIClient(baseURL: serverURL) }

    init() {
        serverURL = defaults.string(forKey: "serverURL") ?? ""
        token = defaults.string(forKey: "token")
        phone = defaults.string(forKey: "phone")
    }

    func requestCode(phone: String) async throws {
        try await client.requestCode(phone: phone)
        self.phone = phone
    }

    func verify(code: String) async throws {
        guard let phone else { throw AppError.message("Enter your number first") }
        let token = try await client.verify(phone: phone, code: code)
        self.token = token
    }

    func signOut() {
        token = nil
    }

    // Upload at most every 15s or every ~40m of movement, whichever comes first.
    func uploadLocation(_ loc: CLLocation) async {
        guard let token else { return }
        let movedFar = (lastPostLocation.map { loc.distance(from: $0) > 40 }) ?? true
        let longAgo = Date().timeIntervalSince(lastPostAt) > 15
        guard movedFar || longAgo else { return }
        do {
            try await client.postLocation(
                token: token,
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                accuracy: loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : nil
            )
            lastPostAt = Date()
            lastPostLocation = loc
            lastUploadAt = Date()
            lastAccuracy = loc.horizontalAccuracy
            lastError = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            lastError = (error as? AppError)?.text ?? error.localizedDescription
        }
    }
}

enum AppError: Error { case message(String); var text: String { if case let .message(m) = self { return m }; return "Error" } }
