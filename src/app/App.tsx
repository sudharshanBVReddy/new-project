import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Lock,
  Plus,
  RotateCw,
  Search,
  Settings,
  Shield,
  Wifi,
  X
} from "lucide-react";
import NewTab from "../pages/NewTab";
import PrivacyPanel from "../components/privacy/PrivacyPanel";

const HOME = "private://newtab";

export default function App() {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vpnOpen, setVpnOpen] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnError, setVpnError] = useState("");
  const [bookmarked, setBookmarked] = useState<string[]>([]);
  const [vpnConfig, setVpnConfig] = useState<VPNConfig>({
    type: "socks5",
    host: "127.0.0.1",
    port: 1080
  });
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const chromeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const removeTabs = window.browserAPI.onTabs((payload) => {
      setTabs(payload.tabs || []);
      setActiveTabId(payload.activeTabId || "");
    });

    const removeState = window.browserAPI.onTabState((tab) => {
      setTabs((old) => {
        const exists = old.some((x) => x.id === tab.id);
        return exists
          ? old.map((x) => (x.id === tab.id ? tab : x))
          : [...old, tab];
      });
    });

    const removeError = window.browserAPI.onLoadError((error) => {
      console.error("Page load error:", error);
    });

    window.browserAPI.uiReady();

    window.browserAPI
      .vpnStatus()
      .then((status) => {
        setVpnConnected(Boolean(status.connected));
        if (status.config) setVpnConfig(status.config);
      })
      .catch(() => {});

    return () => {
      removeTabs();
      removeState();
      removeError();
    };
  }, []);

  useEffect(() => {
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active) {
      setAddress(active.url === HOME ? "" : active.url);
      setSuggestions([]);
      setSelectedSuggestion(-1);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    const query = address.trim();

    if (
      !query ||
      query.length < 2 ||
      /^https?:\/\//i.test(query) ||
      query === HOME
    ) {
      setSuggestions([]);
      setSuggestionLoading(false);
      setSelectedSuggestion(-1);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setSuggestionLoading(true);

      try {
        const result = await window.browserAPI.searchSuggestions(query);
        if (!cancelled) {
          setSuggestions(result || []);
          setSelectedSuggestion(-1);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address]);

  useLayoutEffect(() => {
    function resize() {
      const rect = chromeRef.current?.getBoundingClientRect();
      if (!rect) return;

      window.browserAPI.setBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.bottom),
        width: Math.round(window.innerWidth - rect.left),
        height: Math.round(window.innerHeight - rect.bottom)
      });
    }

    resize();
    window.addEventListener("resize", resize);

    const observer = new ResizeObserver(resize);
    if (chromeRef.current) observer.observe(chromeRef.current);

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, [vpnOpen, settingsOpen]);

  function resolveNavigation(raw: string) {
    const value = raw.trim();
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) return value;

    if (
      value.includes(".") &&
      !value.includes(" ") &&
      !value.startsWith(".")
    ) {
      return `https://${value}`;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }

  function navigate(raw: string) {
    const value = raw.trim();
    if (!value || !activeTabId) return;

    const url = resolveNavigation(value);
    if (!url) return;

    setAddress(url);
    setSuggestions([]);
    setSelectedSuggestion(-1);
    window.browserAPI.navigate(activeTabId, url);
  }

  function selectSuggestion(value: string) {
    // Suggestions are search queries. Navigate immediately instead of
    // putting the text back through the address-bar parser as a URL.
    const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
    setAddress(url);
    setSuggestions([]);
    setSelectedSuggestion(-1);

    if (activeTabId) {
      window.browserAPI.navigate(activeTabId, url);
    }
  }

  function onAddressKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSuggestion((old) =>
        old < suggestions.length - 1 ? old + 1 : 0
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSuggestion((old) =>
        old > 0 ? old - 1 : suggestions.length - 1
      );
      return;
    }

    if (event.key === "Enter" && selectedSuggestion >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[selectedSuggestion]);
    }

    if (event.key === "Escape") {
      setSuggestions([]);
      setSelectedSuggestion(-1);
    }
  }

  function newTab(privateMode = true) {
    window.browserAPI.createTab({ privateMode });
  }

  function closeTab(id: string) {
    window.browserAPI.closeTab(id);
  }

  const current = tabs.find((tab) => tab.id === activeTabId);

  async function connectVPN() {
    setVpnLoading(true);
    setVpnError("");

    try {
      const result = await window.browserAPI.vpnConnect({
        ...vpnConfig,
        port: Number(vpnConfig.port)
      });

      if (result.connected) {
        setVpnConnected(true);
        if (result.config) setVpnConfig(result.config);
      } else {
        setVpnConnected(false);
        setVpnError(
          result.error ||
          "Unable to reach the configured VPN/proxy endpoint."
        );
      }
    } catch (error: any) {
      setVpnConnected(false);
      setVpnError(
        error?.message ||
        "Unable to connect to the VPN/proxy."
      );
    } finally {
      setVpnLoading(false);
    }
  }

  async function disconnectVPN() {
    setVpnLoading(true);
    setVpnError("");

    try {
      const result = await window.browserAPI.vpnDisconnect();
      setVpnConnected(Boolean(result.connected));
      if (result.error) setVpnError(result.error);
    } catch (error: any) {
      setVpnError(error?.message || "Unable to disconnect.");
    } finally {
      setVpnLoading(false);
    }
  }

  return (
    <div className="app">
      <div
        ref={chromeRef}
        className={`browser-chrome ${vpnOpen ? "vpn-expanded" : ""}`}
      >
        <div className="tabbar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => window.browserAPI.activateTab(tab.id)}
            >
              <span className="tab-dot">
                {tab.private ? "◐" : "●"}
              </span>
              <span className="tab-title">
                {tab.audible ? "🔊 " : ""}
                {tab.title || "New Tab"}
              </span>
              <X
                size={14}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              />
            </div>
          ))}

          <button
            className="small-button"
            onClick={() => newTab(true)}
            title="New private tab"
          >
            <Plus size={18} />
          </button>

          <span className="toolbar-spacer" />

          <button
            className={`small-button ${vpnConnected ? "vpn-active" : ""}`}
            onClick={() => {
              setVpnError("");
              setVpnOpen((v) => !v);
            }}
            title="VPN / proxy"
          >
            <Wifi size={17} />
          </button>

          <button
            className="small-button"
            title="Private tab"
            onClick={() => newTab(true)}
          >
            <Shield size={17} />
          </button>
        </div>

        <div className="toolbar">
          <button
            className="icon-button"
            disabled={!current?.canGoBack}
            onClick={() => window.browserAPI.back(activeTabId)}
          >
            <ArrowLeft size={18} />
          </button>

          <button
            className="icon-button"
            disabled={!current?.canGoForward}
            onClick={() => window.browserAPI.forward(activeTabId)}
          >
            <ArrowRight size={18} />
          </button>

          <button
            className="icon-button"
            onClick={() => window.browserAPI.reload(activeTabId)}
          >
            <RotateCw size={17} />
          </button>

          <div className="address-wrapper">
            <form
              className="address-bar"
              onSubmit={(event) => {
                event.preventDefault();
                if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
                  selectSuggestion(suggestions[selectedSuggestion]);
                } else {
                  navigate(address);
                }
              }}
            >
              <Lock size={16} />

              <input
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setSelectedSuggestion(-1);
                }}
                onFocus={() => {
                  if (address.trim().length >= 2) {
                    setSelectedSuggestion(-1);
                  }
                }}
                onKeyDown={onAddressKeyDown}
                placeholder="Search privately or enter address"
                spellCheck={false}
                autoComplete="off"
              />

              {suggestionLoading ? (
                <span className="suggestion-spinner" />
              ) : suggestions.length > 0 ? (
                <Search size={15} />
              ) : null}
            </form>

            {suggestions.length > 0 && (
              <div className="suggestions" role="listbox">
                {suggestions.map((suggestion, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedSuggestion === index}
                    className={selectedSuggestion === index ? "selected" : ""}
                    key={`${suggestion}-${index}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <Search size={16} />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`icon-button ${privacyOpen ? "selected" : ""}`}
            onClick={() => setPrivacyOpen((v) => !v)}
            title="Privacy Shields"
          >
            <Shield size={18} />
          </button>

          <button
            className={`icon-button ${bookmarked.includes(current?.url || "") ? "selected" : ""}`}
            onClick={() => {
              if (current && current.url !== HOME) {
                setBookmarked((old) =>
                  old.includes(current.url)
                    ? old.filter((x) => x !== current.url)
                    : [...old, current.url]
                );
              }
            }}
            title="Bookmark"
          >
            <Bookmark size={18} />
          </button>

          <button
            className="icon-button"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>

        {vpnOpen && (
          <div className="vpn-panel">
            <div className="vpn-panel-header">
              <div>
                <strong>Private VPN / Proxy</strong>
                <span>{vpnConnected ? "Connected" : "Disconnected"}</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setVpnOpen(false)}
                title="Close VPN panel"
              >
                <X size={17} />
              </button>
            </div>

            <div className="vpn-status">
              <span className={`vpn-dot ${vpnConnected ? "connected" : ""}`} />
              <span>
                {vpnConnected
                  ? "Browser traffic is using the configured proxy."
                  : "Configure a reachable SOCKS5/SOCKS4/HTTP gateway."}
              </span>
            </div>

            <div className="vpn-fields">
              <label>
                Type
                <select
                  value={vpnConfig.type}
                  disabled={vpnConnected || vpnLoading}
                  onChange={(e) =>
                    setVpnConfig((old) => ({
                      ...old,
                      type: e.target.value as VPNConfig["type"]
                    }))
                  }
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="socks4">SOCKS4</option>
                  <option value="http">HTTP Proxy</option>
                </select>
              </label>

              <label>
                Host
                <input
                  value={vpnConfig.host}
                  disabled={vpnConnected || vpnLoading}
                  onChange={(e) =>
                    setVpnConfig((old) => ({
                      ...old,
                      host: e.target.value
                    }))
                  }
                  placeholder="127.0.0.1"
                />
              </label>

              <label>
                Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={vpnConfig.port}
                  disabled={vpnConnected || vpnLoading}
                  onChange={(e) =>
                    setVpnConfig((old) => ({
                      ...old,
                      port: Number(e.target.value)
                    }))
                  }
                />
              </label>
            </div>

            {vpnError && (
              <div className="vpn-error">
                {vpnError}
              </div>
            )}

            {!vpnConnected ? (
              <button
                className="vpn-connect"
                disabled={vpnLoading}
                onClick={connectVPN}
              >
                {vpnLoading ? "Testing & Connecting..." : "Connect"}
              </button>
            ) : (
              <button
                className="vpn-disconnect"
                disabled={vpnLoading}
                onClick={disconnectVPN}
              >
                {vpnLoading ? "Disconnecting..." : "Disconnect"}
              </button>
            )}

            <p className="vpn-note">
              This browser connects to an existing proxy/VPN gateway. It does not create a VPN tunnel by itself. For example, a local VPN client can expose SOCKS5 on 127.0.0.1:1080.
            </p>
          </div>
        )}
      </div>

      <div className={`web-area ${vpnOpen ? "vpn-web-area" : ""}`}>
        {settingsOpen ? (
          <div className="settings">
            <h1>Private Browser Settings</h1>
            <div className="setting-card">
              <h2>Privacy</h2>
              <label><input type="checkbox" defaultChecked /> Block ads</label>
              <label><input type="checkbox" defaultChecked /> Block trackers</label>
              <label><input type="checkbox" defaultChecked /> Block third-party permissions</label>
              <label><input type="checkbox" defaultChecked /> Prefer HTTPS</label>
              <p className="muted">
                No browsing-history database is created by this UI. Private tabs use non-persistent Electron sessions.
              </p>
            </div>
            <div className="setting-card">
              <h2>VPN</h2>
              <p>{vpnConnected ? "Browser proxy/VPN gateway is connected." : "Disconnected."}</p>
              <p className="muted">
                Configure the VPN/proxy from the network icon. The browser verifies that the configured endpoint is reachable before applying it.
              </p>
            </div>
          </div>
        ) : current?.url === HOME ? (
          <NewTab onNavigate={navigate} />
        ) : null}
      </div>

      {privacyOpen && (
        <PrivacyPanel
          url={current?.url || ""}
          onClose={() => setPrivacyOpen(false)}
        />
      )}
    </div>
  );
}
