// src/types/proxmox.ts
export interface VMStatus {
  vmid: number;
  name: string;
  status: "running" | "stopped" | "paused";
  node: string;
  cpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  template: boolean;
}

export interface ContainerStatus {
  vmid: number;
  name: string;
  status: "running" | "stopped";
  node: string;
  cpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  template: boolean;
}

export interface NodeStatus {
  node: string;
  status: "online" | "offline";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface StorageInfo {
  storage: string;
  type: string;
  content: string;
  active: boolean;
  enabled: boolean;
  shared: boolean;
  total: number;
  used: number;
  avail: number;
}

export interface Snapshot {
  name: string;
  description: string;
  snaptime?: number;
  parent?: string;
}

export interface TaskResult {
  success: boolean;
  taskId?: string;
  message?: string;
  data?: unknown;
}

// VM Creation Config
export interface VMCreateConfig {
  // Required
  vmid: number;
  name: string;

  // Core hardware
  memory?: number;
  cores?: number;
  sockets?: number;
  cpu?: string;

  // Storage
  storage?: string;
  diskSize?: string;
  scsihw?: string;

  // Network (string format: "virtio,bridge=vmbr0")
  net0?: string;

  // Boot/BIOS
  bios?: "seabios" | "ovmf";
  boot?: string;
  cdrom?: string;
  iso?: string;

  // OS
  ostype?: string;

  // Agent/Features
  agent?: string;

  // Behavior
  onboot?: boolean;
  protection?: boolean;
  start?: boolean;

  // Metadata
  description?: string;
  tags?: string;

  // Additional parameters passed through to Proxmox
  [key: string]: unknown;
}

// VM Clone Config
export interface VMCloneConfig {
  vmid: number;
  newid: number;
  name?: string;
  target?: string;
  full?: boolean;
  storage?: string;
  format?: "raw" | "qcow2" | "vmdk";
  description?: string;
}

// VM Delete Config
export interface VMDeleteConfig {
  vmid: number;
  purge?: boolean;
  destroyUnreferencedDisks?: boolean;
}

// Container Creation Config
export interface ContainerCreateConfig {
  // Required
  vmid: number;
  ostemplate: string;

  // Core resources
  hostname?: string;
  memory?: number;
  swap?: number;
  cores?: number;
  cpulimit?: number;

  // Storage
  storage?: string;
  rootfs?: string;

  // Network (string format: "name=eth0,bridge=vmbr0,ip=dhcp")
  net0?: string;
  nameserver?: string;
  searchdomain?: string;

  // Security
  unprivileged?: boolean;
  features?: string;
  password?: string;
  "ssh-public-keys"?: string;

  // Behavior
  onboot?: boolean;
  protection?: boolean;
  start?: boolean;

  // Metadata
  description?: string;
  tags?: string;

  // Additional parameters passed through to Proxmox
  [key: string]: unknown;
}

// Container Clone Config
export interface ContainerCloneConfig {
  vmid: number;
  newid: number;
  hostname?: string;
  target?: string;
  full?: boolean;
  storage?: string;
  description?: string;
}

// Container Delete Config
export interface ContainerDeleteConfig {
  vmid: number;
  purge?: boolean;
  force?: boolean;
}
