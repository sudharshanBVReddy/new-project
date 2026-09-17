/// <reference types="vite/client" />

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  private: boolean;
  audible?: boolean;
}

interface VPNConfig {
  type: "socks5" | "socks4" | "http";
  host: string;
  port: number;
}

interface BrowserAPI {
  uiReady(): void;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  createTab(options?: { privateMode?: boolean }): void;
  activateTab(id: string): void;
  closeTab(id: string): void;
  navigate(id: string, url: string): void;
  back(id: string): void;
  forward(id: string): void;
  reload(id: string): void;
  clearSession(): Promise<boolean>;
  searchSuggestions(query: string): Promise<string[]>;
  openExternal(url: string): void;

  vpnStatus(): Promise<{
    connected: boolean;
    config: VPNConfig | null;
    mode: "proxy" | "direct";
  }>;
  vpnConnect(config: VPNConfig): Promise<{
    connected: boolean;
    config?: VPNConfig | null;
    mode?: "proxy" | "direct";
    error?: string;
  }>;
  vpnDisconnect(): Promise<{
    connected: boolean;
    config?: VPNConfig | null;
    mode?: "proxy" | "direct";
    error?: string;
  }>;

  onTabs(callback: (payload: { tabs: BrowserTab[]; activeTabId: string }) => void): () => void;
  onTabState(callback: (tab: BrowserTab) => void): () => void;
  onLoadError(callback: (payload: { id: string; errorDescription: string; url: string }) => void): () => void;
}

declare global {
  interface Window {
    browserAPI: BrowserAPI;
  }
}

export {};
