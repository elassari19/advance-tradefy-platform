import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAIChatStore, AVAILABLE_MODELS } from '../../stores/aiChatStore';
import { useAIChat } from '../../hooks/useAIChat';
import { Send, Square, ChevronDown, Copy, Plus, Trash2, History, Bot, Edit3, Check, X } from 'lucide-react';

interface AIChatProps {
  symbol: string;
  timeframe: string;
  onApplyCode?: (code: string) => void;
}

export function AIChat({ symbol, timeframe, onApplyCode }: AIChatProps) {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const {
    sessions,
    currentSessionId,
    currentContent,
    isStreaming,
    clearContent,
    newSession,
    deleteSession,
    renameSession,
    switchSession,
  } = useAIChatStore();

  const currentSession = useMemo(() => sessions.find(s => s.id === currentSessionId), [sessions, currentSessionId]);
  const currentMessages = currentSession?.messages ?? [];

  const { sendMessage, stopGeneration: stop, getModelName } = useAIChat();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentContent, currentSession?.messages.length]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (sessions.length === 0) {
      newSession();
    }
  }, [sessions.length, newSession]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      if (!currentSessionId && sessions.length === 0) {
        newSession();
      }
      sendMessage(input.trim(), symbol, timeframe, selectedModel);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleEditMessage = (content: string) => {
    setInput(content);
    textareaRef.current?.focus();
  };

  const handleNewChat = () => {
    newSession();
    setInput('');
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      newSession();
    }
    deleteSession(id);
    setRenamingId(null);
  };

  const handleStartRename = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      renameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
  };

  return (
    <div className="flex h-full bg-[#09090b] text-[#fafafa] font-sans">
      {/* History Sidebar */}
      <div className={`border-r border-zinc-800 bg-zinc-950/50 flex flex-col transition-all duration-300 ${showHistory ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <History size={16} className="text-zinc-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Sessions</h2>
          </div>
          <button onClick={handleNewChat} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors" title="New Chat">
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">No sessions yet</div>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => { switchSession(session.id); setRenamingId(null); }}
              className={`group flex items-center gap-2 px-3 py-2.5 text-left text-xs cursor-pointer transition-colors border-b border-zinc-800/50 ${
                session.id === currentSessionId
                  ? 'bg-zinc-800/60 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200'
              }`}
            >
              {renamingId === session.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={handleFinishRename} className="p-0.5 hover:text-green-400 shrink-0"><Check size={12} /></button>
                  <button onClick={handleCancelRename} className="p-0.5 hover:text-red-400 shrink-0"><X size={12} /></button>
                </div>
              ) : (
                <>
                  <span className="flex-1 truncate">{session.name}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => handleStartRename(e, session.id, session.name)}
                      className="p-0.5 hover:text-blue-400"
                      title="Rename"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="p-0.5 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {!showHistory && (
              <button onClick={() => setShowHistory(true)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors" title="Show History">
                <History size={16} />
              </button>
            )}
            <Bot size={18} className="text-zinc-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Assistant</h2>
            <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{symbol} {timeframe}</span>
            {currentSession && currentSession.messages.length > 0 && (
              <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">{currentSession.name}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleNewChat} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors" title="New Chat">
              <Plus size={14} />
            </button>
            <button onClick={clearContent} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors" title="Clear">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Model Selector Bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
          <span className="text-xs text-zinc-500">Model:</span>
          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-white transition-colors"
            >
              <span>{getModelName(selectedModel)}</span>
              <ChevronDown size={12} />
            </button>

            {modelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setModelDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {AVAILABLE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model.id); setModelDropdownOpen(false); }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-zinc-800 transition-colors ${selectedModel === model.id ? 'bg-zinc-800 text-blue-400' : 'text-zinc-300'}`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-zinc-500 text-[10px]">{model.provider}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="text-[10px] text-zinc-600 ml-auto">{isStreaming ? 'Generating...' : 'Ready'}</span>
        </div>

        {/* Chat Messages - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Welcome Message */}
          {currentMessages.length === 0 && !currentContent && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot size={48} className="text-zinc-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Welcome to Pen Script</h3>
              <p className="text-sm text-zinc-400 max-w-md">
                I can help you analyze charts, create trading strategies, explain indicators,
                and improve your trading decisions. Just ask!
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-lg">
                {['Analyze this chart', 'Create a MACD strategy', 'Explain RSI indicator', 'Suggest improvements'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-full text-xs text-zinc-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          {currentMessages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group relative max-w-[80%] rounded-lg p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium opacity-70">{msg.role === 'user' ? 'You' : msg.model || 'Assistant'}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-black/20 transition-colors"
                      title="Copy message"
                    >
                      <Copy size={12} />
                    </button>
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleEditMessage(msg.content)}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-black/20 transition-colors"
                        title="Edit and re-send"
                      >
                        <Edit3 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm whitespace-pre-wrap font-mono leading-relaxed">{msg.content}</div>
                {msg.hasCode && msg.extractedCode && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-green-400 font-medium">Python Code Detected</span>
                      <div className="flex gap-1">
                        <button onClick={() => navigator.clipboard.writeText(msg.extractedCode || '')} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors" title="Copy Code">
                          <Copy size={12} />
                        </button>
                        <button onClick={() => onApplyCode?.(msg.extractedCode || '')} className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs text-white font-medium transition-colors">
                          Apply
                        </button>
                      </div>
                    </div>
                    <pre className="text-xs bg-zinc-900 rounded p-2 overflow-x-auto"><code>{msg.extractedCode}</code></pre>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming Response */}
          {isStreaming && currentContent && (
            <div className="flex justify-start">
              <div className="group relative bg-zinc-800 text-zinc-200 rounded-lg p-4 max-w-[80%]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500">Assistant (generating...)</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigator.clipboard.writeText(currentContent)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-black/20 transition-colors"
                      title="Copy message"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
                <div className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                  {currentContent}<span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about trading, analysis, or strategy..."
              rows={1}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-zinc-500 resize-none min-h-[48px] max-h-[200px]"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button type="button" onClick={stop} className="p-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors shrink-0">
                <Square size={18} className="text-white" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0">
                <Send size={18} className="text-white" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default AIChat;
