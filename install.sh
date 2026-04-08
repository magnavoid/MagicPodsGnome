#!/usr/bin/env bash
# Installs the MagicPods GNOME Shell extension and binary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_ID="magicpods@magicpods.app"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${EXT_ID}"
BINARY_SRC="${SCRIPT_DIR}/bin/magicpodscore"

# Check binary exists
if [[ ! -f "${BINARY_SRC}" ]]; then
    echo "ERROR: binary not found at ${BINARY_SRC}"
    echo "Build it first:"
    echo "  cd ../backend/src/MagicPodsCore/build && cmake --build ."
    echo "  cp ../backend/src/MagicPodsCore/build/magicpodscore bin/"
    exit 1
fi

# Install extension files
mkdir -p "${INSTALL_DIR}/bin"
cp "${SCRIPT_DIR}/metadata.json"  "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/extension.js"   "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/backend.js"     "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/indicator.js"   "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/stylesheet.css" "${INSTALL_DIR}/"
cp "${BINARY_SRC}"                "${INSTALL_DIR}/bin/magicpodscore"
chmod +x "${INSTALL_DIR}/bin/magicpodscore"

echo "Installed to ${INSTALL_DIR}"
echo ""
echo "Enable with:"
echo "  gnome-extensions enable ${EXT_ID}"
echo ""
echo "Or restart GNOME Shell (Alt+F2, type 'r', Enter) and enable in Extensions app."
