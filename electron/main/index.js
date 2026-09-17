"use strict";

const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  shell
} = require("electron");
const path = require("path");
const { enableForSession } = require("../privacy/FilterEngine");
const {
  registerSession,
  connectVPN,
  disconnectVPN,
  getVPNStatus
} = require("../vpn/VPNManager");
const fetch = require("cross-fetch");

let mainWindow = null;
let uiReady = false;
let contentBounds = { x: 0, y: 102, width: 1200, height: 700 };
const tabs = new Map();
let activeTabId = null;
const HOME_URL = "private://newtab";

const initializedSessions = new WeakSet();
const initializingSessions = new WeakMap();

async function installPrivacyProtection(ses) {
  if (!ses) throw new Error("Electron session is required.");
  if (initializedSessions.has(ses)) return;
  if (initializingSessions.has(ses)) return initializingSessions.get(ses);

  const promise = (async () => {
    try {
      // VPN manager only tracks sessions. It does not install ad blockers.
      registerSession(ses);
      await enableForSession(ses);

      ses.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === "fullscreen");
      });

      ses.setPermissionCheckHandler((_wc, permission) => {
        return permission === "fullscreen";
      });

      initializedSessions.add(ses);
      console.log("Privacy protection initialized for session.");
    } catch (error) {
      console.error("Filter engine failed:", error?.message || error);
    } finally {
      initializingSessions.delete(ses);
    }
  })();

  initializingSessions.set(ses, promise);
  return promise;
}

function send(channel, payload) {
  if (uiReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function tabState(tab) {
  const wc = tab.view.webContents;
  return {
    id: tab.id,
    title: tab.title || wc.getTitle() || "New Tab",
    url: tab.url || wc.getURL() || HOME_URL,
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    private: tab.private,
    audible: Boolean(tab.audible)
  };
}

function sendTabState(tab) {
  if (tab) send("browser:tab-state", tabState(tab));
}

function sendAllTabs() {
  send("browser:tabs", {
    tabs: [...tabs.values()].map(tabState),
    activeTabId
  });
}

function setViewBounds(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (tab.id === activeTabId) {
    tab.view.setBounds(contentBounds);
    tab.view.setVisible(true);
  } else {
    tab.view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
    tab.view.setVisible(false);
  }
}

function updateAllViewBounds() {
  for (const tab of tabs.values()) setViewBounds(tab);
}

function navigateTab(tab, url) {
  if (!tab) return;

  if (!url || url === HOME_URL) {
    tab.url = HOME_URL;
    tab.title = "New Tab";
    tab.view.setVisible(false);
    sendTabState(tab);
    return;
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return;
  } catch {
    return;
  }

  tab.url = url;
  tab.view.webContents.loadURL(url);
  tab.view.setVisible(tab.id === activeTabId);
  sendTabState(tab);
}

function createTab({ id, privateMode = true, url = HOME_URL } = {}) {
  const tabId = id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ses = session.fromPartition(`private-${tabId}`, { cache: false });

  void installPrivacyProtection(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      backgroundThrottling: false
    }
  });

  const tab = {
    id: tabId,
    view,
    private: privateMode,
    url: HOME_URL,
    title: "New Tab",
    audible: false
  };

  tabs.set(tabId, tab);
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);

  const wc = view.webContents;

  wc.on("did-start-loading", () => {
    tab.url = wc.getURL() || tab.url;
    sendTabState(tab);
  });

  wc.on("did-stop-loading", () => {
    tab.url = wc.getURL() || tab.url;
    tab.title = wc.getTitle() || tab.title || "New Tab";
    sendTabState(tab);
  });

  wc.on("did-navigate", (_event, navigatedUrl) => {
    tab.url = navigatedUrl;
    tab.title = wc.getTitle() || tab.title;
    sendTabState(tab);
    sendAllTabs();
  });

  wc.on("did-navigate-in-page", (_event, navigatedUrl) => {
    tab.url = navigatedUrl;
    sendTabState(tab);
  });

  wc.on("audio-state-changed", (_event, audible) => {
    tab.audible = Boolean(audible);
    sendTabState(tab);
    sendAllTabs();
  });

  wc.on("page-title-updated", (_event, title) => {
    tab.title = title || "New Tab";
    sendTabState(tab);
  });

  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    tab.title = "Page failed to load";
    tab.url = validatedURL || tab.url;
    send("browser:load-error", {
      id: tab.id,
      errorCode,
      errorDescription,
      url: validatedURL
    });
    sendTabState(tab);
  });

  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    const newId = createTab({ privateMode: tab.private, url: HOME_URL });
    activeTabId = newId;
    updateAllViewBounds();
    if (popupUrl) navigateTab(tabs.get(newId), popupUrl);
    sendAllTabs();
    return { action: "deny" };
  });

  if (url !== HOME_URL) navigateTab(tab, url);
  return tabId;
}

