import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DeveloperWorkspace from '../../components/DeveloperWorkspace.jsx';
const Auth = createContext({ session: null });
let latestSession = null;
export function useAuth() { return useContext(Auth); }
export function useBilling() { return { openBillingModal: () => window.open('https://roseram.com/developers', '_blank', 'noopener,noreferrer') }; }
export function Link({ children, ...props }) { const auth = useContext(Auth); if (props.href === '/account') return <button type="button" onClick={() => { latestSession = null; auth.setSession(null); }}>Disconnect key</button>; return <a {...props} href={props.href?.startsWith('/') ? 'https://roseram.com' + props.href : props.href}>{children}</a>; }
export function Image({ unoptimized, ...props }) { return <img {...props} alt={props.alt || ''} />; }
export function FloatingAuthModal({ isOpen, onClose }) {
 const box = useRef(null);
 useEffect(() => { if (!isOpen || !box.current) return; const previous = document.activeElement; box.current.showModal(); box.current.querySelector('input')?.focus(); return () => { box.current?.close(); previous?.focus?.(); }; }, [isOpen]);
 const { setSession } = useContext(Auth); const [key, setKey] = useState(''), [error,setError] = useState('');
 if (!isOpen) return null;
 return <dialog ref={box} onCancel={onClose} aria-labelledby="api-signin-title" style={{border:0,borderRadius:16,maxWidth:'calc(100% - 32px)',width:480,padding:0,maxHeight:'85vh',overflow:'auto'}}><section style={{background:'#fff',color:'#17202b',padding:28}}><h2 id="api-signin-title">Connect your Roseram developer key</h2><p>The local editor works without a key. Model requests use your developer API access and available credits. Your key is kept in memory for this session.</p><form onSubmit={async e=>{e.preventDefault();if(!/^rr_live_[A-Za-z0-9_-]+$/.test(key)){setError('Enter a Roseram developer key.');return;}const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const id=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);latestSession={access_token:key,user:{id:'developer-'+id,email:'Developer API'}};setSession(latestSession);setKey('');onClose();}}><label htmlFor="developer-key">Developer key</label><input id="developer-key" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} style={{display:'block',width:'100%',padding:10,margin:'10px 0'}}/><p role="alert">{error}</p><button type="submit">Connect key</button> <button type="button" onClick={onClose}>Cancel</button></form><p><a href="https://roseram.com/developers" target="_blank" rel="noreferrer">Manage developer access</a></p></section></dialog>;
}
export async function requestWorkspaceGeneration(input,{token,signal,onProgress}={}) {
 onProgress?.({phase:'working'});
 const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({...input,conversationHistory:input.conversationHistory?.slice(-8).map(m=>({...m,content:m.content.slice(0,4000)})),token})});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'The model request failed.'),{status:response.status});return data;
}
export function readPendingGeneration(){return null;}
function App(){const [session,setSession]=useState(latestSession);const app=JSON.parse(document.getElementById('app-config').textContent);return <Auth.Provider value={{session,setSession,loading:false}}><DeveloperWorkspace app={app}/></Auth.Provider>;}
if(document.getElementById('app-root'))createRoot(document.getElementById('app-root')).render(<App/>);
