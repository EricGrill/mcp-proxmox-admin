// src/index.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerVMTools,
  registerContainerTools,
} from "./index.js";
import type { Config } from "./config/index.js";
import type { Transport } from "./transports/types.js";
import type { TransportRouter } from "./transports/index.js";

// Mock transport
class MockTransport implements Transport {
  createVM = vi.fn();
  deleteVM = vi.fn();
  cloneVM = vi.fn();
  createContainer = vi.fn();
  deleteContainer = vi.fn();
  cloneContainer = vi.fn();

  // Required methods from Transport interface
  connect = vi.fn();
  disconnect = vi.fn();
  isConnected = vi.fn().mockReturnValue(true);
  executeCommand = vi.fn();
  apiRequest = vi.fn();
  listVMs = vi.fn();
  getVM = vi.fn();
  startVM = vi.fn();
  stopVM = vi.fn();
  shutdownVM = vi.fn();
  restartVM = vi.fn();
  listContainers = vi.fn();
  getContainer = vi.fn();
  startContainer = vi.fn();
  stopContainer = vi.fn();
  restartContainer = vi.fn();
  listNodes = vi.fn();
  getNodeStatus = vi.fn();
  listStorage = vi.fn();
  listSnapshots = vi.fn();
  createSnapshot = vi.fn();
  deleteSnapshot = vi.fn();
  restoreSnapshot = vi.fn();
}

// Mock router
class MockRouter implements TransportRouter {
  private transport: MockTransport;

  constructor() {
    this.transport = new MockTransport();
  }

  getTransport(): MockTransport {
    return this.transport;
  }

  connect = vi.fn();
  disconnect = vi.fn();
}

