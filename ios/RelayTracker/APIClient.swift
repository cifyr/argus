import Foundation

enum APIError: Error { case unauthorized, server(String), badResponse }

struct APIClient {
    let baseURL: String

    private func url(_ path: String) throws -> URL {
        let trimmed = baseURL.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        guard let u = URL(string: trimmed + path) else { throw AppError.message("Invalid server URL") }
        return u
    }

    private func post(_ path: String, body: [String: Any], token: String? = nil) async throws -> Data {
        var req = URLRequest(url: try url(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await run(req)
    }

    private func run(_ req: URLRequest) async throws -> Data {
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await URLSession.shared.data(for: req) }
        catch { throw AppError.message("Can't reach the server. Check the URL and that it's running.") }
        guard let http = resp as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if !(200...299).contains(http.statusCode) {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw AppError.message(msg ?? "Server error (\(http.statusCode))")
        }
        return data
    }

    func requestCode(phone: String) async throws {
        _ = try await post("/api/auth/request-code", body: ["phone": phone])
    }

    func verify(phone: String, code: String) async throws -> String {
        let data = try await post("/api/auth/verify", body: ["phone": phone, "code": code])
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String else { throw APIError.badResponse }
        return token
    }

    func postLocation(token: String, lat: Double, lng: Double, accuracy: Double?) async throws {
        var body: [String: Any] = ["lat": lat, "lng": lng]
        if let accuracy { body["accuracy"] = accuracy }
        _ = try await post("/api/location", body: body, token: token)
    }
}
