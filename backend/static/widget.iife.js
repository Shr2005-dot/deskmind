var DeskMindWidget=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=`deskmind-widget-root`,n=`#2563eb`,r=6e4,i=`I'm sorry, I couldn't generate an answer just now. Please try again.`,a=`deskmind_conversation_id:`;function o(){return Array.from(document.querySelectorAll(`script`)).find(e=>/widget(\.iife)?\.js/.test(e.src||``))||null}function s(){let e=window.DeskMindConfig;if(e&&e.botId)return{botId:e.botId,apiUrl:e.apiUrl||window.location.origin};let t=o(),n=t?.getAttribute(`data-bot-id`);if(n)return{botId:n,apiUrl:t?.getAttribute(`data-api-url`)||(t?.src?new URL(t.src).origin:window.location.origin)};throw Error(`DeskMindConfig or data-bot-id is required to initialize the widget`)}async function c(e){let t=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/config`;try{let e=await fetch(t);return e.ok?await e.json():null}catch{return null}}function l(e){try{return sessionStorage.getItem(`${a}${e}`)}catch{return null}}function u(e,t){try{let n=`${a}${e}`;t?sessionStorage.setItem(n,t):sessionStorage.removeItem(n)}catch{}}function d(){return`
    <button id="deskmind-launcher" aria-label="Open chat">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </button>
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
  `}function f(e){return`
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
      padding: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #deskmind-launcher svg { display: block; }
    #deskmind-launcher:hover { transform: scale(1.06); box-shadow: 0 6px 16px rgba(0,0,0,0.22); }
    #deskmind-launcher:active { transform: scale(0.96); }
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
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
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
    #deskmind-send:disabled { opacity: 0.55; cursor: not-allowed; }
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
  .deskmind-typing { display: inline-flex; align-items: center; gap: 5px; min-height: 18px; padding: 12px; }
  .deskmind-typing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9ca3af;
    animation: deskmind-bounce 1.2s infinite ease-in-out;
  }
  .deskmind-typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .deskmind-typing-dot:nth-child(3) { animation-delay: 0.3s; }
  @keyframes deskmind-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
    40% { transform: translateY(-4px); opacity: 1; }
  }
  @media (max-width: 480px) {
    #deskmind-window {
      left: 12px;
      right: 12px;
      width: auto;
      max-width: none;
      bottom: calc(88px + env(safe-area-inset-bottom, 0px));
      height: calc(100dvh - 110px);
      max-height: calc(100dvh - 110px);
    }
    #deskmind-launcher { right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
    /* 16px prevents iOS Safari from auto-zooming (and shifting the layout)
       when the field receives focus. */
    #deskmind-input,
    .deskmind-lead-email { font-size: 16px; }
  }
  `}function p(e,t,n){let r=document.createElement(`div`);r.className=`deskmind-message deskmind-message-${e}`;let i=document.createElement(`div`);if(i.textContent=t,r.appendChild(i),n&&n.length>0){let e=document.createElement(`button`);e.className=`deskmind-sources-toggle`,e.textContent=`View sources (${n.length})`,r.appendChild(e);let t=document.createElement(`div`);t.className=`deskmind-sources-list`,t.hidden=!0;for(let e of n){let n=document.createElement(`div`);n.className=`deskmind-source-card`;let r=document.createElement(`div`);r.className=`deskmind-source-filename`,r.textContent=e.document_filename;let i=document.createElement(`div`);i.className=`deskmind-source-content`,i.textContent=e.chunk_content;let a=document.createElement(`div`);a.className=`deskmind-source-score`,a.textContent=`${Math.round(e.similarity_score*100)}% match`,n.appendChild(r),n.appendChild(i),n.appendChild(a),t.appendChild(n)}r.appendChild(t),e.addEventListener(`click`,()=>{let r=t.hidden;t.hidden=!r,e.textContent=r?`Hide sources`:`View sources (${n.length})`})}return r}function m(e,t,n,r){let i=p(t,n,r);e.appendChild(i),e.scrollTop=e.scrollHeight}function h(e,t){let n=document.createElement(`div`);n.className=`deskmind-lead`,n.setAttribute(`data-question`,t);let r=document.createElement(`p`);r.className=`deskmind-lead-label`,r.textContent=`Didn't find what you needed? Leave your email and we'll follow up.`,n.appendChild(r);let i=document.createElement(`div`);i.className=`deskmind-lead-row`;let a=document.createElement(`input`);a.type=`email`,a.placeholder=`you@example.com`,a.className=`deskmind-lead-email`;let o=document.createElement(`button`);o.type=`button`,o.className=`deskmind-lead-submit`,o.textContent=`Send`,o.disabled=!0;let s=document.createElement(`p`);return s.className=`deskmind-lead-status`,s.hidden=!0,i.appendChild(a),i.appendChild(o),n.appendChild(i),n.appendChild(s),a.addEventListener(`input`,()=>{let e=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.value.trim());o.disabled=!e}),o.addEventListener(`click`,async()=>{let n=a.value.trim();if(n){o.disabled=!0,o.textContent=`Sending...`;try{let r=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/leads`;if(!(await fetch(r,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:n,question:t})})).ok)throw Error(`Request failed`);s.textContent=`Thanks! We’ll follow up by email.`,s.hidden=!1,i.hidden=!0}catch{s.textContent=`Something went wrong. Please try again.`,s.hidden=!1,o.disabled=!1,o.textContent=`Send`}}}),n}function g(){let e=document.createElement(`div`);e.className=`deskmind-message deskmind-message-assistant deskmind-typing`,e.setAttribute(`role`,`status`),e.setAttribute(`aria-label`,`Assistant is typing`);for(let t=0;t<3;t+=1){let t=document.createElement(`span`);t.className=`deskmind-typing-dot`,e.appendChild(t)}return e}async function _(e){try{let t=await e.clone().json();if(typeof t.detail==`string`&&t.detail.trim())return t.detail}catch{}return`The assistant is temporarily unavailable (HTTP ${e.status}). Please try again.`}var v=!1;async function y(e,t,n,a){let o=a.trim();if(!o||v)return;v=!0,m(t,`user`,o),n.value=``;let s=n.form?.querySelector(`button[type="submit"]`)??null;s&&(s.disabled=!0);let c=g();t.appendChild(c),t.scrollTop=t.scrollHeight;let d=`${e.apiUrl}/bots/${encodeURIComponent(e.botId)}/chat`,f=async e=>{let t=new AbortController,n=window.setTimeout(()=>t.abort(),r);try{return await fetch(d,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:o,conversation_id:e}),signal:t.signal})}finally{window.clearTimeout(n)}};try{let n=await f(l(e.botId));if((n.status===400||n.status===404)&&(u(e.botId,null),n=await f(null)),!n.ok)throw Error(await _(n));let r=await n.json();u(e.botId,r.conversation_id),m(t,`assistant`,r.answer||i,r.sources),r.prompt_for_email&&(t.appendChild(h(e,o)),t.scrollTop=t.scrollHeight)}catch(e){m(t,`error`,`Error: ${e instanceof DOMException&&e.name===`AbortError`?`That took longer than expected. Check your connection and try again.`:e instanceof Error?e.message:`Something went wrong`}`)}finally{c.remove(),v=!1,s&&(s.disabled=!1);try{n.focus()}catch{}}}function b(e,t,n,r){let i=document.createElement(`div`);i.className=`deskmind-welcome`;let a=document.createElement(`div`),o=`Hi! I'm ${n}, your AI assistant. How can I help you today?`;if(a.textContent=e||o,i.appendChild(a),t.length>0){let e=document.createElement(`div`);e.className=`deskmind-chips`;for(let n of t){let t=document.createElement(`button`);t.type=`button`,t.className=`deskmind-chip`,t.textContent=n,t.addEventListener(`click`,()=>{r(n),i.remove()}),e.appendChild(t)}i.appendChild(e)}return i}var x=!1;async function S(e){if(x||document.getElementById(t))return;x=!0;let r=e??s(),i=await c(r),a=i?.widget_color||n,o=i?.widget_name||i?.name||`Chat`,l=document.createElement(`div`);l.id=t;let u=l.attachShadow({mode:`open`});u.innerHTML=d();let p=document.createElement(`style`);p.textContent=f(a),u.appendChild(p),document.body.appendChild(l);let m=u.querySelector(`#deskmind-launcher`),h=u.querySelector(`#deskmind-window`),g=u.querySelector(`#deskmind-close`),_=u.querySelector(`#deskmind-title`),v=u.querySelector(`#deskmind-form`),S=u.querySelector(`#deskmind-input`),C=u.querySelector(`#deskmind-messages`);if(_.textContent=o,i?.avatar){let e=u.querySelector(`#deskmind-avatar`);e.src=i.avatar,e.alt=o,e.style.display=`block`}let w=b(i?.welcome_message||``,i?.suggested_questions||[],o,e=>{y(r,C,S,e)});C.appendChild(w);let T=e=>{e?(h.hidden=!1,m.hidden=!0,S.focus()):(h.hidden=!0,m.hidden=!1)};m.addEventListener(`click`,()=>T(!0)),g.addEventListener(`click`,()=>T(!1)),v.addEventListener(`submit`,e=>{e.preventDefault();let t=S.value.trim();t&&y(r,C,S,t)})}function C(){try{if(typeof document>`u`)return;let e=()=>{S().catch(()=>{x=!1})};document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,e):e()}catch{}}return C(),e.initWidget=S,e})({});