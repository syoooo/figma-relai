#!/bin/bash
# Relai - Setup Script

set -e

echo "=== Relai Setup ==="

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_ENTRY="$REPO_DIR/packages/mcp-server/dist/index.js"

# Install dependencies
echo "Installing dependencies..."
bun install

# Build the project
echo "Building project..."
bun run build

# MCP configs point at the built server by absolute path — no global bin,
# no PATH dependence, works from any working directory
MCP_JSON=$(cat << EOF
{
  "mcpServers": {
    "Relai": {
      "command": "node",
      "args": ["$SERVER_ENTRY"]
    }
  }
}
EOF
)

echo "Writing Cursor MCP config (.cursor/mcp.json)..."
mkdir -p "$REPO_DIR/.cursor"
printf '%s\n' "$MCP_JSON" > "$REPO_DIR/.cursor/mcp.json"

echo "Writing Claude Code MCP config (.mcp.json)..."
printf '%s\n' "$MCP_JSON" > "$REPO_DIR/.mcp.json"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. In Figma: install the Relai plugin from Community, or"
echo "   Plugins → Development → Import plugin from manifest… → packages/figma-plugin/manifest.json"
echo "2. Run the plugin — it connects automatically"
echo "3. Talk to your AI (Claude Code / Cursor). It pairs with the plugin on its own."
echo ""
echo "The relay runs inside the MCP server (port 9055). No separate terminal needed."
echo "To use the MCP server from another project, copy .mcp.json there."