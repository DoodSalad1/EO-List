#!/bin/bash

# EO List Native Messaging Host Installation Script

echo "🔧 Installing EO List System-Level Scheduler..."

# Create native messaging host directory if it doesn't exist
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$HOST_DIR"

# Get the absolute path to the host manifest
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_SOURCE="$SCRIPT_DIR/com.eolist.scheduler.json"
MANIFEST_DEST="$HOST_DIR/com.eolist.scheduler.json"

echo "📁 Installing native messaging host manifest..."

# Check if we need to get the extension ID
if grep -q "EXTENSION_ID_PLACEHOLDER" "$MANIFEST_SOURCE"; then
    echo ""
    echo "⚠️  Extension ID Required"
    echo "To complete installation, you need your Chrome extension ID:"
    echo ""
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Enable 'Developer mode' (toggle in top right)"
    echo "3. Find the 'EO List' extension"
    echo "4. Copy the ID (long string like: abcdefghijklmnopqrstuvwxyz123456)"
    echo ""
    read -p "Enter your extension ID: " EXTENSION_ID
    
    if [[ -z "$EXTENSION_ID" ]]; then
        echo "❌ No extension ID provided. Installation cannot continue."
        exit 1
    fi
    
    # Update manifest with actual extension ID
    sed "s/EXTENSION_ID_PLACEHOLDER/$EXTENSION_ID/g" "$MANIFEST_SOURCE" > "$MANIFEST_DEST"
    echo "✅ Updated manifest with extension ID: $EXTENSION_ID"
else
    # Copy manifest as-is
    cp "$MANIFEST_SOURCE" "$MANIFEST_DEST"
fi

echo "✅ Native messaging host installed to: $MANIFEST_DEST"

# Verify installation
if [[ -f "$MANIFEST_DEST" ]]; then
    echo "✅ Installation successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Reload the EO List extension in Chrome (chrome://extensions/)"
    echo "2. Test scheduling an EO to verify system-level scheduling works"
    echo "3. Scheduled EOs will now work even when Chrome is closed!"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "- Check Chrome's extension console for any native messaging errors"
    echo "- Verify the extension ID is correct in: $MANIFEST_DEST"
    echo "- Ensure Node.js is installed and accessible via 'node' command"
else
    echo "❌ Installation failed - manifest file not created"
    exit 1
fi