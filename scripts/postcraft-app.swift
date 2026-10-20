import AppKit
import Foundation

// This is only a Finder/Dock launcher. The existing command owns the local server.
func launcherURL() -> URL? {
    let besideApplication = Bundle.main.bundleURL.deletingLastPathComponent()
    var candidates = [besideApplication]
    if let savedProject = Bundle.main.object(forInfoDictionaryKey: "PostcraftProjectPath") as? String {
        candidates.append(URL(fileURLWithPath: savedProject, isDirectory: true))
    }
    return candidates.compactMap { directory -> URL? in
        let launcher = directory.appendingPathComponent("Lancer Postcraft.command")
        let project = directory.appendingPathComponent("src/App.tsx")
        let manifest = directory.appendingPathComponent("package.json")
        guard FileManager.default.isExecutableFile(atPath: launcher.path),
              FileManager.default.fileExists(atPath: project.path),
              FileManager.default.fileExists(atPath: manifest.path) else { return nil }
        return launcher
    }.first
}

final class PostcraftLauncher: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let launcher = launcherURL() else {
            fail("Le dossier du projet Postcraft est introuvable.",
                 detail: "Replacez Postcraft Fluid.app dans le dossier fluid-functionalism-rebuild, à côté de Lancer Postcraft.command, puis réessayez.")
            return
        }
        guard let terminal = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal") else {
            fail("Terminal est introuvable.", detail: "Ouvrez Lancer Postcraft.command directement depuis le Finder.")
            return
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.open([launcher], withApplicationAt: terminal, configuration: configuration) { _, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.fail("Impossible de lancer Postcraft.", detail: error.localizedDescription)
                } else {
                    print("Lanceur ouvert dans Terminal : \(launcher.path)")
                    // Terminal keeps the server alive after this small launcher exits.
                    NSApplication.shared.terminate(nil)
                }
            }
        }
    }

    private func fail(_ message: String, detail: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Fermer")
        NSApplication.shared.activate(ignoringOtherApps: true)
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

// Diagnostic mode does not open Terminal or the browser, or start/stop any server.
if CommandLine.arguments.contains("--check") {
    guard let launcher = launcherURL(),
          let iconName = Bundle.main.object(forInfoDictionaryKey: "CFBundleIconFile") as? String,
          let resources = Bundle.main.resourceURL,
          let icon = NSImage(contentsOf: resources.appendingPathComponent(iconName)), icon.isValid else {
        FileHandle.standardError.write(Data("Le lanceur ou l’icône est introuvable.\n".utf8))
        exit(1)
    }
    print("Application : \(Bundle.main.bundleURL.path)")
    print("Lanceur : \(launcher.path)")
    print("Icône : valide")
    exit(0)
}

let application = NSApplication.shared
let delegate = PostcraftLauncher()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
