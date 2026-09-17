"use strict";

const net = require("net");

let connected = false;
let currentConfig = null;
const managedSessions = new Set();

function registerSession(ses) {
  if (!ses) return;
  managedSessions.add(ses);

  if (connected && currentConfig) {
    applyProxy(ses, currentConfig).catch((error) => {
      console.warn("Could not apply existing proxy to new session:", error?.message || error);
    });
  }
}

function normalizeConfig(config = {}) {
  const type = config.type || "socks5";
  const host = String(config.host || "127.0.0.1").trim();
  const port = Number(config.port || 1080);

  if (!["socks5", "socks4", "http"].includes(type)) {
    throw new Error("Unsupported proxy type.");
  }

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid proxy host or port.");
  }

  return { type, host, port };
}

function testEndpoint(host, port, timeout = 1800) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => finish());
    socket.once("timeout", () => finish(new Error(`VPN/proxy endpoint ${host}:${port} timed out.`)));
    socket.once("error", (error) => finish(new Error(`Cannot reach ${host}:${port}. ${error.message}`)));
    socket.connect(port, host);
  });
}

async function applyProxy(ses, config) {
  if (!ses || !config) return;

  await ses.setProxy({
    mode: "fixed_servers",
    proxyRules: `${config.type}://${config.host}:${config.port}`,
    proxyBypassRules: "<local>"
  });

  try {
    await ses.closeAllConnections();
  } catch (_) {}
}

async function connectVPN(config = {}) {
  const normalized = normalizeConfig(config);

  // Fail early instead of showing "Connected" when nothing is
  // listening at the configured proxy endpoint.
  await testEndpoint(normalized.host, normalized.port);

  for (const ses of managedSessions) {
    await applyProxy(ses, normalized);
  }

  connected = true;
  currentConfig = normalized;

  return getVPNStatus();
}

async function disconnectVPN() {
  for (const ses of managedSessions) {
    try {
      await ses.setProxy({ mode: "direct" });
      await ses.closeAllConnections();
    } catch (error) {
      console.warn("Could not remove VPN proxy from a session:", error?.message || error);
    }
  }

  connected = false;
  currentConfig = null;
  return getVPNStatus();
}

function getVPNStatus() {
  return {
    connected,
    config: currentConfig,
    mode: connected ? "proxy" : "direct"
  };
}

module.exports = {
  registerSession,
  connectVPN,
  disconnectVPN,
  getVPNStatus
};
