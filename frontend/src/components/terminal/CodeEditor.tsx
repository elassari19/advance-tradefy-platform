import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface CodeEditorProps {
  onDeploy: (code: string) => Promise<void>;
}

const DEFAULT_CODE = `# Tradefy Python Strategy
# Available globals: price, buy(qty, tp, sl), sell(qty, tp, sl)

def on_tick(price):
    print(f"Current price: {price}")
    
    # Example logic:
    # if price > 65000:
    #     buy(0.1, tp=70000, sl=60000)
`;

export const CodeEditor: React.FC<CodeEditorProps> = ({ onDeploy }) => {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleDeploy = async () => {
    setStatus('loading');
    try {
      await onDeploy(code);
      setStatus('success');
      setMessage('Strategy deployed successfully');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setMessage('Failed to deploy strategy');
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">strategy.py</span>
        </div>
        <button
          onClick={handleDeploy}
          disabled={status === 'loading'}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
            status === 'success' 
              ? 'bg-green-600 text-white' 
              : status === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
          } disabled:opacity-50`}
        >
          {status === 'loading' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle size={14} />
          ) : status === 'error' ? (
            <AlertCircle size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {status === 'loading' ? 'Deploying...' : status === 'success' ? 'Deployed' : status === 'error' ? 'Error' : 'Deploy Strategy'}
        </button>
      </div>
      
      <div className="flex-1 min-h-[300px]">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
          }}
        />
      </div>
      
      {message && (
        <div className={`px-4 py-2 text-[10px] font-medium border-t border-zinc-800 ${
          status === 'success' ? 'text-green-400 bg-green-500/5' : 'text-red-400 bg-red-500/5'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
};
