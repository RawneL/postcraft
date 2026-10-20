#!/bin/zsh

# Double-click in Finder. No Electron build or global Vite installation required.
set -u
unsetopt BG_NICE

POSTCRAFT_PROJECT_DIR="${0:A:h}"
# Keep a copy on the Desktop usable; an alias also resolves to the project folder.
if [[ ! -f "$POSTCRAFT_PROJECT_DIR/src/App.tsx" || ! -f "$POSTCRAFT_PROJECT_DIR/package.json" ]]; then
  POSTCRAFT_PROJECT_DIR="/Users/design/Documents/Rohan/_Tests/_code/MJMLEditor/fluid-functionalism-rebuild"
fi
POSTCRAFT_PORT="${POSTCRAFT_PORT:-4183}"
POSTCRAFT_URL="http://127.0.0.1:$POSTCRAFT_PORT/"
POSTCRAFT_SERVER_PID=""

postcraft_error() {
  print -r -- ""
  print -r -- "Postcraft : $1"
  if [[ -t 0 ]]; then
    read "?Appuyez sur Entrée pour fermer cette fenêtre. "
  fi
  exit 1
}

postcraft_stop_server() {
  # Never stop a pre-existing server: this PID belongs only to this launcher.
  if [[ -n "$POSTCRAFT_SERVER_PID" ]] && kill -0 "$POSTCRAFT_SERVER_PID" 2>/dev/null; then
    kill -TERM "$POSTCRAFT_SERVER_PID" 2>/dev/null
    wait "$POSTCRAFT_SERVER_PID" 2>/dev/null
  fi
}

postcraft_ready() {
  /usr/bin/curl --noproxy '*' --fail --silent --max-time 1 "$POSTCRAFT_URL" 2>/dev/null |
    /usr/bin/grep -Fq '<title>Postcraft Fluid — Email Studio</title>'
}

postcraft_open_browser() {
  # Useful for checking the launcher from a terminal without opening an extra tab.
  if [[ "${POSTCRAFT_NO_BROWSER:-0}" != "1" ]]; then
    print -r -- "Ouverture du navigateur par défaut…"
    /usr/bin/open "$POSTCRAFT_URL" || postcraft_error "Impossible d’ouvrir le navigateur. Ouvrez $POSTCRAFT_URL manuellement."
  else
    print -r -- "Ouverture automatique du navigateur désactivée pour ce test."
  fi
}

print -r -- "POSTCRAFT FLUID — EMAIL STUDIO"
print -r -- "Serveur local : $POSTCRAFT_URL"

[[ "$POSTCRAFT_PORT" == <-> ]] && (( POSTCRAFT_PORT > 0 && POSTCRAFT_PORT < 65536 )) || postcraft_error "Le numéro de port est invalide."
[[ -f "$POSTCRAFT_PROJECT_DIR/src/App.tsx" && -f "$POSTCRAFT_PROJECT_DIR/package.json" ]] || postcraft_error "Le dossier du projet est introuvable. Mettez à jour POSTCRAFT_PROJECT_DIR dans le lanceur."
cd -- "$POSTCRAFT_PROJECT_DIR" || postcraft_error "Impossible d’accéder au dossier du projet."

if postcraft_ready; then
  print -r -- "Postcraft est déjà lancé."
  postcraft_open_browser
  print -r -- "Vous pouvez fermer cette fenêtre. Le serveur déjà actif continue de fonctionner."
  exit 0
fi

if /usr/sbin/lsof -nP -iTCP:"$POSTCRAFT_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  postcraft_error "Le port $POSTCRAFT_PORT est occupé par un autre service. Aucun processus n’a été arrêté."
fi

# Finder/Terminal may not inherit the PATH configured in an interactive shell.
if [[ -x "/usr/local/bin/node" ]]; then
  # These dependencies were installed with the Intel Homebrew Node runtime.
  export PATH="/usr/local/bin:$PATH"
elif [[ -x "/Users/design/.nvm/versions/node/v20.19.6/bin/node" ]]; then
  export PATH="/Users/design/.nvm/versions/node/v20.19.6/bin:$PATH"
else
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || postcraft_error "Node.js est introuvable. Installez Node.js 18 ou plus récent avant de lancer Postcraft."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || postcraft_error "Postcraft nécessite Node.js 18 ou plus récent."
[[ -f node_modules/vite/bin/vite.js ]] || postcraft_error "Les dépendances manquent. Exécutez npm install dans le dossier du projet, puis relancez ce fichier."

trap postcraft_stop_server EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

print -r -- "Démarrage du serveur…"
# Run Vite directly to keep a single, identifiable server PID for cleanup.
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$POSTCRAFT_PORT" --strictPort --clearScreen false &
POSTCRAFT_SERVER_PID=$!

POSTCRAFT_IS_READY=0
for POSTCRAFT_ATTEMPT in {1..40}; do
  if postcraft_ready; then
    POSTCRAFT_IS_READY=1
    break
  fi
  kill -0 "$POSTCRAFT_SERVER_PID" 2>/dev/null || postcraft_error "Le serveur n’a pas pu démarrer. Consultez le message ci-dessus."
  /bin/sleep 0.25
done
(( POSTCRAFT_IS_READY )) || postcraft_error "Le serveur ne répond pas. Consultez le message ci-dessus et réessayez."

print -r -- "Postcraft est prêt."
postcraft_open_browser
print -r -- ""
print -r -- "Gardez cette fenêtre ouverte pendant l’utilisation."
print -r -- "Fermez-la ou faites Ctrl+C pour arrêter ce serveur."
print -r -- "Pensez à enregistrer votre projet JSON avant de quitter."

wait "$POSTCRAFT_SERVER_PID"
POSTCRAFT_EXIT_CODE=$?
POSTCRAFT_SERVER_PID=""
(( POSTCRAFT_EXIT_CODE == 0 )) || postcraft_error "Le serveur s’est arrêté (code $POSTCRAFT_EXIT_CODE). Relancez le lanceur pour reprendre."
