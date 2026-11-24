export interface Model {
  id: string;
  label: string;
  description: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  created_at: string;
}

export interface SessionDetail extends SessionSummary {
  messages: Message[];
}
