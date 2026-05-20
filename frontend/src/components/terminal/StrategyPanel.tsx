import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, CheckCircle, AlertCircle, Loader2, Trash2, Save, FolderOpen, Download, Upload, FileCode } from 'lucide-react';
import '../../utils/monaco-setup';

interface StrategyPanelProps {
  symbol: string;
  code: string;
  isActive: boolean;
  onCodeChange: (code: string) => void;
  onDeploy: (symbol: string, code: string, language?: string) => Promise<void>;
  onRemove: (symbol: string) => Promise<void>;
  onSave?: (name: string, code: string) => Promise<void>;
  onLoad?: () => void;
}

const DEFAULT_CODE_PYTHON = `# Tradefy Python Strategy
# Available globals: price, candles, buy(qty, tp, sl), sell(qty, tp, sl)

def on_tick(price, candles):
    print(f"Current price: {price}")
    
    # Example logic:
    # if price > 65000:
    #     buy(0.1, tp=70000, sl=60000)
`;

const DEFAULT_CODE_JS = `// Tradefy JavaScript Strategy (Client-side)
//
// Available via 'api' object:
//   api.candles      - Array of candle objects
//   api.open/high/low/close/volume/time - price arrays
//   api.plot(series, title?, color?, style?)  - plot a line series on chart
//   api.plotshape(series, title?, location?, style?, color?) - plot shapes (arrowup, arrowdown, circle, square, diamond, cross, etc.)
//   api.hline(price, title?, color?)  - horizontal line
//   api.drawRectangle(id, time1, price1, time2, price2, color, fill?)
//   api.clearDrawings()
//   api.state         - persistent object between calls
//   api.buy(qty, sl?, tp?)  - adds buy arrow on chart
//   api.sell(qty, sl?, tp?)  - adds sell arrow on chart

// Zone Breakout Detection Strategy
const zonePeriod = 8;
const tightRangePct = 0.003;

const recentCandles = api.close.slice(-zonePeriod - 1, -1);
const zoneHigh = Math.max(...recentCandles);
const zoneLow = Math.min(...recentCandles);
const zoneRange = zoneHigh - zoneLow;
const avgPrice = recentCandles.reduce((a, b) => a + b, 0) / recentCandles.length;

api.hline(zoneHigh, 'Zone High', '#FFD700');
api.hline(zoneLow, 'Zone Low', '#FFD700');

if (zoneRange < avgPrice * tightRangePct) {
  const breakAbove = api.close[api.close.length - 1] > zoneHigh;
  const breakBelow = api.close[api.close.length - 1] < zoneLow;

  if (breakAbove) {
    api.plotshape([breakAbove], 'Buy Signal', 'belowbar', 'arrowup', '#22c55e');
    api.buy(0.1);
  } else if (breakBelow) {
    api.plotshape([breakBelow], 'Sell Signal', 'abovebar', 'arrowdown', '#ef4444');
    api.sell(0.1);
  }
}
`;

