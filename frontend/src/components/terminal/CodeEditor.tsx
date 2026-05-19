import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Play, CheckCircle, AlertCircle, Loader2, Trash2, Save, FolderOpen, Download, Upload } from 'lucide-react';
import '../../utils/monaco-setup';

interface CodeEditorProps {
  symbol: string;
  code: string;
  isActive: boolean;
  onCodeChange: (code: string) => void;
  onDeploy: (symbol: string, code: string) => Promise<void>;
  onRemove: (symbol: string) => Promise<void>;
  onSave?: (name: string, code: string) => Promise<void>;
  onLoad?: () => void;
}

const DEFAULT_CODE = `# Tradefy Python Strategy
# Available globals: price, candles, buy(qty, tp, sl), sell(qty, tp, sl)

def on_tick(price, candles):
    print(f"Current price: {price}")
    
    # Example logic:
    # if price > 65000:
    #     buy(0.1, tp=70000, sl=60000)
`;

const SUGGESTIONS = [
  // TA functions
  { label: 'ta.sma', kind: 0, insertText: 'ta.sma(${1:source}, ${2:length})', detail: 'Simple Moving Average', docs: 'Calculates the arithmetic mean over a specified number of periods.' },
  { label: 'ta.ema', kind: 0, insertText: 'ta.ema(${1:source}, ${2:length})', detail: 'Exponential Moving Average', docs: 'Weighted moving average that gives more weight to recent prices.' },
  { label: 'ta.rsi', kind: 0, insertText: 'ta.rsi(${1:source}, ${2:length})', detail: 'Relative Strength Index', docs: 'Momentum oscillator (0-100) measuring speed and change of price movements.' },
  { label: 'ta.macd', kind: 0, insertText: 'ta.macd(${1:source}, ${2:fast}, ${3:slow}, ${4:signal})', detail: 'MACD', docs: 'Moving Average Convergence Divergence - trend-following momentum indicator.' },
  { label: 'ta.bb', kind: 0, insertText: 'ta.bb(${1:source}, ${2:length}, ${3:stddev})', detail: 'Bollinger Bands', docs: 'Volatility bands placed above and below a moving average.' },
  { label: 'ta.atr', kind: 0, insertText: 'ta.atr(${1:length})', detail: 'Average True Range', docs: 'Measures market volatility by decomposing the entire range of an asset.' },
  { label: 'ta.stoch', kind: 0, insertText: 'ta.stoch(${1:high}, ${2:low}, ${3:close}, ${4:k_period}, ${5:k_smoothing}, ${6:d_period})', detail: 'Stochastic Oscillator', docs: 'Compares closing price to price range over a period.' },
  { label: 'ta.crossover', kind: 0, insertText: 'ta.crossover(${1:a}, ${2:b})', detail: 'Crossover', docs: 'Returns true when a crosses above b for the first time.' },
  { label: 'ta.crossunder', kind: 0, insertText: 'ta.crossunder(${1:a}, ${2:b})', detail: 'Crossunder', docs: 'Returns true when a crosses below b for the first time.' },
  { label: 'ta.highest', kind: 0, insertText: 'ta.highest(${1:source}, ${2:length})', detail: 'Highest', docs: 'Highest value of source for a specified number of bars back.' },
  { label: 'ta.lowest', kind: 0, insertText: 'ta.lowest(${1:source}, ${2:length})', detail: 'Lowest', docs: 'Lowest value of source for a specified number of bars back.' },
  { label: 'ta.change', kind: 0, insertText: 'ta.change(${1:source}, ${2:length})', detail: 'Change', docs: 'Difference between current value and value n bars ago.' },
  { label: 'ta.alma', kind: 0, insertText: 'ta.alma(${1:source}, ${2:length}, ${3:offset}, ${4:sigma})', detail: 'Arnaud Legoux Moving Average', docs: 'Smoothing filter that reduces lag.' },
  { label: 'ta.vwap', kind: 0, insertText: 'ta.vwap()', detail: 'VWAP', docs: 'Volume-Weighted Average Price from bar open.' },
  // Standalone functions
  { label: 'nz', kind: 0, insertText: 'nz(${1:value}, ${2:fallback})', detail: 'Naught to Zero', docs: 'Replaces None/NaN with a fallback value (default 0).' },
  { label: 'iff', kind: 0, insertText: 'iff(${1:condition}, ${2:true_val}, ${3:false_val})', detail: 'Immediate If', docs: 'One-line conditional: returns true_val if condition else false_val.' },
  { label: 'security', kind: 0, insertText: 'security(${1:symbol}, ${2:timeframe}, ${3:expression})', detail: 'Security', docs: 'Request data from a different symbol/timeframe.' },
  // Plot functions
  { label: 'plot', kind: 0, insertText: 'plot(${1:series}, title="${2:title}", color="${3:color}", style="line")', detail: 'Plot', docs: 'Plots a series on the chart.' },
  { label: 'plotshape', kind: 0, insertText: 'plotshape(${1:series}, title="${2:title}", location="abovebar", style="arrowup")', detail: 'Plot Shape', docs: 'Plots a shape marker on the chart.' },
  { label: 'plotarrow', kind: 0, insertText: 'plotarrow(${1:series}, title="${2:title}", colorup="green", colordown="red")', detail: 'Plot Arrow', docs: 'Plots directional arrows on the chart.' },
  { label: 'hline', kind: 0, insertText: 'hline(${1:price}, title="${2:title}", color="${3:color}")', detail: 'Horizontal Line', docs: 'Draws a horizontal line at a given price level.' },
  { label: 'bgcolor', kind: 0, insertText: 'bgcolor(${1:color})', detail: 'Background Color', docs: 'Colors the chart background.' },
  { label: 'fill', kind: 0, insertText: 'fill(${1:series1}, ${2:series2}, color="${3:color}")', detail: 'Fill', docs: 'Fills the area between two plots.' },
  // Strategy DSL
  { label: '@strategy', kind: 0, insertText: '@strategy(title="${1:My Strategy}", overlay=${2:True}, initial_capital=${3:10000})\ndef ${4:my_strategy}():\n    ${5:pass}', detail: 'Strategy Decorator', docs: 'Declares a strategy with configuration.' },
  { label: 'strategy.entry', kind: 0, insertText: 'strategy.entry("${1:id}", strategy.${2:long}, qty=${3:1.0})', detail: 'Strategy Entry', docs: 'Opens a new position in the given direction.' },
  { label: 'strategy.exit', kind: 0, insertText: 'strategy.exit("${1:id}", from_entry="${2:entry_id}", qty=${3:1.0})', detail: 'Strategy Exit', docs: 'Exits an existing position.' },
  { label: 'strategy.close', kind: 0, insertText: 'strategy.close("${1:id}")', detail: 'Strategy Close', docs: 'Closes a position by ID.' },
  { label: 'strategy.order', kind: 0, insertText: 'strategy.order("${1:id}", strategy.${2:long}, qty=${3:1.0})', detail: 'Strategy Order', docs: 'Places an order in the given direction.' },
  { label: 'strategy.position_size', kind: 1, insertText: 'strategy.position_size', detail: 'Position Size', docs: 'Current position size.' },
  { label: 'strategy.position_avg_price', kind: 1, insertText: 'strategy.position_avg_price', detail: 'Avg Entry Price', docs: 'Average entry price of current position.' },
  { label: 'strategy.equity', kind: 1, insertText: 'strategy.equity', detail: 'Equity', docs: 'Current account equity.' },
  { label: 'input', kind: 0, insertText: 'input(${1:default}, title="${2:title}")', detail: 'Input', docs: 'Declares a strategy input parameter.' },
  // Built-in variables
  { label: 'open', kind: 1, insertText: 'open', detail: 'Open Series', docs: 'Bar open prices (Series).' },
  { label: 'high', kind: 1, insertText: 'high', detail: 'High Series', docs: 'Bar high prices (Series).' },
  { label: 'low', kind: 1, insertText: 'low', detail: 'Low Series', docs: 'Bar low prices (Series).' },
  { label: 'close', kind: 1, insertText: 'close', detail: 'Close Series', docs: 'Bar close prices (Series).' },
  { label: 'volume', kind: 1, insertText: 'volume', detail: 'Volume Series', docs: 'Bar volume (Series).' },
  { label: 'bar_index', kind: 1, insertText: 'bar_index', detail: 'Bar Index', docs: 'Current bar index (0-based).' },
  { label: 'timeframe.period', kind: 1, insertText: 'timeframe.period', detail: 'Timeframe Period', docs: 'Current chart timeframe string.' },
  { label: 'syminfo.tickerid', kind: 1, insertText: 'syminfo.tickerid', detail: 'Ticker ID', docs: 'Current symbol ticker ID.' },
];

