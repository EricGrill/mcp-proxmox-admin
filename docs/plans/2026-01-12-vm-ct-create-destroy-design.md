# VM and Container Create/Destroy/Clone Design

## Overview

Add six new tools to MCP Proxmox Admin for creating, destroying, and cloning VMs and containers with full Proxmox parameter support.

## New Tools

| Tool | Purpose | Proxmox Command/API |
|------|---------|---------------------|
| `proxmox_vm_create` | Create new VM | `qm create` / POST `/nodes/{node}/qemu` |
| `proxmox_vm_destroy` | Destroy VM | `qm destroy` / DELETE `/nodes/{node}/qemu/{vmid}` |
| `proxmox_vm_clone` | Clone VM | `qm clone` / POST `/nodes/{node}/qemu/{vmid}/clone` |
| `proxmox_ct_create` | Create container | `pct create` / POST `/nodes/{node}/lxc` |
| `proxmox_ct_destroy` | Destroy container | `pct destroy` / DELETE `/nodes/{node}/lxc/{vmid}` |
| `proxmox_ct_clone` | Clone container | `pct clone` / POST `/nodes/{node}/lxc/{vmid}/clone` |

## Parameters

### proxmox_vm_create

**Required:**
- `node` - Target node name
- `vmid` - Unique VM ID (100-999999999)
- `name` - VM name

**Optional (common):**
- `memory` - RAM in MB (default: 2048)
- `cores` - CPU cores (default: 1)
- `sockets` - CPU sockets (default: 1)
- `cpu` - CPU type (default: "host")
- `storage` - Storage pool for primary disk
- `diskSize` - Primary disk size (e.g., "32G")
- `scsihw` - SCSI controller type
- `network` - Network configuration
- `bios` - "seabios" or "ovmf"
- `boot` - Boot order
- `iso` - ISO image path
- `ostype` - OS type hint
- `agent` - Enable QEMU guest agent
- `onboot` - Start on node boot
- `description` - VM description
- `tags` - Comma-separated tags

Additional parameters passed through to Proxmox API.

### proxmox_vm_destroy

**Required:**
- `node` - Node name
- `vmid` - VM ID
- `confirm` - Must be `true`

**Optional:**
- `purge` - Remove from backup jobs and HA (default: false)
- `destroyUnreferencedDisks` - Remove orphaned disks (default: true)

### proxmox_vm_clone

**Required:**
- `node` - Source node
- `vmid` - Source VM ID
- `newid` - Target VM ID

**Optional:**
- `name` - Name for clone
- `target` - Target node
- `full` - Full clone vs linked (default: true)
- `storage` - Target storage
- `format` - Disk format (raw, qcow2, vmdk)
- `description` - Description

### proxmox_ct_create

**Required:**
- `node` - Target node
- `vmid` - Container ID
- `ostemplate` - Template path

**Optional (common):**
- `hostname` - Container hostname
- `memory` - RAM in MB (default: 512)
- `swap` - Swap in MB (default: 512)
- `cores` - CPU cores (default: 1)
- `storage` - Storage pool for rootfs
- `rootfsSize` - Root filesystem size
- `network` - Network configuration
- `unprivileged` - Unprivileged container (default: true)
- `password` - Root password
- `sshKeys` - SSH public keys
- `onboot` - Start on node boot
- `start` - Start after creation
- `description` - Description
- `tags` - Tags

### proxmox_ct_destroy

**Required:**
- `node` - Node name
- `vmid` - Container ID
- `confirm` - Must be `true`

**Optional:**
- `purge` - Remove from backup jobs (default: false)
- `force` - Force destroy if running (default: false)

### proxmox_ct_clone

**Required:**
- `node` - Source node
- `vmid` - Source container ID
- `newid` - Target container ID

**Optional:**
- `hostname` - Hostname for clone
- `target` - Target node
- `full` - Full clone (default: true)
- `storage` - Target storage
- `description` - Description

## Safety Mechanisms

- Destroy operations require `confirm: true` parameter
- Destroy operations blocked when `config.safeMode` is enabled
- Follows existing pattern from snapshot deletion

## Implementation

### Files Modified

1. `src/types/proxmox.ts` - Config type definitions
2. `src/transports/types.ts` - Transport interface methods
3. `src/transports/api.ts` - REST API implementation
4. `src/transports/ssh.ts` - SSH command implementation
5. `src/index.ts` - Tool definitions and handlers

### Transport Selection

All tools use "write" operation type, defaulting to API transport in auto mode.