const SUGGESTIONS = [
  { label: 'ta.sma', kind: 0, insertText: 'ta.sma(${1:source}, ${2:length})', detail: 'Simple Moving Average' },
  { label: 'ta.ema', kind: 0, insertText: 'ta.ema(${1:source}, ${2:length})', detail: 'Exponential Moving Average' },
  { label: 'ta.rsi', kind: 0, insertText: 'ta.rsi(${1:source}, ${2:length})', detail: 'Relative Strength Index' },
  { label: 'ta.macd', kind: 0, insertText: 'ta.macd(${1:source}, ${2:fast}, ${3:slow}, ${4:signal})', detail: 'MACD' },
  { label: 'ta.bb', kind: 0, insertText: 'ta.bb(${1:source}, ${2:length}, ${3:stddev})', detail: 'Bollinger Bands' },
  { label: 'ta.atr', kind: 0, insertText: 'ta.atr(${1:length})', detail: 'Average True Range' },
  { label: 'ta.stoch', kind: 0, insertText: 'ta.stoch(${1:high}, ${2:low}, ${3:close}, ${4:k_period}, ${5:k_smoothing}, ${6:d_period})', detail: 'Stochastic Oscillator' },
  { label: 'ta.crossover', kind: 0, insertText: 'ta.crossover(${1:a}, ${2:b})', detail: 'Crossover' },
  { label: 'ta.crossunder', kind: 0, insertText: 'ta.crossunder(${1:a}, ${2:b})', detail: 'Crossunder' },
  { label: 'ta.highest', kind: 0, insertText: 'ta.highest(${1:source}, ${2:length})', detail: 'Highest' },
  { label: 'ta.lowest', kind: 0, insertText: 'ta.lowest(${1:source}, ${2:length})', detail: 'Lowest' },
  { label: 'ta.vwap', kind: 0, insertText: 'ta.vwap()', detail: 'VWAP' },
  { label: 'nz', kind: 0, insertText: 'nz(${1:value}, ${2:fallback})', detail: 'Naught to Zero' },
  { label: 'plot', kind: 0, insertText: 'plot(${1:series}, title="${2:title}", color="${3:color}", style="line")', detail: 'Plot' },
  { label: 'plotshape', kind: 0, insertText: 'plotshape(${1:series}, title="${2:title}", location="abovebar", style="arrowup")', detail: 'Plot Shape' },
  { label: 'hline', kind: 0, insertText: 'hline(${1:price}, title="${2:title}", color="${3:color}")', detail: 'Horizontal Line' },
  { label: 'bgcolor', kind: 0, insertText: 'bgcolor(${1:color})', detail: 'Background Color' },
  { label: 'buy', kind: 0, insertText: 'buy(${1:qty}, tp=${2:None}, sl=${3:None})', detail: 'Buy' },
  { label: 'sell', kind: 0, insertText: 'sell(${1:qty}, tp=${2:None}, sl=${3:None})', detail: 'Sell' },
  { label: 'open', kind: 1, insertText: 'open', detail: 'Open Series' },
  { label: 'high', kind: 1, insertText: 'high', detail: 'High Series' },
  { label: 'low', kind: 1, insertText: 'low', detail: 'Low Series' },
  { label: 'close', kind: 1, insertText: 'close', detail: 'Close Series' },
  { label: 'volume', kind: 1, insertText: 'volume', detail: 'Volume Series' },
  { label: 'bar_index', kind: 1, insertText: 'bar_index', detail: 'Bar Index' },
];

