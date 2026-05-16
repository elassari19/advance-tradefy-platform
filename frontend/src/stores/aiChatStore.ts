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

interface AIChatState {
  sessionId: string;
  messages: AIMessage[];
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
  newSession: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      sessionId: generateId(),
      messages: [],
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
        set((state) => ({
          messages: [...state.messages, {
            id: generateId(),
            role: 'user',
            content,
            hasCode: false,
            timestamp: Date.now(),
          }],
        })),

      addAssistantMessage: (model, content, hasCode, extractedCode) =>
        set((state) => ({
          messages: [...state.messages, {
            id: generateId(),
            role: 'assistant',
            model,
            content,
            hasCode,
            extractedCode,
            timestamp: Date.now(),
          }],
          currentContent: '',
          isStreaming: false,
          hasCode: false,
          extractedCode: undefined,
        })),

      setLoading: (loading) => set({ isStreaming: loading }),

      newSession: () => set({
        sessionId: generateId(),
        messages: [],
        currentContent: '',
        isStreaming: false,
        hasCode: false,
        extractedCode: undefined,
      }),
    }),
    {
      name: 'tradefy-ai-chat',
      partialize: (state) => ({
        messages: state.messages.slice(-50),
      }),
    }
  )
);