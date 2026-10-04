export interface DeskMindConfig {
  botId: string
  apiUrl: string
}

export interface BotConfig {
  id: string
  name: string
  avatar: string | null
  widget_color: string
  widget_name: string
  welcome_message: string
  suggested_questions: string[]
}

export interface ChatRequest {
  message: string
  conversation_id: string | null
}

export interface SourceChunk {
  document_filename: string
  chunk_content: string
  similarity_score: number
}

export interface ChatResponse {
  conversation_id: string
  message_id: string
  answer: string
  sources: SourceChunk[]
  prompt_for_email?: boolean
  retrieval_details?: {
    query: string
    query_rewritten: boolean
    hybrid_enabled: boolean
    vector_candidates: number
    keyword_candidates: number
    combined_candidates: number
    final_chunks: number
    relevance_scores: number[]
    duration_ms: number
    refusal: boolean
    refusal_reason: string
  }
}

const WIDGET_ID = 'deskmind-widget-root'
const DEFAULT_COLOR = '#2563eb'

// How long to wait for a chat answer before giving up. RAG retrieval plus LLM
// generation can legitimately take a while, but a request that never settles
// (flaky mobile connection, dropped socket) must not leave the widget spinning
// forever with no feedback.
const REQUEST_TIMEOUT_MS = 60_000
const EMPTY_ANSWER_FALLBACK =
  "I'm sorry, I couldn't generate an answer just now. Please try again."

// Conversation ids are scoped per bot. A single global key meant a stored id
// from one bot (or a conversation deleted server-side) was reused for another
// bot, which the API rejects with 404 — permanently breaking that browser tab.
const CONVERSATION_KEY_PREFIX = 'deskmind_conversation_id:'

function findWidgetScript(): HTMLScriptElement | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script'))
  return scripts.find((s) => /widget(\.iife)?\.js/.test(s.src || '')) || null
}

function getConfig(): DeskMindConfig {
  // 1. Explicit global config (window.DeskMindConfig) wins.
  const globalConfig = (window as unknown as { DeskMindConfig?: DeskMindConfig }).DeskMindConfig
  if (globalConfig && globalConfig.botId) {
    return {
      botId: globalConfig.botId,
      apiUrl: globalConfig.apiUrl || window.location.origin,
    }
  }

  // 2. Fall back to data attributes on the loading <script> tag, e.g.
  //    <script src="https://api.example.com/widget.js" data-bot-id="..."></script>
  const script = findWidgetScript()
  const botId = script?.getAttribute('data-bot-id')
  if (botId) {
    const apiUrl =
      script?.getAttribute('data-api-url') ||
      (script?.src ? new URL(script.src).origin : window.location.origin)
    return { botId, apiUrl }
  }

  throw new Error('DeskMindConfig or data-bot-id is required to initialize the widget')
}

/**
 * Fetch the bot's public configuration (widget name, color, welcome message,
 * suggested questions) so the widget renders with the owner's settings.
 */
async function fetchBotConfig(config: DeskMindConfig): Promise<BotConfig | null> {
  const url = `${config.apiUrl}/bots/${encodeURIComponent(config.botId)}/config`
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as BotConfig
  } catch {
    // Appears offline — fall back to defaults so the widget still renders.
    return null
  }
}

function getConversationId(botId: string): string | null {
  try {
    return sessionStorage.getItem(`${CONVERSATION_KEY_PREFIX}${botId}`)
  } catch {
    return null
  }
}

