// src/transports/ssh.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SSHTransport } from "./ssh.js";
import type { Config } from "../config/index.js";

// Mock ssh2
vi.mock("ssh2", () => {
  const mockExec = vi.fn();
  const mockConnect = vi.fn();
  const mockEnd = vi.fn();
  const mockOn = vi.fn();

  class MockClient {
    exec = mockExec;
    connect = mockConnect;
    end = mockEnd;
    on = mockOn;
  }

  return { Client: MockClient };
});

describe("SSHTransport", () => {
  const baseConfig: Config = {
    host: "192.168.1.100",
    port: 8006,
    sshUser: "root",
    sshPort: 22,
    sshKeyPath: "/home/user/.ssh/id_rsa",
    defaultTransport: "ssh",
    verifySsl: true,
    timeout: 30000,
    safeMode: false,
  };

  it("creates instance with config", () => {
    const transport = new SSHTransport(baseConfig);
    expect(transport).toBeInstanceOf(SSHTransport);
  });

  it("isConnected returns false initially", () => {
    const transport = new SSHTransport(baseConfig);
    expect(transport.isConnected()).toBe(false);
  });

  it("parseVMListOutput parses qm list output", () => {
    const transport = new SSHTransport(baseConfig);
    const output = `      VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID
       100 ubuntu-server        running    4096              32.00 12345
       101 windows-desktop      stopped    8192              64.00 0`;

    const result = transport.parseVMListOutput(output, "pve");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      vmid: 100,
      name: "ubuntu-server",
      status: "running",
      node: "pve",
    });
    expect(result[1]).toMatchObject({
      vmid: 101,
      name: "windows-desktop",
      status: "stopped",
      node: "pve",
    });
  });

  it("parseContainerListOutput parses pct list output", () => {
    const transport = new SSHTransport(baseConfig);
    const output = `VMID       Status     Lock         Name
100        running                 ubuntu-container
101        stopped                 debian-container`;

    const result = transport.parseContainerListOutput(output, "pve");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      vmid: 100,
      name: "ubuntu-container",
      status: "running",
      node: "pve",
    });
    expect(result[1]).toMatchObject({
      vmid: 101,
      name: "debian-container",
      status: "stopped",
      node: "pve",
    });
  });

  it("parseSnapshotListOutput parses snapshot list output", () => {
    const transport = new SSHTransport(baseConfig);
    const output = `[
  {"name": "snap1", "description": "First snapshot", "snaptime": 1700000000},
  {"name": "snap2", "description": "Second snapshot", "snaptime": 1700001000}
]`;

    const result = transport.parseSnapshotListOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "snap1",
      description: "First snapshot",
      snaptime: 1700000000,
    });
  });

  it("handles empty VM list output", () => {
    const transport = new SSHTransport(baseConfig);
    const output = `      VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID`;

    const result = transport.parseVMListOutput(output, "pve");
    expect(result).toHaveLength(0);
  });

  it("handles empty container list output", () => {
    const transport = new SSHTransport(baseConfig);
    const output = `VMID       Status     Lock         Name`;

    const result = transport.parseContainerListOutput(output, "pve");
    expect(result).toHaveLength(0);
  });
});

describe("SSHTransport - VM Create/Destroy/Clone Operations", () => {
  let transport: SSHTransport;
  let mockExecute: any;

  const baseConfig: Config = {
    host: "192.168.1.100",
    port: 8006,
    sshUser: "root",
    sshPort: 22,
    sshPassword: "password",
    defaultTransport: "ssh",
    verifySsl: true,
    timeout: 30000,
    safeMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SSHTransport(baseConfig);

    // Mock executeCommand
    mockExecute = vi.spyOn(transport, "executeCommand");
  });

  describe("createVM", () => {
    it("should create a VM with basic configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM 100 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createVM("pve", {
        vmid: 100,
        name: "test-vm",
        memory: 2048,
        cores: 2,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("VM 100 created");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("qm create 100 --name test-vm --memory 2048 --cores 2")
      );
    });

    it("should create a VM with full configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM 101 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createVM("pve", {
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

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("qm create 101")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--name full-vm")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--memory 4096")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--cores 4")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--sockets 2")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--scsi0 local-lvm:32G")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--bios ovmf")
      );
    });

    it("should create a VM with ISO configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM 102 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createVM("pve", {
        vmid: 102,
        name: "iso-vm",
        iso: "local:iso/debian-12.iso",
        storage: "local-lvm",
        diskSize: "20G",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--ide2 local:iso/debian-12.iso,media=cdrom")
      );
    });

    it("should handle VM creation errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "VM ID already exists",
        exitCode: 1,
      });

      const result = await transport.createVM("pve", {
        vmid: 103,
        name: "error-vm",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("VM ID already exists");
    });
  });

  describe("deleteVM", () => {
    it("should delete a VM with default options", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteVM("pve", 100);

      expect(result.success).toBe(true);
      expect(result.message).toContain("VM 100 destroyed");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("qm destroy 100 --destroy-unreferenced-disks")
      );
    });

    it("should delete a VM with purge option", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteVM("pve", 101, {
        vmid: 101,
        purge: true,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--purge")
      );
    });

    it("should delete a VM without destroying unreferenced disks", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "VM destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteVM("pve", 102, {
        vmid: 102,
        destroyUnreferencedDisks: false,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.not.stringContaining("--destroy-unreferenced-disks")
      );
    });

    it("should handle VM deletion errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "VM not found",
        exitCode: 1,
      });

      const result = await transport.deleteVM("pve", 999);

      expect(result.success).toBe(false);
      expect(result.message).toContain("VM not found");
    });
  });

  describe("cloneVM", () => {
    it("should clone a VM with basic configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneVM("pve", {
        vmid: 100,
        newid: 200,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("VM 100 cloned to 200");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("qm clone 100 200")
      );
    });

    it("should clone a VM with full configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneVM("pve", {
        vmid: 100,
        newid: 201,
        name: "cloned-vm",
        full: true,
        storage: "local-lvm",
        format: "qcow2",
        description: "Clone test",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--full")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--storage local-lvm")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--format qcow2")
      );
    });

    it("should clone a VM to different target node", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneVM("pve", {
        vmid: 100,
        newid: 202,
        target: "pve2",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--target pve2")
      );
    });

    it("should create linked clone when full is false", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneVM("pve", {
        vmid: 100,
        newid: 203,
        full: false,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.not.stringContaining("--full")
      );
    });

    it("should handle VM clone errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Source VM not found",
        exitCode: 1,
      });

      const result = await transport.cloneVM("pve", {
        vmid: 100,
        newid: 999,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Source VM not found");
    });
  });
});