describe("Tool Handlers - VM Operations with Safety Checks", () => {
  let toolRegistry: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  let mockRouter: MockRouter;
  let mockTransport: MockTransport;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry = new Map();
    mockRouter = new MockRouter();
    mockTransport = mockRouter.getTransport();

    config = {
      host: "proxmox.example.com",
      port: 8006,
      apiTokenId: "user@pam!token",
      apiTokenSecret: "secret-token",
      sshPort: 22,
      sshUser: "root",
      defaultTransport: "api",
      verifySsl: false,
      timeout: 30000,
      safeMode: false,
    } as Config;
  });

  describe("proxmox_vm_create", () => {
    beforeEach(() => {
      registerVMTools(toolRegistry, mockRouter as any, config);
    });

    it("should create a VM successfully", async () => {
      mockTransport.createVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000000",
        message: "VM 100 creation initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_create");
      expect(handler).toBeDefined();

      const result = await handler!({
        node: "pve",
        vmid: 100,
        name: "test-vm",
        memory: 2048,
        cores: 2,
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000000",
        message: "VM 100 creation initiated",
      });

      expect(mockTransport.createVM).toHaveBeenCalledWith("pve", {
        vmid: 100,
        name: "test-vm",
        memory: 2048,
        cores: 2,
        sockets: undefined,
        cpu: undefined,
        storage: undefined,
        diskSize: undefined,
        scsihw: undefined,
        net0: undefined,
        bios: undefined,
        boot: undefined,
        iso: undefined,
        ostype: undefined,
        agent: undefined,
        onboot: undefined,
        start: undefined,
        description: undefined,
        tags: undefined,
      });
    });

    it("should create a VM with full configuration", async () => {
      mockTransport.createVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000001",
        message: "VM 101 creation initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_create");
      const result = await handler!({
        node: "pve",
        vmid: 101,
        name: "full-vm",
        memory: 4096,
        cores: 4,
        sockets: 2,
        cpu: "host",
        storage: "local-lvm",
        diskSize: "32G",
        scsihw: "virtio-scsi-pci",
        net0: "virtio,bridge=vmbr0",
        bios: "ovmf",
        boot: "order=scsi0",
        ostype: "l26",
        agent: "1",
        onboot: true,
        start: true,
        description: "Test VM",
        tags: "test;prod",
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.createVM).toHaveBeenCalled();
    });
  });

  describe("proxmox_vm_destroy with safety checks", () => {
    beforeEach(() => {
      registerVMTools(toolRegistry, mockRouter as any, config);
    });

    it("should reject VM destruction without confirm", async () => {
      const handler = toolRegistry.get("proxmox_vm_destroy");
      expect(handler).toBeDefined();

      await expect(handler!({
        node: "pve",
        vmid: 100,
        confirm: false,
      })).rejects.toThrow("Destruction requires confirm: true");

      expect(mockTransport.deleteVM).not.toHaveBeenCalled();
    });

    it("should reject VM destruction when confirm is missing", async () => {
      const handler = toolRegistry.get("proxmox_vm_destroy");

      await expect(handler!({
        node: "pve",
        vmid: 100,
      })).rejects.toThrow("Destruction requires confirm: true");

      expect(mockTransport.deleteVM).not.toHaveBeenCalled();
    });

    it("should reject VM destruction in safe mode", async () => {
      config.safeMode = true;
      registerVMTools(toolRegistry, mockRouter as any, config);

      const handler = toolRegistry.get("proxmox_vm_destroy");

      await expect(handler!({
        node: "pve",
        vmid: 100,
        confirm: true,
      })).rejects.toThrow("Destructive operations disabled in safe mode");

      expect(mockTransport.deleteVM).not.toHaveBeenCalled();
    });

    it("should destroy VM when confirm is true and safe mode is off", async () => {
      mockTransport.deleteVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000002",
        message: "VM 100 deletion initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_destroy");
      const result = await handler!({
        node: "pve",
        vmid: 100,
        confirm: true,
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000002",
        message: "VM 100 deletion initiated",
      });

      expect(mockTransport.deleteVM).toHaveBeenCalledWith("pve", 100, {
        vmid: 100,
        purge: undefined,
        destroyUnreferencedDisks: undefined,
      });
    });

    it("should destroy VM with purge option", async () => {
      mockTransport.deleteVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000003",
        message: "VM 101 deletion initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_destroy");
      const result = await handler!({
        node: "pve",
        vmid: 101,
        confirm: true,
        purge: true,
        destroyUnreferencedDisks: false,
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.deleteVM).toHaveBeenCalledWith("pve", 101, {
        vmid: 101,
        purge: true,
        destroyUnreferencedDisks: false,
      });
    });
  });

  describe("proxmox_vm_clone", () => {
    beforeEach(() => {
      registerVMTools(toolRegistry, mockRouter as any, config);
    });

    it("should clone a VM successfully", async () => {
      mockTransport.cloneVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000004",
        message: "VM 100 clone to 200 initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_clone");
      expect(handler).toBeDefined();

      const result = await handler!({
        node: "pve",
        vmid: 100,
        newid: 200,
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000004",
        message: "VM 100 clone to 200 initiated",
      });

      expect(mockTransport.cloneVM).toHaveBeenCalledWith("pve", {
        vmid: 100,
        newid: 200,
        name: undefined,
        target: undefined,
        full: undefined,
        storage: undefined,
        format: undefined,
        description: undefined,
      });
    });

    it("should clone a VM with full configuration", async () => {
      mockTransport.cloneVM.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000005",
        message: "VM 100 clone to 201 initiated",
      });

      const handler = toolRegistry.get("proxmox_vm_clone");
      const result = await handler!({
        node: "pve",
        vmid: 100,
        newid: 201,
        name: "cloned-vm",
        target: "pve2",
        full: true,
        storage: "local-lvm",
        format: "qcow2",
        description: "Clone test",
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.cloneVM).toHaveBeenCalledWith("pve", {
        vmid: 100,
        newid: 201,
        name: "cloned-vm",
        target: "pve2",
        full: true,
        storage: "local-lvm",
        format: "qcow2",
        description: "Clone test",
      });
    });
  });
});