function setConversationId(botId: string, id: string | null): void {
  try {
    const key = `${CONVERSATION_KEY_PREFIX}${botId}`
    if (id) {
      sessionStorage.setItem(key, id)
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {
    // ignore storage errors (private browsing / storage disabled)
  }
}

function buildWidgetHTML(): string {
  return `
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
  `
}

function buildWidgetStyles(color: string): string {
  return `
    * { box-sizing: border-box; }
    #deskmind-launcher {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      background: ${color};
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
      background: ${color};
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
    #deskmind-input:focus { border-color: ${color}; }
    #deskmind-send {
      padding: 10px 14px;
      background: ${color};
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
    #deskmind-send:disabled { opacity: 0.55; cursor: not-allowed; }
    .deskmind-message { max-width: 85%; padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4; word-wrap: break-word; }
    .deskmind-message-user { align-self: flex-end; background: ${color}; color: #fff; border-bottom-right-radius: 2px; }
    .deskmind-message-assistant { align-self: flex-start; background: #f3f4f6; color: #111827; border-bottom-left-radius: 2px; }
    .deskmind-message-error { align-self: flex-start; background: #fee2e2; color: #991b1b; border-bottom-left-radius: 2px; }
    .deskmind-sources { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
    .deskmind-sources-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 4px; }
    .deskmind-source { font-size: 12px; color: #374151; }
    .deskmind-sources-toggle { background: none; border: none; padding: 0; color: ${color}; font-size: 12px; cursor: pointer; margin-top: 6px; }
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
    border: 1px solid ${color};
    color: ${color};
    background: #fff;
    border-radius: 9999px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .deskmind-chip:hover { background: ${color}; color: #fff; }
  .deskmind-lead {
    align-self: flex-start;
    background: #fffbeb;
    border: 1px solid ${color};
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
  .deskmind-lead-email:focus { border-color: ${color}; }
  .deskmind-lead-submit {
    padding: 7px 12px;
    background: ${color};
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
  `
}

function createMessageBubble(role: 'user' | 'assistant' | 'error', text: string, sources?: SourceChunk[]): HTMLElement {
  const bubble = document.createElement('div')
  bubble.className = `deskmind-message deskmind-message-${role}`

  const textNode = document.createElement('div')
  textNode.textContent = text
  bubble.appendChild(textNode)

  if (sources && sources.length > 0) {
    const toggle = document.createElement('button')
    toggle.className = 'deskmind-sources-toggle'
    toggle.textContent = `View sources (${sources.length})`
    bubble.appendChild(toggle)

    const list = document.createElement('div')
    list.className = 'deskmind-sources-list'
    list.hidden = true

    for (const source of sources) {
      const card = document.createElement('div')
      card.className = 'deskmind-source-card'

      const filename = document.createElement('div')
      filename.className = 'deskmind-source-filename'
      filename.textContent = source.document_filename

      const content = document.createElement('div')
      content.className = 'deskmind-source-content'
      content.textContent = source.chunk_content

      const score = document.createElement('div')
      score.className = 'deskmind-source-score'
      score.textContent = `${Math.round(source.similarity_score * 100)}% match`

      card.appendChild(filename)
      card.appendChild(content)
      card.appendChild(score)
      list.appendChild(card)
    }

    bubble.appendChild(list)

    toggle.addEventListener('click', () => {
      const isHidden = list.hidden
      list.hidden = !isHidden
      toggle.textContent = isHidden ? 'Hide sources' : `View sources (${sources.length})`
    })
  }

  return bubble
}

function appendMessage(container: HTMLElement, role: 'user' | 'assistant' | 'error', text: string, sources?: SourceChunk[]): void {
  const bubble = createMessageBubble(role, text, sources)
  container.appendChild(bubble)
  container.scrollTop = container.scrollHeight
}

function buildLeadPrompt(
  config: DeskMindConfig,
  question: string,
): HTMLElement {
  const container = document.createElement('div')
  container.className = 'deskmind-lead'
  container.setAttribute('data-question', question)

  const label = document.createElement('p')
  label.className = 'deskmind-lead-label'
  label.textContent = "Didn't find what you needed? Leave your email and we'll follow up."
  container.appendChild(label)

  const row = document.createElement('div')
  row.className = 'deskmind-lead-row'

  const emailInput = document.createElement('input')
  emailInput.type = 'email'
  emailInput.placeholder = 'you@example.com'
  emailInput.className = 'deskmind-lead-email'

  const submitBtn = document.createElement('button')
  submitBtn.type = 'button'
  submitBtn.className = 'deskmind-lead-submit'
  submitBtn.textContent = 'Send'
  submitBtn.disabled = true

  const status = document.createElement('p')
  status.className = 'deskmind-lead-status'
  status.hidden = true

  row.appendChild(emailInput)
  row.appendChild(submitBtn)
  container.appendChild(row)
  container.appendChild(status)

  const validate = () => {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())
    submitBtn.disabled = !ok
  }
  emailInput.addEventListener('input', validate)

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim()
    if (!email) return
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending...'
    try {
      const url = `${config.apiUrl}/bots/${encodeURIComponent(config.botId)}/leads`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, question }),
      })
      if (!response.ok) throw new Error('Request failed')
      status.textContent = 'Thanks! We\u2019ll follow up by email.'
      status.hidden = false
      row.hidden = true
    } catch {
      status.textContent = 'Something went wrong. Please try again.'
      status.hidden = false
      submitBtn.disabled = false
      submitBtn.textContent = 'Send'
    }
  })

  return container
}

