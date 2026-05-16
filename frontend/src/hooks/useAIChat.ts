import { useCallback, useRef } from 'react';
import { useAIChatStore, AVAILABLE_MODELS } from '../stores/aiChatStore';

export function useAIChat(symbol: string, timeframe: string) {
  const {
    updateContent,
    setStreaming,
    clearContent,
    addUserMessage,
    addAssistantMessage,
  } = useAIChatStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (prompt: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    clearContent();
    addUserMessage(prompt);
    setStreaming(true);

    let messageAdded = false;
    let content = '';

    try {
      const response = await fetch('http://127.0.0.1:3000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          models: [AVAILABLE_MODELS[0].id],
          symbol,
          timeframe,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            // Strip SSE "data: " prefix if present
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            const data = JSON.parse(jsonStr);

            if (data.tab_index !== undefined && data.error) {
              console.error('AI model error:', data.error);
              addAssistantMessage('System', `Model error: ${data.error}`, false, undefined);
              messageAdded = true;
              continue;
            }

            if (data.delta !== undefined) {
              content += data.delta;
              updateContent(content, true);
            }

            if (data.is_done) {
              setStreaming(false);
            }

            if (data.content !== undefined && data.model !== undefined) {
              content = data.content;
              updateContent(content, false);
              addAssistantMessage(data.model, data.content, data.has_code || false, data.extracted_code);
              messageAdded = true;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // If stream ended without a final content+model event, add message from accumulated deltas
      if (content && !messageAdded) {
        addAssistantMessage(AVAILABLE_MODELS[0].name, content, false, undefined);
      }

      setStreaming(false);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('AI chat error:', error);
        addAssistantMessage('System', `Error: ${(error as Error).message}`, false, undefined);
      }
      setStreaming(false);
    }
  }, [symbol, timeframe, clearContent, addUserMessage, setStreaming, updateContent, addAssistantMessage]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStreaming(false);
    }
  }, [setStreaming]);

  const getModelName = useCallback((modelId: string) => {
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    return model?.name || modelId.split('/').pop() || modelId;
  }, []);

  return {
    sendMessage,
    stopGeneration,
    getModelName,
  };
}