export const CodeEditor: React.FC<CodeEditorProps> = ({ symbol, code, isActive, onCodeChange, onDeploy, onRemove, onSave, onLoad }) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    setStatus('idle');
    setMessage('');
  }, [symbol]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    // Extend the built-in Python Monarch tokenizer with Tradefy DSL syntax
    monaco.languages.setMonarchTokensProvider('python', {
      defaultToken: '',
      tokenPostfix: '.python',
      keywords: [
        'False', 'None', 'True', '_', 'and', 'as', 'assert', 'async', 'await',
        'break', 'case', 'class', 'continue', 'def', 'del', 'elif', 'else',
        'except', 'exec', 'finally', 'for', 'from', 'global', 'if', 'import',
        'in', 'is', 'lambda', 'match', 'nonlocal', 'not', 'or', 'pass', 'print',
        'raise', 'return', 'try', 'type', 'while', 'with', 'yield',
        'int', 'float', 'long', 'complex', 'hex', 'abs', 'all', 'any', 'apply',
        'basestring', 'bin', 'bool', 'buffer', 'bytearray', 'callable', 'chr',
        'classmethod', 'cmp', 'coerce', 'compile', 'complex', 'delattr', 'dict',
        'dir', 'divmod', 'enumerate', 'eval', 'execfile', 'file', 'filter',
        'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help',
        'id', 'input', 'intern', 'isinstance', 'issubclass', 'iter', 'len',
        'locals', 'list', 'map', 'max', 'memoryview', 'min', 'next', 'object',
        'oct', 'open', 'ord', 'pow', 'print', 'property', 'reversed', 'range',
        'raw_input', 'reduce', 'reload', 'repr', 'reversed', 'round', 'self',
        'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum',
        'super', 'tuple', 'type', 'unichr', 'unicode', 'vars', 'xrange', 'zip',
        '__dict__', '__methods__', '__members__', '__class__', '__bases__',
        '__name__', '__mro__', '__subclasses__', '__init__', '__import__',
      ],
      brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.bracket' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
      ],
      tokenizer: {
        root: [
          { include: '@whitespace' },
          { include: '@numbers' },
          { include: '@strings' },
          [/[,:;]/, 'delimiter'],
          [/[{}\[\]()]/, '@brackets'],
          [/@[a-zA-Z_]\w*/, 'tag'],
          // Tradefy DSL: @strategy decorator (escaped @@ for literal @)
          [/@@strategy\b/, 'keyword'],
          [/\b(ta\.\w+)\b/, 'type.identifier'],
          [/\b(strategy\.\w+)\b/, 'keyword'],
          [/\b(open|high|low|close|volume)\b/, 'variable.predefined'],
          [/\b(bar_index|timeframe\.period|syminfo\.tickerid)\b/, 'variable.predefined'],
          [/\b(plot|plotshape|plotarrow|hline|bgcolor|fill)\b/, 'support.function'],
          [/\b(buy|sell)\b/, 'keyword.control'],
          [/\b(input|nz|iff|security)\b/, 'support.function'],
          [/\b(strategy)\b/, 'keyword.namespace'],
          [/\b(long|short)\b/, 'constant.language'],
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                '@keywords': 'keyword',
                '@default': 'identifier',
              },
            },
          ],
        ],
        whitespace: [
          [/\s+/, 'white'],
          [/(^#.*$)/, 'comment'],
          [/'''/, 'string', '@endDocString'],
          [/"""/, 'string', '@endDblDocString'],
        ],
        endDocString: [
          [/[^']+/, 'string'],
          [/\\'/, 'string'],
          [/'''/, 'string', '@popall'],
          [/'/, 'string'],
        ],
        endDblDocString: [
          [/[^"]+/, 'string'],
          [/\\"/, 'string'],
          [/"""/, 'string', '@popall'],
          [/"/, 'string'],
        ],
        numbers: [
          [/-?0x([abcdef]|[ABCDEF]|\d)+[lL]?/, 'number.hex'],
          [/-?(\d*\.)?\d+([eE][+\-]?\d+)?[jJ]?[lL]?/, 'number'],
        ],
        strings: [
          [/'$/, 'string.escape', '@popall'],
          [/f'{1,3}/, 'string.escape', '@fStringBody'],
          [/'/, 'string.escape', '@stringBody'],
          [/"$/, 'string.escape', '@popall'],
          [/f"{1,3}/, 'string.escape', '@fDblStringBody'],
          [/"/, 'string.escape', '@dblStringBody'],
        ],
        fStringBody: [
          [/[^\\'\{\}]+$/, 'string', '@popall'],
          [/[^\\'\{\}]+/, 'string'],
          [/\{[^\}':!=]+/, 'identifier', '@fStringDetail'],
          [/\\./, 'string'],
          [/'/, 'string.escape', '@popall'],
          [/\\$/, 'string'],
        ],
        stringBody: [
          [/[^\\']+$/, 'string', '@popall'],
          [/[^\\']+/, 'string'],
          [/\\./, 'string'],
          [/'/, 'string.escape', '@popall'],
          [/\\$/, 'string'],
        ],
        fDblStringBody: [
          [/[^\\"\{\}]+$/, 'string', '@popall'],
          [/[^\\"\{\}]+/, 'string'],
          [/\{[^\}':!=]+/, 'identifier', '@fStringDetail'],
          [/\\./, 'string'],
          [/"/, 'string.escape', '@popall'],
          [/\\$/, 'string'],
        ],
        dblStringBody: [
          [/[^\\"]+$/, 'string', '@popall'],
          [/[^\\"]+/, 'string'],
          [/\\./, 'string'],
          [/"/, 'string.escape', '@popall'],
          [/\\$/, 'string'],
        ],
        fStringDetail: [
          [/[:][^}]+/, 'string'],
          [/[!][ars]/, 'string'],
          [/=/, 'string'],
          [/\}/, 'identifier', '@pop'],
        ],
      },
    });

    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: SUGGESTIONS.map(s => ({
            ...s,
            kind: s.kind === 1 ? monaco.languages.CompletionItemKind.Variable : monaco.languages.CompletionItemKind.Function,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
        };
      },
    });

    // Add hover documentation for DSL functions
    monaco.languages.registerHoverProvider('python', {
      provideHover: (model: any, position: any) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const suggestion = SUGGESTIONS.find(s => s.label === word.word);
        if (!suggestion) return null;
        return {
          contents: [
            { value: `**${suggestion.label}**` },
            { value: suggestion.detail || '' },
            { value: (suggestion as any).docs || '' },
          ],
        };
      },
    });

  }, []);


  const handleDeploy = async () => {
    setStatus('loading');
    try {
      await onDeploy(symbol, code);
      setStatus('success');
      setMessage(`Strategy deployed for ${symbol}`);
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      const msg = err?.message || 'Failed to deploy strategy';
      setMessage(msg);
    }
  };

  const handleRemove = async () => {
    try {
      await onRemove(symbol);
      onCodeChange(DEFAULT_CODE);
      setStatus('idle');
      setMessage('');
    } catch {
      setStatus('error');
      setMessage('Failed to remove strategy');
    }
  };

  const handleSaveClick = () => {
    setSaveName(symbol.replace('/', '_') + '_strategy');
    setShowSavePrompt(true);
  };

  const handleExport = async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.saveFile({
      defaultPath: `${symbol.replace('/', '_')}_strategy.py`,
      filters: [{ name: 'Python', extensions: ['py'] }],
      content: code,
    });
    if (filePath) {
      setStatus('success');
      setMessage(`Exported to ${filePath}`);
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleImport = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFile({
      filters: [{ name: 'Python', extensions: ['py'] }],
    });
    if (result) {
      onCodeChange(result.content);
      setStatus('success');
      setMessage(`Imported ${result.filePath}`);
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleSaveConfirm = async () => {
    if (!onSave || !saveName.trim()) return;
    setShowSavePrompt(false);
    setStatus('loading');
    try {
      await onSave(saveName.trim(), code);
      setStatus('success');
      setMessage('Strategy saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setMessage('Failed to save strategy');
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">strategy.py</span>
          <span className="text-[10px] text-zinc-600">—</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-green-500' : 'text-zinc-600'}`}>
            {symbol} {isActive ? '● Active' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {window.electronAPI && (
            <>
              <button
                onClick={handleImport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <Upload size={12} />
                Import
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <Download size={12} />
                Export
              </button>
            </>
          )}
          {onLoad && (
            <button
              onClick={onLoad}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <FolderOpen size={12} />
              Load
            </button>
          )}
          {onSave && (
            <button
              onClick={handleSaveClick}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <Save size={12} />
              Save
            </button>
          )}
          {isActive && (
            <button
              onClick={handleRemove}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={12} />
              Remove
            </button>
          )}
          <button
            onClick={handleDeploy}
            disabled={status === 'loading'}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              status === 'success' 
                ? 'bg-green-600 text-white' 
                : status === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-primary hover:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20'
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
      </div>
      
      <div className="flex-1 min-h-[300px] relative">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          value={code}
          onChange={(value) => onCodeChange(value || '')}
          onMount={handleEditorMount}
          onValidate={(markers: any[]) => {
            const errors = markers.filter((m: any) => m.severity === 8);
            if (errors.length > 0) {
              const first = errors[0];
              setStatus('error');
              setMessage(`Line ${first.startLineNumber}: ${first.message}`);
            } else if (status === 'error') {
              setStatus('idle');
              setMessage('');
            }
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
          }}
        />

        {showSavePrompt && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-3">Save Strategy</h3>
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Strategy name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 font-mono mb-3"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm(); if (e.key === 'Escape') setShowSavePrompt(false); }}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowSavePrompt(false)}
                  className="px-3 py-1.5 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfirm}
                  disabled={!saveName.trim()}
                  className="px-3 py-1.5 rounded text-[10px] font-bold bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
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
