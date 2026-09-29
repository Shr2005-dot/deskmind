var DeskMindWidget=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=`deskmind-widget-root`,n=`#2563eb`;function r(){return Array.from(document.querySelectorAll(`script`)).find(e=>/widget(\.iife)?\.js/.test(e.src||``))||null}function i(){let e=window.DeskMindConfig;if(e&&e.botId)return{botId:e.botId,apiUrl:e.apiUrl||window.location.origin};let t=r(),n=t?.getAttribute(`data-bot-id`);if(n)return{botId:n,apiUrl:t?.getAttribute(`data-api-url`)||(t?.src?new URL(t.src).origin:window.location.origin)};throw Error(`DeskMindConfig or data-bot-id is required to initialize the widget`)}async function a(e){let t=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/config`;try{let e=await fetch(t);return e.ok?await e.json():null}catch{return null}}function o(){try{return sessionStorage.getItem(`deskmind_conversation_id`)}catch{return null}}function s(e){try{e?sessionStorage.setItem(`deskmind_conversation_id`,e):sessionStorage.removeItem(`deskmind_conversation_id`)}catch{}}function c(){return`
    <button id="deskmind-launcher" aria-label="Open chat">Chat</button>
    <div id="deskmind-window" hidden>
      <div id="deskmind-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <img id="deskmind-avatar" src="" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;display:none;" />
          <span id="deskmind-title">Chat</span>
        </div>
        <button id="deskmind-close" aria-label="Close chat">×</button>
      </div>
      <div id="deskmind-messages"></div>
      <form id="deskmind-form">
        <input id="deskmind-input" placeholder="Type a message..." autocomplete="off" />
        <button type="submit" id="deskmind-send">Send</button>
      </form>
    </div>
  `}function l(e){return`
    * { box-sizing: border-box; }
    #deskmind-launcher {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      background: ${e};
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #deskmind-window {
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: 360px;
      max-width: calc(100vw - 40px);
      height: 480px;
      max-height: calc(100vh - 120px);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      z-index: 99999;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    #deskmind-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: ${e};
      color: #fff;
      font-weight: 600;
    }
    #deskmind-close {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 4px;
    }
    #deskmind-close:hover { background: rgba(255,255,255,0.2); }
    #deskmind-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    #deskmind-form {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
    }
    #deskmind-input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }
    #deskmind-input:focus { border-color: ${e}; }
    #deskmind-send {
      padding: 10px 14px;
      background: ${e};
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
    .deskmind-message { max-width: 85%; padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4; word-wrap: break-word; }
    .deskmind-message-user { align-self: flex-end; background: ${e}; color: #fff; border-bottom-right-radius: 2px; }
    .deskmind-message-assistant { align-self: flex-start; background: #f3f4f6; color: #111827; border-bottom-left-radius: 2px; }
    .deskmind-message-error { align-self: flex-start; background: #fee2e2; color: #991b1b; border-bottom-left-radius: 2px; }
    .deskmind-sources { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
    .deskmind-sources-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 4px; }
    .deskmind-source { font-size: 12px; color: #374151; }
    .deskmind-sources-toggle { background: none; border: none; padding: 0; color: ${e}; font-size: 12px; cursor: pointer; margin-top: 6px; }
    .deskmind-sources-toggle[hidden] { display: none; }
    .deskmind-sources-list { display: none; margin-top: 6px; }
  .deskmind-sources-list[open] { display: block; }
  .deskmind-source-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; background: #f9fafb; }
  .deskmind-source-filename { font-size: 11px; font-weight: 600; color: #111827; }
  .deskmind-source-content { font-size: 11px; color: #374151; margin-top: 2px; font-style: italic; }
  .deskmind-source-score { font-size: 11px; color: #6b7280; margin-top: 2px; }
  #deskmind-window[hidden] { display: none !important; }
  #deskmind-launcher[hidden] { display: none !important; }
  .deskmind-welcome {
    align-self: flex-start;
    background: #f3f4f6;
    color: #111827;
    padding: 10px 12px;
    border-radius: 10px;
    border-bottom-left-radius: 2px;
    font-size: 14px;
    line-height: 1.4;
    white-space: pre-wrap;
    max-width: 85%;
  }
  .deskmind-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .deskmind-chip {
    border: 1px solid ${e};
    color: ${e};
    background: #fff;
    border-radius: 9999px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .deskmind-chip:hover { background: ${e}; color: #fff; }
  .deskmind-lead {
    align-self: flex-start;
    background: #fffbeb;
    border: 1px solid ${e};
    border-radius: 10px;
    padding: 10px 12px;
    max-width: 85%;
  }
  .deskmind-lead-label { font-size: 12px; color: #78350f; margin: 0 0 8px; }
  .deskmind-lead-row { display: flex; gap: 6px; }
  .deskmind-lead-email {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 13px;
    outline: none;
  }
  .deskmind-lead-email:focus { border-color: ${e}; }
  .deskmind-lead-submit {
    padding: 7px 12px;
    background: ${e};
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .deskmind-lead-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .deskmind-lead-status { font-size: 12px; color: #166534; margin: 8px 0 0; }
  `}function u(e,t,n){let r=document.createElement(`div`);r.className=`deskmind-message deskmind-message-${e}`;let i=document.createElement(`div`);if(i.textContent=t,r.appendChild(i),n&&n.length>0){let e=document.createElement(`button`);e.className=`deskmind-sources-toggle`,e.textContent=`View sources (${n.length})`,r.appendChild(e);let t=document.createElement(`div`);t.className=`deskmind-sources-list`,t.hidden=!0;for(let e of n){let n=document.createElement(`div`);n.className=`deskmind-source-card`;let r=document.createElement(`div`);r.className=`deskmind-source-filename`,r.textContent=e.document_filename;let i=document.createElement(`div`);i.className=`deskmind-source-content`,i.textContent=e.chunk_content;let a=document.createElement(`div`);a.className=`deskmind-source-score`,a.textContent=`${Math.round(e.similarity_score*100)}% match`,n.appendChild(r),n.appendChild(i),n.appendChild(a),t.appendChild(n)}r.appendChild(t),e.addEventListener(`click`,()=>{let r=t.hidden;t.hidden=!r,e.textContent=r?`Hide sources`:`View sources (${n.length})`})}return r}function d(e,t,n,r){let i=u(t,n,r);e.appendChild(i),e.scrollTop=e.scrollHeight}function f(e,t){let n=document.createElement(`div`);n.className=`deskmind-lead`,n.setAttribute(`data-question`,t);let r=document.createElement(`p`);r.className=`deskmind-lead-label`,r.textContent=`Didn't find what you needed? Leave your email and we'll follow up.`,n.appendChild(r);let i=document.createElement(`div`);i.className=`deskmind-lead-row`;let a=document.createElement(`input`);a.type=`email`,a.placeholder=`you@example.com`,a.className=`deskmind-lead-email`;let o=document.createElement(`button`);o.type=`button`,o.className=`deskmind-lead-submit`,o.textContent=`Send`,o.disabled=!0;let s=document.createElement(`p`);return s.className=`deskmind-lead-status`,s.hidden=!0,i.appendChild(a),i.appendChild(o),n.appendChild(i),n.appendChild(s),a.addEventListener(`input`,()=>{let e=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.value.trim());o.disabled=!e}),o.addEventListener(`click`,async()=>{let n=a.value.trim();if(n){o.disabled=!0,o.textContent=`Sending...`;try{let r=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/leads`;if(!(await fetch(r,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:n,question:t})})).ok)throw Error(`Request failed`);s.textContent=`Thanks! We’ll follow up by email.`,s.hidden=!1,i.hidden=!0}catch{s.textContent=`Something went wrong. Please try again.`,s.hidden=!1,o.disabled=!1,o.textContent=`Send`}}}),n}async function p(e,t,n,r){d(t,`user`,r);let i=o();try{let n=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/chat`,a=await fetch(n,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:r,conversation_id:i})});if(!a.ok){let e=`HTTP ${a.status}`;try{let t=await a.clone().json();typeof t.detail==`string`&&t.detail.trim()&&(e=t.detail)}catch{e=`The assistant is temporarily unavailable. Please try again.`}throw Error(e)}let o=await a.json();s(o.conversation_id),d(t,`assistant`,o.answer,o.sources),o.prompt_for_email&&(t.appendChild(f(e,r)),t.scrollTop=t.scrollHeight)}catch(e){d(t,`error`,`Error: ${e instanceof Error?e.message:`Something went wrong`}`)}finally{n.value=``,n.focus()}}function m(e,t,n,r){let i=document.createElement(`div`);i.className=`deskmind-welcome`;let a=document.createElement(`div`),o=`Hi! I'm ${n}, your AI assistant. How can I help you today?`;if(a.textContent=e||o,i.appendChild(a),t.length>0){let e=document.createElement(`div`);e.className=`deskmind-chips`;for(let n of t){let t=document.createElement(`button`);t.type=`button`,t.className=`deskmind-chip`,t.textContent=n,t.addEventListener(`click`,()=>{r(n),i.remove()}),e.appendChild(t)}i.appendChild(e)}return i}var h=!1;async function g(e){if(h||document.getElementById(t))return;h=!0;let r=e??i(),o=await a(r),s=o?.widget_color||n,u=o?.widget_name||o?.name||`Chat`,d=document.createElement(`div`);d.id=t;let f=d.attachShadow({mode:`open`});f.innerHTML=c();let g=document.createElement(`style`);g.textContent=l(s),f.appendChild(g),document.body.appendChild(d);let _=f.querySelector(`#deskmind-launcher`),v=f.querySelector(`#deskmind-window`),y=f.querySelector(`#deskmind-close`),b=f.querySelector(`#deskmind-title`),x=f.querySelector(`#deskmind-form`),S=f.querySelector(`#deskmind-input`),C=f.querySelector(`#deskmind-messages`);if(b.textContent=u,o?.avatar){let e=f.querySelector(`#deskmind-avatar`);e.src=o.avatar,e.alt=u,e.style.display=`block`}let w=m(o?.welcome_message||``,o?.suggested_questions||[],u,e=>{S.value=e,p(r,C,S,e)});C.appendChild(w);let T=e=>{e?(v.hidden=!1,_.hidden=!0,S.focus()):(v.hidden=!0,_.hidden=!1)};_.addEventListener(`click`,()=>T(!0)),y.addEventListener(`click`,()=>T(!1)),x.addEventListener(`submit`,e=>{e.preventDefault();let t=S.value.trim();t&&p(r,C,S,t)})}function _(){try{if(typeof document>`u`)return;let e=()=>{g().catch(()=>{h=!1})};document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,e):e()}catch{}}return _(),e.initWidget=g,e})({});