describe("Tool Handlers - Container Operations with Safety Checks", () => {
  let toolRegistry: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  let mockRouter: MockRouter;
  let mockTransport: MockTransport;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry = new Map();
    mockRouter = new MockRouter();
    mockTransport = mockRouter.getTransport();

    config = {
      host: "proxmox.example.com",
      port: 8006,
      apiTokenId: "user@pam!token",
      apiTokenSecret: "secret-token",
      sshPort: 22,
      sshUser: "root",
      defaultTransport: "api",
      verifySsl: false,
      timeout: 30000,
      safeMode: false,
    } as Config;
  });

  describe("proxmox_ct_create", () => {
    beforeEach(() => {
      registerContainerTools(toolRegistry, mockRouter as any, config);
    });

    it("should create a container successfully", async () => {
      mockTransport.createContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000006",
        message: "Container 100 creation initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_create");
      expect(handler).toBeDefined();

      const result = await handler!({
        node: "pve",
        vmid: 100,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "test-ct",
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000006",
        message: "Container 100 creation initiated",
      });

      expect(mockTransport.createContainer).toHaveBeenCalledWith("pve", {
        vmid: 100,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "test-ct",
        memory: undefined,
        swap: undefined,
        cores: undefined,
        cpulimit: undefined,
        storage: undefined,
        rootfs: undefined,
        net0: undefined,
        nameserver: undefined,
        searchdomain: undefined,
        unprivileged: undefined,
        features: undefined,
        password: undefined,
        "ssh-public-keys": undefined,
        onboot: undefined,
        start: undefined,
        description: undefined,
        tags: undefined,
      });
    });

    it("should create a container with full configuration", async () => {
      mockTransport.createContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000007",
        message: "Container 101 creation initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_create");
      const result = await handler!({
        node: "pve",
        vmid: 101,
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
        hostname: "full-ct",
        memory: 1024,
        swap: 512,
        cores: 2,
        cpulimit: 1.5,
        storage: "local-lvm",
        rootfs: "8G",
        net0: "name=eth0,bridge=vmbr0,ip=dhcp",
        nameserver: "8.8.8.8",
        searchdomain: "example.com",
        unprivileged: true,
        features: "nesting=1",
        password: "secret",
        onboot: true,
        start: true,
        description: "Full CT",
        tags: "test;prod",
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.createContainer).toHaveBeenCalled();
    });
  });

  describe("proxmox_ct_destroy with safety checks", () => {
    beforeEach(() => {
      registerContainerTools(toolRegistry, mockRouter as any, config);
    });

    it("should reject container destruction without confirm", async () => {
      const handler = toolRegistry.get("proxmox_ct_destroy");
      expect(handler).toBeDefined();

      await expect(handler!({
        node: "pve",
        vmid: 100,
        confirm: false,
      })).rejects.toThrow("Destruction requires confirm: true");

      expect(mockTransport.deleteContainer).not.toHaveBeenCalled();
    });

    it("should reject container destruction when confirm is missing", async () => {
      const handler = toolRegistry.get("proxmox_ct_destroy");

      await expect(handler!({
        node: "pve",
        vmid: 100,
      })).rejects.toThrow("Destruction requires confirm: true");

      expect(mockTransport.deleteContainer).not.toHaveBeenCalled();
    });

    it("should reject container destruction in safe mode", async () => {
      config.safeMode = true;
      registerContainerTools(toolRegistry, mockRouter as any, config);

      const handler = toolRegistry.get("proxmox_ct_destroy");

      await expect(handler!({
        node: "pve",
        vmid: 100,
        confirm: true,
      })).rejects.toThrow("Destructive operations disabled in safe mode");

      expect(mockTransport.deleteContainer).not.toHaveBeenCalled();
    });

    it("should destroy container when confirm is true and safe mode is off", async () => {
      mockTransport.deleteContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000008",
        message: "Container 100 deletion initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_destroy");
      const result = await handler!({
        node: "pve",
        vmid: 100,
        confirm: true,
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000008",
        message: "Container 100 deletion initiated",
      });

      expect(mockTransport.deleteContainer).toHaveBeenCalledWith("pve", 100, {
        vmid: 100,
        purge: undefined,
        force: undefined,
      });
    });

    it("should destroy container with purge and force options", async () => {
      mockTransport.deleteContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000009",
        message: "Container 101 deletion initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_destroy");
      const result = await handler!({
        node: "pve",
        vmid: 101,
        confirm: true,
        purge: true,
        force: true,
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.deleteContainer).toHaveBeenCalledWith("pve", 101, {
        vmid: 101,
        purge: true,
        force: true,
      });
    });
  });

  describe("proxmox_ct_clone", () => {
    beforeEach(() => {
      registerContainerTools(toolRegistry, mockRouter as any, config);
    });

    it("should clone a container successfully", async () => {
      mockTransport.cloneContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000010",
        message: "Container 100 clone to 200 initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_clone");
      expect(handler).toBeDefined();

      const result = await handler!({
        node: "pve",
        vmid: 100,
        newid: 200,
      });

      expect(result).toEqual({
        success: true,
        taskId: "UPID:node:00000010",
        message: "Container 100 clone to 200 initiated",
      });

      expect(mockTransport.cloneContainer).toHaveBeenCalledWith("pve", {
        vmid: 100,
        newid: 200,
        hostname: undefined,
        target: undefined,
        full: undefined,
        storage: undefined,
        description: undefined,
      });
    });

    it("should clone a container with full configuration", async () => {
      mockTransport.cloneContainer.mockResolvedValue({
        success: true,
        taskId: "UPID:node:00000011",
        message: "Container 100 clone to 201 initiated",
      });

      const handler = toolRegistry.get("proxmox_ct_clone");
      const result = await handler!({
        node: "pve",
        vmid: 100,
        newid: 201,
        hostname: "cloned-ct",
        target: "pve2",
        full: true,
        storage: "local-lvm",
        description: "Clone test",
      });

      expect(result).toMatchObject({ success: true });
      expect(mockTransport.cloneContainer).toHaveBeenCalledWith("pve", {
        vmid: 100,
        newid: 201,
        hostname: "cloned-ct",
        target: "pve2",
        full: true,
        storage: "local-lvm",
        description: "Clone test",
      });
    });
  });
});
