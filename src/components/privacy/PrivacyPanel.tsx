import { ShieldCheck, X } from "lucide-react";

export default function PrivacyPanel({
  url,
  onClose
}: {
  url: string;
  onClose: () => void;
}) {
  return (
    <aside className="privacy-panel">
      <div className="panel-title">
        <div className="panel-brand">
          <ShieldCheck size={24} />
          <div>
            <strong>Shields</strong>
            <span>{url || "New Tab"}</span>
          </div>
        </div>
        <button className="icon-button" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="shield-status">
        <ShieldCheck size={34} />
        <div>
          <strong>Protection enabled</strong>
          <span>Privacy protections are active.</span>
        </div>
      </div>

      <div className="privacy-row"><span>Ads & trackers</span><b>BLOCK</b></div>
      <div className="privacy-row"><span>Third-party permissions</span><b>BLOCK</b></div>
      <div className="privacy-row"><span>Secure connections</span><b>ON</b></div>
      <div className="privacy-row"><span>Private permissions</span><b>DENY</b></div>

      <p className="privacy-note">
        This build uses a small built-in tracker list. For production,
        replace it with a maintained filter-list engine and add per-site controls.
      </p>
    </aside>
  );
}