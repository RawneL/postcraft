import AppKit
import Foundation

// Vector version of the monochrome favicon, with macOS icon margins.
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let iconset = output.appendingPathComponent("postcraft.iconset", isDirectory: true)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
let representations = [("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
                       ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
                       ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
                       ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
                       ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024)]
for (name, size) in representations {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                            bytesPerRow: size * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.scaleBy(x: CGFloat(size) / 40, y: CGFloat(size) / 40)
    context.translateBy(x: 4, y: 36)
    context.scaleBy(x: 1, y: -1)
    context.setFillColor(NSColor(srgbRed: 23/255, green: 23/255, blue: 23/255, alpha: 1).cgColor)
    context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 32, height: 32), cornerWidth: 8, cornerHeight: 8, transform: nil))
    context.fillPath()
    let letter = CGMutablePath()
    letter.move(to: CGPoint(x: 11, y: 8))
    letter.addLine(to: CGPoint(x: 17, y: 8))
    letter.addCurve(to: CGPoint(x: 17, y: 20), control1: CGPoint(x: 25, y: 8), control2: CGPoint(x: 25, y: 20))
    for point in [CGPoint(x: 14, y: 20), CGPoint(x: 14, y: 25), CGPoint(x: 11, y: 25)] { letter.addLine(to: point) }
    letter.closeSubpath()
    letter.move(to: CGPoint(x: 14, y: 11))
    letter.addLine(to: CGPoint(x: 17, y: 11))
    letter.addCurve(to: CGPoint(x: 17, y: 17), control1: CGPoint(x: 21, y: 11), control2: CGPoint(x: 21, y: 17))
    letter.addLine(to: CGPoint(x: 14, y: 17))
    letter.closeSubpath()
    context.setFillColor(NSColor.white.cgColor)
    context.addPath(letter)
    context.drawPath(using: .eoFill)
    let png = NSBitmapImageRep(cgImage: context.makeImage()!).representation(using: .png, properties: [:])!
    try png.write(to: iconset.appendingPathComponent(name))
    if size == 1024 { try png.write(to: output.appendingPathComponent("postcraft-launcher.png")) }
}
let conversion = Process()
conversion.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
conversion.arguments = ["-c", "icns", iconset.path, "-o", output.appendingPathComponent("postcraft-launcher.icns").path]
try conversion.run()
conversion.waitUntilExit()
exit(conversion.terminationStatus)