describe("SSHTransport - Container Create/Destroy/Clone Operations", () => {
  let transport: SSHTransport;
  let mockExecute: any;

  const baseConfig: Config = {
    host: "192.168.1.100",
    port: 8006,
    sshUser: "root",
    sshPort: 22,
    sshPassword: "password",
    defaultTransport: "ssh",
    verifySsl: true,
    timeout: 30000,
    safeMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SSHTransport(baseConfig);

    // Mock executeCommand
    mockExecute = vi.spyOn(transport, "executeCommand");
  });

  describe("createContainer", () => {
    it("should create a container with basic configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container 100 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createContainer("pve", {
        vmid: 100,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "test-ct",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Container 100 created");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--hostname test-ct")
      );
    });

    it("should create a container with full configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container 101 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createContainer("pve", {
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

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--memory 1024")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--swap 512")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--cores 2")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--rootfs local-lvm:8G")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--unprivileged 1")
      );
    });

    it("should create a container with SSH keys", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container 102 created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.createContainer("pve", {
        vmid: 102,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "ssh-ct",
        "ssh-public-keys": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB...",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('--ssh-public-keys "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB..."')
      );
    });

    it("should handle container creation errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Template not found",
        exitCode: 1,
      });

      const result = await transport.createContainer("pve", {
        vmid: 103,
        ostemplate: "invalid-template",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Template not found");
    });
  });

  describe("deleteContainer", () => {
    it("should delete a container with default options", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteContainer("pve", 100);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Container 100 destroyed");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("pct destroy 100")
      );
    });

    it("should delete a container with purge option", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteContainer("pve", 101, {
        vmid: 101,
        purge: true,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--purge")
      );
    });

    it("should delete a container with force option", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteContainer("pve", 102, {
        vmid: 102,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--force")
      );
    });

    it("should delete a container with both purge and force", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Container destroyed",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.deleteContainer("pve", 103, {
        vmid: 103,
        purge: true,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--purge")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--force")
      );
    });

    it("should handle container deletion errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Container not found",
        exitCode: 1,
      });

      const result = await transport.deleteContainer("pve", 999);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Container not found");
    });
  });

  describe("cloneContainer", () => {
    it("should clone a container with basic configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneContainer("pve", {
        vmid: 100,
        newid: 200,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Container 100 cloned to 200");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("pct clone 100 200")
      );
    });

    it("should clone a container with full configuration", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneContainer("pve", {
        vmid: 100,
        newid: 201,
        hostname: "cloned-ct",
        full: true,
        storage: "local-lvm",
        description: "Clone test",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--hostname cloned-ct")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--full")
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--storage local-lvm")
      );
    });

    it("should clone a container to different target node", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneContainer("pve", {
        vmid: 100,
        newid: 202,
        target: "pve2",
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("--target pve2")
      );
    });

    it("should create linked clone when full is false", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        stdout: "Clone created",
        stderr: "",
        exitCode: 0,
      });

      const result = await transport.cloneContainer("pve", {
        vmid: 100,
        newid: 203,
        full: false,
      });

      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.not.stringContaining("--full")
      );
    });

    it("should handle container clone errors", async () => {
      mockExecute.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Source container not found",
        exitCode: 1,
      });

      const result = await transport.cloneContainer("pve", {
        vmid: 100,
        newid: 999,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Source container not found");
    });
  });
});