function activateTab(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  updateAllViewBounds();
  sendAllTabs();
  sendTabState(tabs.get(id));
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;

  const ids = [...tabs.keys()];
  const index = ids.indexOf(id);
  tabs.delete(id);

  try { tab.view.webContents.close(); } catch (_) {}

  if (tabs.size === 0) {
    activeTabId = createTab();
  } else if (activeTabId === id) {
    activeTabId = ids[index + 1] || ids[index - 1] || [...tabs.keys()][0];
  }

  updateAllViewBounds();
  sendAllTabs();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0e14",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));

  // Helps diagnose renderer IPC errors without crashing Electron.
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  mainWindow.on("resize", () => updateAllViewBounds());
  mainWindow.on("closed", () => {
    mainWindow = null;
    uiReady = false;
  });
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on("browser:ui-ready", () => {
    uiReady = true;
    if (tabs.size === 0) activeTabId = createTab();
    updateAllViewBounds();
    sendAllTabs();
  });

  ipcMain.handle("browser:vpn-status", async () => getVPNStatus());

  ipcMain.handle("browser:vpn-connect", async (_event, config) => {
    try {
      return await connectVPN(config);
    } catch (error) {
      console.error("VPN/proxy connection failed:", error);
      return {
        connected: false,
        error: error?.message || "VPN/proxy connection failed"
      };
    }
  });

  ipcMain.handle("browser:vpn-disconnect", async () => {
    try {
      return await disconnectVPN();
    } catch (error) {
      console.error("VPN/proxy disconnect failed:", error);
      return {
        connected: false,
        error: error?.message || "VPN/proxy disconnect failed"
      };
    }
  });

  ipcMain.on("browser:set-bounds", (_event, bounds) => {
    if (!bounds) return;
    contentBounds = {
      x: Math.max(0, Number(bounds.x) || 0),
      y: Math.max(0, Number(bounds.y) || 102),
      width: Math.max(1, Number(bounds.width) || 1),
      height: Math.max(1, Number(bounds.height) || 1)
    };
    updateAllViewBounds();
  });

  ipcMain.on("browser:create-tab", (_event, options = {}) => {
    const id = createTab({ privateMode: options.privateMode !== false });
    activeTabId = id;
    updateAllViewBounds();
    sendAllTabs();
  });

  ipcMain.on("browser:activate-tab", (_event, id) => activateTab(id));
  ipcMain.on("browser:close-tab", (_event, id) => closeTab(id));

  ipcMain.on("browser:navigate", (_event, { id, url }) => {
    const tab = tabs.get(id);
    if (tab) navigateTab(tab, url);
  });

  ipcMain.on("browser:back", (_event, id) => {
    const tab = tabs.get(id);
    if (tab?.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack();
    }
  });

  ipcMain.on("browser:forward", (_event, id) => {
    const tab = tabs.get(id);
    if (tab?.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward();
    }
  });

  ipcMain.on("browser:reload", (_event, id) => {
    const tab = tabs.get(id);
    if (tab) tab.view.webContents.reload();
  });

  ipcMain.on("browser:open-external", (_event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        shell.openExternal(url);
      }
    } catch (_) {}
  });

  ipcMain.handle("browser:clear-session", async () => {
    for (const tab of tabs.values()) {
      try {
        await tab.view.webContents.session.clearStorageData();
      } catch (_) {}
    }
    return true;
  });

  ipcMain.handle("browser:search-suggestions", async (_event, query) => {
    const value = String(query || "").trim();
    if (value.length < 2) return [];

    try {
      const response = await fetch(
        "https://suggestqueries.google.com/complete/search?client=firefox&q=" +
        encodeURIComponent(value)
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.[1]) ? data[1].slice(0, 8) : [];
    } catch (_) {
      return [];
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
