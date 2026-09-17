import {Search, ShieldCheck} from "lucide-react";
export default function NewTab({onNavigate}:{onNavigate:(u:string)=>void}) {
 return <div className="newtab"><div className="hero-icon"><ShieldCheck size={46}/></div>
 <h1>Private browsing, by default.</h1><p>No browsing history. No saved searches. Ads and trackers blocked.</p>
 <form className="new-search" onSubmit={e=>{e.preventDefault();const i=e.currentTarget.elements.namedItem("q") as HTMLInputElement;onNavigate(i.value)}}>
 <Search size={20}/><input name="q" autoFocus placeholder="Search privately or enter a URL"/></form>
 <div className="badges"><span>✓ No history</span><span>✓ Tracker blocking</span><span>✓ Private sessions</span></div></div>
}