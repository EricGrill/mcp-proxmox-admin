# mcp-proxmox-admin

MCP server for Proxmox VE administration - manage VMs, containers, and infrastructure through Claude.

## Features

- Full VM lifecycle management (start, stop, shutdown, restart)
- Container (LXC) management
- Node and cluster status monitoring
- Storage pool information
- Snapshot management (create, restore, delete)
- Hybrid SSH + API transport (user-configurable)
- Works with Claude Desktop, Cursor, and other MCP clients

## Quick Start

1. Install: `npm install -g mcp-proxmox-admin`
2. Configure environment variables or config file
3. Add to Claude Desktop config
4. Verify with "List my Proxmox VMs"

## Installation

### Global Installation

```bash
npm install -g mcp-proxmox-admin
```

### Local Installation

```bash
npm install mcp-proxmox-admin
```

### From Source

```bash
git clone https://github.com/your-org/mcp-proxmox-admin.git
cd mcp-proxmox-admin
npm install
npm run build
```

## Configuration

### Priority Order

Configuration is loaded with the following priority (highest to lowest):

1. MCP client settings (environment variables in Claude Desktop config)
2. Environment variables
3. `proxmox-config.json` file in working directory

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROXMOX_HOST` | Proxmox host/IP address | (required) |
| `PROXMOX_PORT` | API port | `8006` |
| `PROXMOX_API_TOKEN_ID` | API token ID (format: `user@realm!tokenid`) | |
| `PROXMOX_API_TOKEN_SECRET` | API token secret | |
| `PROXMOX_VERIFY_SSL` | Verify SSL certificates | `true` |
| `PROXMOX_SSH_USER` | SSH username | |
| `PROXMOX_SSH_PORT` | SSH port | `22` |
| `PROXMOX_SSH_KEY_PATH` | Path to SSH private key | |
| `PROXMOX_SSH_PASSWORD` | SSH password (alternative to key) | |
| `PROXMOX_DEFAULT_TRANSPORT` | Default transport: `ssh`, `api`, or `auto` | `auto` |
| `PROXMOX_DEFAULT_NODE` | Default node name | |
| `PROXMOX_TIMEOUT` | Request timeout in milliseconds | `30000` |
| `PROXMOX_SAFE_MODE` | Disable destructive operations | `false` |

### Config File

Create `proxmox-config.json` in the working directory:

```json
{
  "host": "192.168.1.100",
  "port": 8006,
  "apiTokenId": "user@pam!mytoken",
  "apiTokenSecret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "verifySsl": true,
  "sshUser": "root",
  "sshPort": 22,
  "sshKeyPath": "~/.ssh/id_rsa",
  "defaultTransport": "auto",
  "defaultNode": "pve",
  "timeout": 30000
}
```

### Authentication Options

#### API Token (Recommended)

1. In Proxmox, go to Datacenter > Permissions > API Tokens
2. Create a new token for your user
3. Assign appropriate permissions (PVEVMAdmin for full VM control)
4. Configure the token ID and secret in your config

#### SSH Key

1. Generate an SSH key pair if you don't have one: `ssh-keygen -t ed25519`
2. Copy your public key to Proxmox: `ssh-copy-id root@proxmox-host`
3. Configure the SSH key path in your config

### Transport Modes

| Mode | Description |
|------|-------------|
| `auto` | Automatically selects the best transport based on operation and availability |
| `api` | Uses Proxmox REST API exclusively |
| `ssh` | Uses SSH commands exclusively |

In `auto` mode, the server prefers API for read operations and SSH for write operations when both are available.

## Available Tools

| Tool | Description |
|------|-------------|
| `proxmox_vm_list` | List all virtual machines across all nodes or on a specific node |
| `proxmox_vm_start` | Start a virtual machine |
| `proxmox_vm_stop` | Stop a virtual machine immediately (hard stop) |
| `proxmox_vm_shutdown` | Gracefully shutdown a virtual machine (ACPI signal) |
| `proxmox_vm_restart` | Restart a virtual machine |
| `proxmox_ct_list` | List all LXC containers across all nodes or on a specific node |
| `proxmox_ct_start` | Start an LXC container |
| `proxmox_ct_stop` | Stop an LXC container immediately |
| `proxmox_ct_restart` | Restart an LXC container |
| `proxmox_node_list` | List all nodes in the Proxmox cluster |
| `proxmox_node_status` | Get detailed status of a specific node |
| `proxmox_storage_list` | List all storage resources across nodes |
| `proxmox_snapshot_list` | List all snapshots for a VM or container |
| `proxmox_snapshot_create` | Create a snapshot of a VM or container |
| `proxmox_snapshot_restore` | Restore a VM or container to a previous snapshot |
| `proxmox_snapshot_delete` | Delete a snapshot from a VM or container |

## Examples

### List VMs

Ask Claude: "Show me all running VMs on my Proxmox cluster"

### Start a VM

Ask Claude: "Start VM 100 on node pve"

### Stop a VM

Ask Claude: "Stop VM 102 immediately"

### Graceful Shutdown

Ask Claude: "Gracefully shutdown VM 101"

### Create Snapshot

Ask Claude: "Create a snapshot of VM 100 named 'before-upgrade' with description 'Snapshot before system upgrade'"

### List Snapshots

Ask Claude: "Show me all snapshots for VM 100 on node pve"

### Restore Snapshot

Ask Claude: "Restore VM 100 to snapshot 'before-upgrade'"

### Delete Snapshot

Ask Claude: "Delete the 'old-snapshot' snapshot from VM 100"

### Container Management

Ask Claude: "List all LXC containers on my cluster"

Ask Claude: "Start container 200 on node pve"

### Node Status

Ask Claude: "What's the status of node pve? Show me CPU and memory usage"

### Storage Information

Ask Claude: "List all storage pools and their available space"

## Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "npx",
      "args": ["mcp-proxmox-admin"],
      "env": {
        "PROXMOX_HOST": "192.168.1.100",
        "PROXMOX_API_TOKEN_ID": "user@pam!mytoken",
        "PROXMOX_API_TOKEN_SECRET": "your-secret-here",
        "PROXMOX_SSH_USER": "root",
        "PROXMOX_SSH_KEY_PATH": "~/.ssh/id_rsa",
        "PROXMOX_DEFAULT_TRANSPORT": "auto"
      }
    }
  }
}
```

