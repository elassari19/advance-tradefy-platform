import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const AVAILABLE_MODELS = [
  { id: 'openrouter/free', name: 'OpenRouter Free', provider: 'OpenRouter' },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', provider: 'Z-AI' },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', provider: 'OpenAI' },
  { id: 'arcee-ai/trinity-large-thinking:free', name: 'Trinity Large', provider: 'Arcee AI' },
  { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5', provider: 'MiniMax' },
  { id: 'baidu/cobuddy:free', name: 'CoBuddy', provider: 'Baidu' },
];

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  model?: string;
  content: string;
  hasCode: boolean;
  extractedCode?: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: AIMessage[];
  createdAt: number;
  updatedAt: number;
}

interface AIChatState {
  sessions: ChatSession[];
  currentSessionId: string;
  currentContent: string;
  isStreaming: boolean;
  hasCode: boolean;
  extractedCode?: string;

  updateContent: (content: string, isStreaming?: boolean) => void;
  updateCode: (hasCode: boolean, extractedCode?: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearContent: () => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (model: string, content: string, hasCode: boolean, extractedCode?: string) => void;
  setLoading: (loading: boolean) => void;

  newSession: () => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  switchSession: (id: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      sessions: [],
      currentSessionId: '',
      currentContent: '',
      isStreaming: false,
      hasCode: false,
      extractedCode: undefined,

      updateContent: (content, isStreaming) =>
        set({ currentContent: content, isStreaming: isStreaming ?? false }),

      updateCode: (hasCode, extractedCode) =>
        set({ hasCode, extractedCode }),

      setStreaming: (isStreaming) =>
        set({ isStreaming }),

      clearContent: () =>
        set({ currentContent: '', isStreaming: false, hasCode: false, extractedCode: undefined }),

      addUserMessage: (content) =>
        set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          const newMsg: AIMessage = {
            id: generateId(),
            role: 'user',
            content,
            hasCode: false,
            timestamp: Date.now(),
          };
          const firstUserMsg = session.messages.length === 0;
          const name = firstUserMsg
            ? content.replace(/\n/g, ' ').substring(0, 50).trim() || 'New Chat'
            : session.name;
          const updated = {
            ...session,
            name,
            messages: [...session.messages, newMsg],
            updatedAt: Date.now(),
          };
          return {
            sessions: state.sessions.map(s => s.id === state.currentSessionId ? updated : s),
          };
        }),

      addAssistantMessage: (model, content, hasCode, extractedCode) =>
        set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          const newMsg: AIMessage = {
            id: generateId(),
            role: 'assistant',
            model,
            content,
            hasCode,
            extractedCode,
            timestamp: Date.now(),
          };
          const updated = {
            ...session,
            messages: [...session.messages, newMsg],
            updatedAt: Date.now(),
          };
          return {
            sessions: state.sessions.map(s => s.id === state.currentSessionId ? updated : s),
            currentContent: '',
            isStreaming: false,
            hasCode: false,
            extractedCode: undefined,
          };
        }),

      setLoading: (loading) => set({ isStreaming: loading }),

      newSession: () => {
        const id = generateId();
        const newSess: ChatSession = {
          id,
          name: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          sessions: [...state.sessions, newSess],
          currentSessionId: id,
          currentContent: '',
          isStreaming: false,
          hasCode: false,
          extractedCode: undefined,
        }));
        return id;
      },

      deleteSession: (id) =>
        set((state) => {
          const filtered = state.sessions.filter(s => s.id !== id);
          let newCurrentId = state.currentSessionId;
          if (state.currentSessionId === id) {
            const idx = state.sessions.findIndex(s => s.id === id);
            newCurrentId = filtered[Math.min(idx, filtered.length - 1)]?.id || (filtered.length > 0 ? filtered[filtered.length - 1].id : '');
          }
          return {
            sessions: filtered,
            currentSessionId: newCurrentId,
          };
        }),

      renameSession: (id, name) =>
        set((state) => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, name } : s
          ),
        })),

      switchSession: (id) =>
        set({ currentSessionId: id }),
    }),
    {
      name: 'tradefy-ai-chat',
      partialize: (state) => ({
        sessions: state.sessions.map(s => ({
          ...s,
          messages: s.messages.slice(-200),
        })).slice(-50),
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
