#!/bin/zsh

# Build a tiny native Dock launcher; the editor stays in the default browser.
set -eu
POSTCRAFT_APP_PROJECT_DIR="${0:A:h:h}"
POSTCRAFT_APP_BUNDLE="$POSTCRAFT_APP_PROJECT_DIR/Postcraft Fluid.app"
POSTCRAFT_APP_CONTENTS="$POSTCRAFT_APP_BUNDLE/Contents"

[[ -x "$POSTCRAFT_APP_PROJECT_DIR/Lancer Postcraft.command" ]] || {
  print -u2 -- "Le lanceur Postcraft.command est introuvable ou non exécutable."
  exit 1
}

# Never overwrite an unrelated application or follow a destination symlink.
if [[ -L "$POSTCRAFT_APP_BUNDLE" ]]; then
  print -u2 -- "Postcraft Fluid.app est un lien symbolique : construction annulée."
  exit 1
fi
if [[ -e "$POSTCRAFT_APP_BUNDLE" ]]; then
  POSTCRAFT_EXISTING_APP_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$POSTCRAFT_APP_CONTENTS/Info.plist" 2>/dev/null) || {
    print -u2 -- "Un fichier Postcraft Fluid.app existe déjà et n’est pas notre lanceur."
    exit 1
  }
  [[ "$POSTCRAFT_EXISTING_APP_ID" == "local.postcraft.fluid.launcher" ]] || {
    print -u2 -- "Postcraft Fluid.app appartient à une autre application : construction annulée."
    exit 1
  }
fi

POSTCRAFT_APP_BUILD_DIR=$(/usr/bin/mktemp -d /private/tmp/postcraft-app-build.XXXXXX)
/usr/bin/swiftc -O -module-cache-path "$POSTCRAFT_APP_BUILD_DIR/icon-module-cache" \
  -framework AppKit "$POSTCRAFT_APP_PROJECT_DIR/scripts/launcher-icon.swift" \
  -o "$POSTCRAFT_APP_BUILD_DIR/launcher-icon"
"$POSTCRAFT_APP_BUILD_DIR/launcher-icon" "$POSTCRAFT_APP_PROJECT_DIR/assets/launcher"
/usr/bin/swiftc -O -module-cache-path "$POSTCRAFT_APP_BUILD_DIR/module-cache" \
  -framework AppKit "$POSTCRAFT_APP_PROJECT_DIR/scripts/postcraft-app.swift" \
  -o "$POSTCRAFT_APP_BUILD_DIR/Postcraft"

/bin/mkdir -p "$POSTCRAFT_APP_CONTENTS/MacOS" "$POSTCRAFT_APP_CONTENTS/Resources"
/bin/cp "$POSTCRAFT_APP_BUILD_DIR/Postcraft" "$POSTCRAFT_APP_CONTENTS/MacOS/Postcraft"
/bin/cp "$POSTCRAFT_APP_PROJECT_DIR/scripts/postcraft-app-info.plist" "$POSTCRAFT_APP_CONTENTS/Info.plist"
/bin/cp "$POSTCRAFT_APP_PROJECT_DIR/assets/launcher/postcraft-launcher.icns" "$POSTCRAFT_APP_CONTENTS/Resources/postcraft-launcher.icns"
/usr/libexec/PlistBuddy -c "Set :PostcraftProjectPath $POSTCRAFT_APP_PROJECT_DIR" "$POSTCRAFT_APP_CONTENTS/Info.plist"
/usr/bin/plutil -lint "$POSTCRAFT_APP_CONTENTS/Info.plist"
/usr/bin/codesign --force --sign - "$POSTCRAFT_APP_BUNDLE"
/usr/bin/codesign --verify --strict "$POSTCRAFT_APP_BUNDLE"
"$POSTCRAFT_APP_CONTENTS/MacOS/Postcraft" --check
print -r -- "Application créée : $POSTCRAFT_APP_BUNDLE"