See `examples/claude-desktop-config.json` for a complete example.

## Safe Mode

Enable safe mode to prevent destructive operations:

```bash
PROXMOX_SAFE_MODE=true
```

In safe mode, the following operations are disabled:
- Snapshot deletion

This is useful for read-only monitoring scenarios.

## Error Handling

The server provides descriptive error messages for common issues:

- **Connection errors**: Check host, port, and network connectivity
- **Authentication errors**: Verify API token or SSH credentials
- **Permission errors**: Ensure the user has appropriate Proxmox permissions
- **Resource not found**: Verify VM/container ID and node name

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

### Development Mode

```bash
npm run dev
```

## Troubleshooting

### Cannot connect to Proxmox

1. Verify the host and port are correct
2. Check network connectivity: `ping <proxmox-host>`
3. Verify the API is accessible: `curl -k https://<proxmox-host>:8006/api2/json`

### Authentication Failed

1. For API tokens, verify the token ID format: `user@realm!tokenid`
2. Ensure the token has not expired
3. For SSH, verify key permissions: `chmod 600 ~/.ssh/id_rsa`

### Permission Denied

Ensure your Proxmox user has the necessary permissions:
- `VM.PowerMgmt` for start/stop/restart
- `VM.Snapshot` for snapshot operations
- `Sys.Audit` for node and storage information

### SSL Certificate Errors

For self-signed certificates, either:
- Set `PROXMOX_VERIFY_SSL=false` (not recommended for production)
- Add your Proxmox CA to system trust store

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit your changes: `git commit -m 'Add my feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Open a Pull Request

## License

MIT
