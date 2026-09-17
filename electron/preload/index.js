"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserAPI", {
  uiReady: () => ipcRenderer.send("browser:ui-ready"),
  setBounds: (bounds) => ipcRenderer.send("browser:set-bounds", bounds),

  createTab: (options = {}) => ipcRenderer.send("browser:create-tab", options),
  activateTab: (id) => ipcRenderer.send("browser:activate-tab", id),
  closeTab: (id) => ipcRenderer.send("browser:close-tab", id),

  navigate: (id, url) => ipcRenderer.send("browser:navigate", { id, url }),
  back: (id) => ipcRenderer.send("browser:back", id),
  forward: (id) => ipcRenderer.send("browser:forward", id),
  reload: (id) => ipcRenderer.send("browser:reload", id),

  searchSuggestions: (query) => ipcRenderer.invoke("browser:search-suggestions", query),
  openExternal: (url) => ipcRenderer.send("browser:open-external", url),
  clearSession: () => ipcRenderer.invoke("browser:clear-session"),

  vpnStatus: () => ipcRenderer.invoke("browser:vpn-status"),
  vpnConnect: (config) => ipcRenderer.invoke("browser:vpn-connect", config),
  vpnDisconnect: () => ipcRenderer.invoke("browser:vpn-disconnect"),

  onTabs: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("browser:tabs", listener);
    return () => ipcRenderer.removeListener("browser:tabs", listener);
  },

  onTabState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("browser:tab-state", listener);
    return () => ipcRenderer.removeListener("browser:tab-state", listener);
  },

  onLoadError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("browser:load-error", listener);
    return () => ipcRenderer.removeListener("browser:load-error", listener);
  }
});