function createTypingIndicator(): HTMLElement {
  const bubble = document.createElement('div')
  bubble.className = 'deskmind-message deskmind-message-assistant deskmind-typing'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-label', 'Assistant is typing')
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span')
    dot.className = 'deskmind-typing-dot'
    bubble.appendChild(dot)
  }
  return bubble
}

async function describeErrorResponse(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
  } catch {
    // Not JSON (often an HTML gateway page) — fall through to a generic message.
  }
  return `The assistant is temporarily unavailable (HTTP ${response.status}). Please try again.`
}

// Guards against overlapping sends (double-tap on mobile, rapid Enter presses)
// which used to race the same conversation and produce spurious errors.
let sending = false

async function sendMessage(config: DeskMindConfig, messagesContainer: HTMLElement, input: HTMLInputElement, text: string): Promise<void> {
  const question = text.trim()
  if (!question || sending) return

  sending = true

  // Echo the question immediately and clear the composer *before* the request,
  // so the user's message never lingers in the input bar while the bot thinks.
  appendMessage(messagesContainer, 'user', question)
  input.value = ''

  const sendButton = input.form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null
  if (sendButton) sendButton.disabled = true

  // Reassure the user the assistant is working instead of leaving a blank panel.
  const typing = createTypingIndicator()
  messagesContainer.appendChild(typing)
  messagesContainer.scrollTop = messagesContainer.scrollHeight

  const endpoint = `${config.apiUrl}/bots/${encodeURIComponent(config.botId)}/chat`

  const post = async (conversationId: string | null): Promise<Response> => {
    // Abort a request that never settles so the widget cannot spin forever on a
    // flaky mobile connection.
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, conversation_id: conversationId } satisfies ChatRequest),
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timer)
    }
  }

  try {
    let response = await post(getConversationId(config.botId))

    // A stored conversation can be stale — it may belong to a different bot or
    // have been removed server-side. Recover by starting a fresh conversation
    // instead of failing every subsequent message.
    if (response.status === 400 || response.status === 404) {
      setConversationId(config.botId, null)
      response = await post(null)
    }

    if (!response.ok) {
      // The backend normally answers 200 even when a provider is down, so a
      // non-OK status here means an infrastructure failure (proxy/gateway page,
      // which is often HTML). Never dump that raw markup into the chat bubble.
      throw new Error(await describeErrorResponse(response))
    }

    const data = (await response.json()) as ChatResponse
    setConversationId(config.botId, data.conversation_id)
    appendMessage(messagesContainer, 'assistant', data.answer || EMPTY_ANSWER_FALLBACK, data.sources)
    // Only offer lead capture when the bot explicitly signals it is relevant.
    if (data.prompt_for_email) {
      messagesContainer.appendChild(buildLeadPrompt(config, question))
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'That took longer than expected. Check your connection and try again.'
        : error instanceof Error
          ? error.message
          : 'Something went wrong'
    appendMessage(messagesContainer, 'error', `Error: ${message}`)
  } finally {
    typing.remove()
    sending = false
    if (sendButton) sendButton.disabled = false
    try {
      input.focus()
    } catch {
      // Focusing is best-effort (some embedded browsers block it).
    }
  }
}

