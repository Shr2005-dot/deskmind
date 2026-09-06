import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Attach JWT token to every request if available
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Redirect to login on auth errors.
//
// 401s coming FROM the auth endpoints themselves (bad credentials while
// signing in) must not trigger the bounce: the user is already on /login and
// a redirect would reload the page and swallow the error toast.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? "";
    const isAuthAttempt = url.includes("/auth/login") || url.includes("/auth/google");
    if (
      error.response?.status === 401 &&
      !isAuthAttempt &&
      typeof window !== "undefined"
    ) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth
export interface User {
  id: string;
  email: string;
  name?: string;
  picture_url?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Sign in an EXISTING account with Google (never creates one).
export const googleAuth = async (credential: string): Promise<LoginResponse> => {
  const response = await api.post("/auth/google", { credential });
  return response.data as LoginResponse;
};

// Create a new DeskMind account from a Google identity + DeskMind password.
// This is the only way to create an account.
export const googleSignup = async (
  credential: string,
  password: string,
): Promise<LoginResponse> => {
  const response = await api.post("/auth/google/signup", { credential, password });
  return response.data as LoginResponse;
};

// Create a guest account with name, email, and password (no Google).
export const guestSignup = async (
  name: string,
  email: string,
  password: string,
): Promise<LoginResponse> => {
  const response = await api.post("/auth/guest/signup", { name, email, password });
  return response.data as LoginResponse;
};

// Sign in with the Google email address and the DeskMind password chosen at
// signup. Fails with "Account not created..." if no account exists yet.
export const loginWithPassword = async (
  email: string,
  password: string,
): Promise<LoginResponse> => {
  const response = await api.post("/auth/login", { email, password });
  return response.data as LoginResponse;
};

// Sign in an existing guest account with email and password.
export const guestLogin = async (
  email: string,
  password: string,
): Promise<LoginResponse> => {
  const response = await api.post("/auth/guest/login", { email, password });
  return response.data as LoginResponse;
};

// Bots
export interface Bot {
  id: string;
  name: string;
  user_id: string;
  avatar?: string | null;
  widget_color?: string | null;
  widget_name?: string | null;
  welcome_message?: string | null;
  suggested_questions?: string[];
  document_count?: number;
  created_at?: string;
}

export interface Document {
  id: string;
  filename: string;
  status: string;
  source_type: string;
  uploaded_at: string | null;
  source_url: string | null;
  title: string | null;
  fetched_at: string | null;
  chunk_count: number;
}

export const getBots = async (): Promise<Bot[]> => {
  const response = await api.get("/bots");
  return response.data;
};

export const createBot = async (name: string, avatar?: string): Promise<Bot> => {
  const response = await api.post("/bots", { name, avatar });
  return response.data;
};

export const uploadBotAvatar = async (botId: string, file: File): Promise<Bot> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/bots/${botId}/avatar`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const getBot = async (botId: string): Promise<Bot> => {
  const response = await api.get(`/bots/${botId}`);
  return response.data;
};

export const deleteBot = async (botId: string): Promise<void> => {
  await api.delete(`/bots/${botId}`);
};

export const updateBot = async (
  botId: string,
  data: {
    name?: string;
    avatar?: string;
    widget_color?: string;
    widget_name?: string;
    welcome_message?: string;
    suggested_questions?: string[];
  },
): Promise<Bot> => {
  const response = await api.patch(`/bots/${botId}`, data);
  return response.data;
};

export const getBotConfig = async (botId: string) => {
  const response = await api.get(`/bots/${botId}/config`);
  return response.data;
};

// Analytics
export interface AnalyticsData {
  total_conversations: number;
  total_messages: number;
  messages_per_day: { date: string; count: number }[];
  top_questions: { question: string; count: number }[];
}

export const getBotAnalytics = async (botId: string) => {
  const response = await api.get(`/bots/${botId}/analytics`);
  return response.data as AnalyticsData;
};

// Leads
export interface Lead {
  id: string;
  bot_id: string;
  email: string;
  question: string;
  status: string;
  created_at: string;
}

export const getBotLeads = async (botId: string) => {
  const response = await api.get(`/bots/${botId}/leads`);
  return response.data as Lead[];
};

export const updateLeadStatus = async (botId: string, leadId: string, status: string) => {
  const response = await api.patch(`/bots/${botId}/leads/${leadId}`, { status });
  return response.data;
};

export const deleteLead = async (botId: string, leadId: string) => {
  await api.delete(`/bots/${botId}/leads/${leadId}`);
};

export const exportLeadsCsv = async (botId: string) => {
  const response = await api.get(`/bots/${botId}/leads/export`, { responseType: "blob" });
  return response.data;
};

// Documents
export const uploadDocument = async (botId: string, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/bots/${botId}/documents`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return response.data;
};