export const StrategyPanel: React.FC<StrategyPanelProps> = ({ symbol, code, isActive, onCodeChange, onDeploy, onRemove, onSave, onLoad }) => {
  const [editorLang, setEditorLang] = useState<'python' | 'javascript'>('python');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [markers, setMarkers] = useState<Array<{ line: number; message: string; severity: string }>>([]);
  const [editorHeight, setEditorHeight] = useState(0);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setEditorHeight(node.clientHeight);
    }
  }, []);

  useEffect(() => {
    setStatus('idle');
    setMessage('');
    setMarkers([]);
  }, [symbol, editorLang]);

  const prevLangRef = useRef(editorLang);
  useEffect(() => {
    const prev = prevLangRef.current;
    prevLangRef.current = editorLang;
    if (prev === editorLang) return;
    if (code === DEFAULT_CODE_PYTHON && editorLang === 'javascript') {
      onCodeChange(DEFAULT_CODE_JS);
    } else if (code === DEFAULT_CODE_JS && editorLang === 'python') {
      onCodeChange(DEFAULT_CODE_PYTHON);
    }
  }, [editorLang]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    monaco.languages.setMonarchTokensProvider('python', {
      defaultToken: '',
      tokenPostfix: '.python',
      keywords: [
        'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
        'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
        'except', 'exec', 'finally', 'for', 'from', 'global', 'if', 'import',
        'in', 'is', 'lambda', 'match', 'nonlocal', 'not', 'or', 'pass', 'print',
        'raise', 'return', 'try', 'type', 'while', 'with', 'yield',
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
          [/@@strategy\b/, 'keyword'],
          [/\b(ta\.\w+)\b/, 'type.identifier'],
          [/\b(open|high|low|close|volume)\b/, 'variable.predefined'],
          [/\b(bar_index|timeframe\.period)\b/, 'variable.predefined'],
          [/\b(plot|plotshape|plotarrow|hline|bgcolor|fill)\b/, 'support.function'],
          [/\b(buy|sell)\b/, 'keyword.control'],
          [/\b(input|nz|iff|security)\b/, 'support.function'],
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
          ],
        };
      },
    });
  }, []);

  const handleDeploy = async () => {
    setStatus('loading');
    setMessage('Checking strategy...');
    try {
      await onDeploy(symbol, code, editorLang);
      setStatus('success');
      setMessage('Strategy added to chart');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      const msg = err?.message || 'Failed to add strategy';
      setMessage(msg);
    }
  };

  const handleRemove = async () => {
    try {
      await onRemove(symbol);
      onCodeChange(DEFAULT_CODE_PYTHON);
      setStatus('idle');
      setMessage('');
      setMarkers([]);
    } catch {
      setStatus('error');
      setMessage('Failed to remove strategy');
    }
  };

  const handleSaveClick = () => {
    setSaveName(symbol.replace('/', '_') + '_strategy');
    setShowSavePrompt(true);
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

  const handleExport = async () => {
    if (!window.electronAPI) return;
    const ext = editorLang === 'python' ? 'py' : 'js';
    const filePath = await window.electronAPI.saveFile({
      defaultPath: `${symbol.replace('/', '_')}_strategy.${ext}`,
      filters: [{ name: editorLang === 'python' ? 'Python' : 'JavaScript', extensions: [ext] }],
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
    const ext = editorLang === 'python' ? 'py' : 'js';
    const result = await window.electronAPI.openFile({
      filters: [{ name: editorLang === 'python' ? 'Python' : 'JavaScript', extensions: [ext] }],
    });
    if (result) {
      onCodeChange(result.content);
      setStatus('success');
      setMessage(`Imported ${result.filePath}`);
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const errorCount = markers.filter(m => m.severity === 'error').length;
  const warnCount = markers.filter(m => m.severity === 'warning').length;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
            {editorLang === 'python' ? 'strategy.py' : 'strategy.js'}
          </span>
          {isActive && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditorLang(prev => prev === 'python' ? 'javascript' : 'python')}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Toggle language"
          >
            <FileCode size={10} />
            {editorLang === 'python' ? 'Python' : 'JS'}
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          {window.electronAPI && (
            <>
              <button
                onClick={handleImport}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Import"
              >
                <Download size={14} />
              </button>
              <button
                onClick={handleExport}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Export"
              >
                <Upload size={14} />
              </button>
            </>
          )}
          {onLoad && (
            <button
              onClick={onLoad}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Load"
            >
              <FolderOpen size={14} />
            </button>
          )}
          {onSave && (
            <button
              onClick={handleSaveClick}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Save"
            >
              <Save size={14} />
            </button>
          )}
          {isActive && (
            <button
              onClick={handleRemove}
              className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove from chart"
            >
              <Trash2 size={14} />
            </button>
          )}
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button
            onClick={handleDeploy}
            disabled={status === 'loading'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
              status === 'success'
                ? 'bg-green-600 text-white'
                : status === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-primary hover:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20'
            } disabled:opacity-50`}
          >
            {status === 'loading' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle size={13} />
            ) : status === 'error' ? (
              <AlertCircle size={13} />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
            {status === 'loading' ? 'Checking...' : status === 'success' ? 'Added' : status === 'error' ? 'Error' : 'Add to Chart'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          defaultLanguage={editorLang}
          language={editorLang}
          theme="vs-dark"
          value={code}
          onChange={(value) => onCodeChange(value || '')}
          onMount={handleEditorMount}
          onValidate={(validationMarkers: any[]) => {
            const mapped = validationMarkers.map((m: any) => ({
              line: m.startLineNumber,
              message: m.message,
              severity: m.severity === 8 ? 'error' : m.severity === 4 ? 'warning' : 'info',
            }));
            setMarkers(mapped);
            const errors = validationMarkers.filter((m: any) => m.severity === 8);
            if (errors.length > 0) {
              const first = errors[0];
              setStatus('error');
              setMessage(`Line ${first.startLineNumber}: ${first.message}`);
            } else if (status === 'error') {
              if (validationMarkers.length === 0) {
                setStatus('idle');
                setMessage('');
              }
            }
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            renderLineHighlight: 'line',
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

      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-3">
          {message ? (
            <span className={`text-[10px] font-medium flex items-center gap-1.5 ${
              status === 'success' ? 'text-green-400' :
              status === 'error' ? 'text-red-400' :
              'text-zinc-400'
            }`}>
              {status === 'error' && <AlertCircle size={10} />}
              {status === 'success' && <CheckCircle size={10} />}
              {message}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-600">
              {isActive ? 'Strategy active on chart' : 'Edit script and add to chart'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {errorCount > 0 && (
            <span className="text-[10px] text-red-400 font-medium">{errorCount} error{errorCount > 1 ? 's' : ''}</span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] text-yellow-400 font-medium">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>
          )}
          <span className="text-[10px] text-zinc-600">{symbol}</span>
        </div>
      </div>
    </div>
  );
};
