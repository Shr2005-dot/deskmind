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

function getConversationId(): string | null {
  try {
    return sessionStorage.getItem('deskmind_conversation_id')
  } catch {
    return null
  }
}

function setConversationId(id: string | null): void {
  try {
    if (id) {
      sessionStorage.setItem('deskmind_conversation_id', id)
    } else {
      sessionStorage.removeItem('deskmind_conversation_id')
    }
  } catch {
    // ignore storage errors
  }
}

function buildWidgetHTML(): string {
  return `
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

async function sendMessage(config: DeskMindConfig, messagesContainer: HTMLElement, input: HTMLInputElement, text: string): Promise<void> {
  appendMessage(messagesContainer, 'user', text)

  const conversationId = getConversationId()
  try {
    const url = `${config.apiUrl}/bots/${encodeURIComponent(config.botId)}/chat`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, conversation_id: conversationId } satisfies ChatRequest),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }

    const data = (await response.json()) as ChatResponse
    setConversationId(data.conversation_id)
    appendMessage(messagesContainer, 'assistant', data.answer, data.sources)
    // Only offer lead capture when the bot explicitly signals it is relevant.
    if (data.prompt_for_email) {
      messagesContainer.appendChild(buildLeadPrompt(config, text))
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong'
    appendMessage(messagesContainer, 'error', `Error: ${message}`)
  } finally {
    input.value = ''
    input.focus()
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
      input.value = text
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