export const getDocuments = async (botId: string) => {
  const response = await api.get(`/bots/${botId}/documents`);
  return response.data;
};

export const addUrlDocument = async (botId: string, url: string) => {
  const response = await api.post(`/bots/${botId}/documents/url`, { url });
  return response.data;
};

export const deleteDocument = async (botId: string, documentId: string) => {
  await api.delete(`/bots/${botId}/documents/${documentId}`);
};

export const deleteAllDocuments = async (botId: string) => {
  const response = await api.delete(`/bots/${botId}/documents`);
  return response.data;
};

export const refreshDocument = async (botId: string, documentId: string) => {
  const response = await api.post(`/bots/${botId}/documents/${documentId}/refresh`);
  return response.data;
};

export const createLead = async (botId: string, email: string, question: string) => {
  const response = await api.post(`/bots/${botId}/leads`, { email, question });
  return response.data;
};

export const getDocument = async (botId: string, documentId: string) => {
  const response = await api.get(`/bots/${botId}/documents/${documentId}`);
  return response.data;
};

// Chat
export const sendChatMessage = async (
  botId: string,
  message: string,
  conversationId?: string,
  debug?: boolean,
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (debug) {
    headers["x-debug-retrieval"] = "1";
  }
  const response = await api.post(
    `/bots/${botId}/chat`,
    {
      message,
      conversation_id: conversationId,
    },
    { timeout: 90000, headers },
  );
  return response.data;
};

// Dashboard
export interface DashboardStats {
  total_bots: number;
  total_documents: number;
  total_conversations: number;
  total_messages: number;
  total_leads: number;
}

export interface DashboardOverview {
  stats: DashboardStats;
  recent_bots: { id: string; name: string; document_count: number; created_at: string }[];
  recent_leads: { id: string; email: string; question: string; status: string; created_at: string }[];
}

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const response = await api.get("/dashboard/overview");
  return response.data;
};

// Conversations
export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  bot_id: string;
  created_at: string;
  messages: ConversationMessage[];
}

export interface ConversationListItem {
  id: string;
  bot_id: string;
  created_at: string;
  message_count: number;
  last_message_at?: string;
  preview?: string;
}

export const getBotConversations = async (botId: string): Promise<ConversationListItem[]> => {
  const response = await api.get(`/bots/${botId}/conversations`);
  return response.data;
};

export const getBotConversation = async (botId: string, conversationId: string): Promise<Conversation> => {
  const response = await api.get(`/bots/${botId}/conversations/${conversationId}`);
  return response.data;
};


//account
export interface AccountProfile {
  id: string;
  email: string;
  name?: string;
  picture_url?: string;
  created_at?: string;
}

export const getAccountProfile = async (): Promise<AccountProfile> => {
  const response = await api.get("/account/profile");
  return response.data;
};

export const deleteAccount = async () => {
  await api.delete("/account");
};

// Activity
export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
  meta?: Record<string, unknown>;
}

export const getActivityFeed = async (): Promise<ActivityItem[]> => {
  const response = await api.get("/activity");
  return response.data;
};