function buildWelcomeMessage(
  message: string,
  suggestedQuestions: string[],
  botName: string,
  onSubmitQuestion: (text: string) => void,
): HTMLElement {
  const container = document.createElement('div')
  container.className = 'deskmind-welcome'

  const text = document.createElement('div')
  const defaultGreeting = `Hi! I'm ${botName}, your AI assistant. How can I help you today?`
  text.textContent = message || defaultGreeting
  container.appendChild(text)

  if (suggestedQuestions.length > 0) {
    const chips = document.createElement('div')
    chips.className = 'deskmind-chips'
    for (const question of suggestedQuestions) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'deskmind-chip'
      chip.textContent = question
      chip.addEventListener('click', () => {
        onSubmitQuestion(question)
        container.remove()
      })
      chips.appendChild(chip)
    }
    container.appendChild(chips)
  }

  return container
}

let initialized = false

export async function initWidget(cfg?: DeskMindConfig): Promise<void> {
  if (initialized) return
  if (document.getElementById(WIDGET_ID)) return
  initialized = true

  const config = cfg ?? getConfig()
  const botConfig = await fetchBotConfig(config)
  const color = botConfig?.widget_color || DEFAULT_COLOR
  const displayName = botConfig?.widget_name || botConfig?.name || 'Chat'

  const container = document.createElement('div')
  container.id = WIDGET_ID

  const shadow = container.attachShadow({ mode: 'open' })
  shadow.innerHTML = buildWidgetHTML()

  const style = document.createElement('style')
  style.textContent = buildWidgetStyles(color)
  shadow.appendChild(style)

  document.body.appendChild(container)

  const launcher = shadow.querySelector<HTMLButtonElement>('#deskmind-launcher')!
  const window_ = shadow.querySelector<HTMLElement>('#deskmind-window')!
  const closeBtn = shadow.querySelector<HTMLButtonElement>('#deskmind-close')!
  const title = shadow.querySelector<HTMLElement>('#deskmind-title')!
  const form = shadow.querySelector<HTMLFormElement>('#deskmind-form')!
  const input = shadow.querySelector<HTMLInputElement>('#deskmind-input')!
  const messagesContainer = shadow.querySelector<HTMLElement>('#deskmind-messages')!

  title.textContent = displayName

  if (botConfig?.avatar) {
    const avatarImg = shadow.querySelector<HTMLImageElement>('#deskmind-avatar')!
    avatarImg.src = botConfig.avatar
    avatarImg.alt = displayName
    avatarImg.style.display = 'block'
  }

  const greeting = buildWelcomeMessage(
    botConfig?.welcome_message || '',
    botConfig?.suggested_questions || [],
    displayName,
    (text) => {
      sendMessage(config, messagesContainer, input, text)
    },
  )
  messagesContainer.appendChild(greeting)

  const toggle = (show: boolean): void => {
    if (show) {
      window_.hidden = false
      launcher.hidden = true
      input.focus()
    } else {
      window_.hidden = true
      launcher.hidden = false
    }
  }

  launcher.addEventListener('click', () => toggle(true))
  closeBtn.addEventListener('click', () => toggle(false))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    sendMessage(config, messagesContainer, input, text)
  })
}

// Auto-initialize when the bundle is loaded directly in a browser, whether via
// window.DeskMindConfig or via a data-bot-id attribute on the <script> tag.
// In bundler-based usage (main.ts) initWidget() is called explicitly; the
// initialized guard keeps this from creating a duplicate widget.
function autoInit(): void {
  try {
    if (typeof document === 'undefined') return
    const run = () => {
      void initWidget().catch(() => {
        // Config missing / unavailable — allow a later explicit initWidget() call.
        initialized = false
      })
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run)
    } else {
      run()
    }
  } catch {
    // ignore
  }
}

autoInit()
