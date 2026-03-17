
import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ResultDisplay from './components/ResultDisplay';
import { analyzeText, transformToVerticalNumbers, convertToVisibleVerticalNumbers, decodeVerticalNumbers } from './services/geminiService';
import { ProofreadingResult, AnalysisStatus } from './types';
import { Search, Check, AlertCircle, Upload, Trash2, Copy, FileText } from 'lucide-react';

// AIが文章をチェックする時の「手順（ステップ）」のリストだよ。
// 画面に「今これをやっているよ！」と表示するために使うんだ。
const ANALYSIS_STEPS = [
  { label: '文意の読み取り', duration: 1500 },
  { label: 'ドキュメントデータの解析', duration: 2000 },
  { label: '見出しと原稿の整合性チェック', duration: 2500 },
  { label: '河北新報「編集の手引」の適用', duration: 2000 },
  { label: '誤字脱字・てにをはの精査', duration: 2000 },
  { label: 'Google Searchによる事実関係の検証', duration: 3000 },
  { label: '校閲レポートと最終稿の生成', duration: 1500 },
];

// 文章をきれいに整えるための関数（魔法の箱）だよ。
// 例えば、全角の数字（１２３）を半角（123）に直したりするよ。
const normalizeText = (str: string): string => {
  if (!str) return "";
  
  // 1. ルビタグの変換 (<ruby><rb>選</rb><rt>せん</rt></ruby> -> 選（せん）)
  let text = str.replace(/<ruby>\s*<rb>(.*?)<\/rb>\s*<rt>(.*?)<\/rt>\s*<\/ruby>/gi, '$1（$2）');
  // HTML5形式の簡易ルビにも対応 (<ruby>選<rt>せん</rt></ruby> -> 選（せん）)
  text = text.replace(/<ruby>(.*?)\s*<rt>(.*?)<\/rt>\s*<\/ruby>/gi, '$1（$2）');

  // 2. 行頭の整形（新聞記事の通例：1字下げ）
  // - 「」や「 で始まる場合は全角スペースに置換（不要な記号・文字化け対策）
  // - 数字や記号以外（通常の文字）で始まる場合は、行頭に全角スペースを付与
  text = text.split('\n').map(line => {
    const trimmed = line.trimStart();
    if (!trimmed) return line;
    
    // 行頭の「」または「 を全角スペースに置換（文字化け・不要記号対策）
    // 「」だけでなく、」や「」」など、行頭に不自然に現れるカギカッコ類を対象にします
    if (/^[「」]+/.test(trimmed)) {
      return '　' + trimmed.replace(/^[「」]+/, '');
    }
    
    // 数字、記号、または特定の開始文字（カッコ類など）で始まるか判定
    // これらに該当しない（＝普通の文字で始まる）場合は1字下げる
    const startsWithSpecial = /^[0-9０-９!-/:-@[-`{-~■□◆◇●○◎△▽▲▼※＊＊☆★◇◆□■（【『〈《〔［｛«‹]/.test(trimmed);
    
    if (!startsWithSpecial) {
      return '　' + trimmed;
    }
    return line;
  }).join('\n');

  // 3. 全角英数・ピリオドを半角に
  return text.replace(/[０-９Ａ-Ｚａ-ｚ．]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
};

// ここからがアプリのメイン画面を作る部分だよ！
const App: React.FC = () => {
  // useStateは「アプリが今どうなっているか」を覚えておくためのメモ帳みたいなものだよ。
  // inputText: 入力された文章を覚えておく
  const [inputText, setInputText] = useState('');
  // uploadedFile: アップロードされたファイル（画像やPDF）を覚えておく
  const [uploadedFile, setUploadedFile] = useState<{ data: string, mimeType: string } | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  // status: 今AIがチェック中かどうか（IDLE:待機中、LOADING:チェック中など）を覚えておく
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  // result: AIからのチェック結果を覚えておく
  const [result, setResult] = useState<ProofreadingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number;
    if (status === AnalysisStatus.LOADING) {
      setTimeout(() => {
        loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      const stepInterval = 2000;
      timer = window.setInterval(() => {
        setCurrentStepIdx((prev) => (prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev));
        setProgress((prev) => Math.min(prev + (100 / ANALYSIS_STEPS.length), 95));
      }, stepInterval);
    } else {
      setCurrentStepIdx(0);
      setProgress(0);
    }
    return () => clearInterval(timer);
  }, [status]);

  // 文章をきれいに整える処理（normalizeText）を呼び出すところだよ
  const applyNormalization = () => {
    if (isComposing) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // 1. 全角英数を半角に
    let text = normalizeText(textarea.value);
    // 2. もしシステム用コード（PUA）が含まれていれば可視化プレースホルダ（太字数字）に変換
    text = decodeVerticalNumbers(text);
    // 3. 2桁の数字を自動的に太字数字に変換
    text = convertToVisibleVerticalNumbers(text);
    
    if (text !== textarea.value) {
      setInputText(text);
      requestAnimationFrame(() => {
        textarea.setSelectionRange(start, end);
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      // EPSファイルの場合、MIMEタイプが空または不正確な場合があるため補完
      const isEps = file.name.toLowerCase().endsWith('.eps');
      const mimeType = isEps ? 'application/postscript' : file.type;
      
      if (isEps) {
        setError('EPSデータはAIモデルが直接読み取れない場合があります。解析に失敗した場合は、PDFまたは画像（PNG/JPG）に変換してアップロードしてください。');
      } else {
        setError(null);
      }

      setUploadedFile({ data: base64Data, mimeType });
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 「校閲（チェック）する」ボタンが押されたときに動く、一番大事な関数だよ！
  const handleAnalyze = async () => {
    // まずは文章をきれいに整えるよ
    const finalNormalizedText = normalizeText(inputText);
    // 文章もファイルも空っぽだったら、何もしないで終わるよ
    if (!finalNormalizedText.trim() && !uploadedFile) return;

    // AIにチェックをお願いする準備をするよ
    setInputText(finalNormalizedText);
    setStatus(AnalysisStatus.LOADING); // 「今チェック中だよ！」という状態にする
    setResult(null); // 前の結果を消す
    setError(null); // 前のエラーを消す
    
    try {
      // ここで、AI（Gemini）に文章とファイルを渡してチェックをお願いしているよ！
      // await は「AIのお返事が来るまで待つ」という意味だよ。
      const data = await analyzeText(finalNormalizedText, uploadedFile || undefined);
      setResult(data);
      setProgress(100);
      setStatus(AnalysisStatus.SUCCESS);
      setTimeout(() => {
        const resultEl = document.getElementById('results-section');
        if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || '校閲中にエラーが発生しました。インターネット接続やファイルサイズを確認して、もう一度お試しください。';
      setError(errorMessage);
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleClear = () => {
    setInputText('');
    removeFile();
    setResult(null);
    setStatus(AnalysisStatus.IDLE);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 pt-16 pb-32">
        <div className="text-center space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold tracking-wide">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            マルチモーダル（画像・PDF）対応
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.1]">
            AI<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">校閲さん</span>
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
            本日も原稿執筆、紙面編集おつかれさまでした。わたしがテキストや紙面画像、PDFの誤字脱字、事実関係の誤りをチェックするお手伝いをします。
          </p>
        </div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-[2.5rem] blur opacity-10 group-focus-within:opacity-25 transition duration-500"></div>
          <div className="relative bg-white rounded-[2rem] shadow-2xl shadow-emerald-200/40 border border-emerald-100/60 overflow-hidden">
            <div className="p-1 relative">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={() => setTimeout(applyNormalization, 0)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => { setIsComposing(false); setTimeout(applyNormalization, 10); }}
                onBlur={applyNormalization}
                placeholder="校閲したいテキストを入力するか、画像やPDFを追加してください..."
                className={`w-full min-h-[300px] p-8 text-lg text-slate-800 placeholder:text-slate-300 focus:outline-none resize-none border-0 leading-[1.8] font-medium transition-all duration-500 ${status === AnalysisStatus.LOADING ? 'opacity-40 blur-[1px]' : 'opacity-100'}`}
                style={{ fontFamily: "'Inter', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif" }}
                disabled={status === AnalysisStatus.LOADING}
              />
              
              {/* File Preview Area */}
              {filePreview && uploadedFile && (
                <div className="px-8 pb-4 animate-in fade-in zoom-in duration-300">
                  <div className="relative inline-block group/preview">
                    {uploadedFile.mimeType === 'application/pdf' || uploadedFile.mimeType === 'application/postscript' ? (
                      <div className="h-32 w-48 rounded-xl border-2 border-emerald-100 bg-emerald-50 flex flex-col items-center justify-center gap-2 shadow-lg">
                        <FileText size={32} className="text-emerald-600" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase">
                          {uploadedFile.mimeType === 'application/pdf' ? 'PDF DOCUMENT' : 'EPS DATA'}
                        </span>
                      </div>
                    ) : (
                      <img 
                        src={filePreview} 
                        alt="校正対象の画像" 
                        className="h-32 rounded-xl border-2 border-emerald-100 shadow-lg object-cover"
                      />
                    )}
                    <button 
                      onClick={removeFile}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg hover:bg-rose-600 transition-colors"
                      aria-label="ファイルを削除"
                    >
                      <Trash2 size={16} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )}

              {status === AnalysisStatus.LOADING && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/10 pointer-events-none">
                  <div className="relative">
                    {/* Magnifying Glass Illustration */}
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <div className="absolute inset-0 bg-emerald-100/50 rounded-full animate-pulse"></div>
                      <div className="relative z-10 animate-bounce">
                        <Search size={64} className="text-emerald-600" strokeWidth={1.5} />
                        <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 shadow-lg border border-emerald-100">
                          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      </div>
                      {/* Scanning Line */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.5)] animate-[scan_2s_ease-in-out_infinite]"></div>
                    </div>
                    <div className="mt-4 bg-white/80 backdrop-blur-md px-6 py-2 rounded-full border border-emerald-100 shadow-xl flex items-center gap-3 mx-auto w-fit">
                      <span className="text-sm font-black text-emerald-700">精査中...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-emerald-50/20 px-8 py-5 border-t border-emerald-50 flex flex-col md:flex-row gap-6 items-center justify-between">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,application/pdf,.eps"
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-emerald-200 bg-white text-emerald-700 text-sm font-black cursor-pointer hover:bg-emerald-50 transition-all ${status === AnalysisStatus.LOADING ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Upload size={18} strokeWidth={2.5} />
                  画像・PDF・EPSを追加
                </label>
                <div className="text-[11px] text-slate-400 font-bold hidden sm:block">
                  {inputText.length} 文字 {uploadedFile ? `+ ${uploadedFile.mimeType === 'application/pdf' ? 'PDF' : uploadedFile.mimeType === 'application/postscript' ? 'EPS' : '画像'}あり` : ''}
                </div>
              </div>
              
              <div className="flex gap-4 w-full md:w-auto">
                <button
                  onClick={handleClear}
                  className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-2xl transition-all"
                  disabled={status === AnalysisStatus.LOADING}
                >
                  クリア
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={status === AnalysisStatus.LOADING || (!inputText.trim() && !uploadedFile)}
                  className={`flex-1 md:flex-none px-10 py-3.5 rounded-2xl text-sm font-black text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3
                    ${status === AnalysisStatus.LOADING || (!inputText.trim() && !uploadedFile)
                      ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}
                  `}
                >
                  {status === AnalysisStatus.LOADING ? '解析中...' : '校閲を開始する'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Progress */}
        <div ref={loadingRef}>
          {status === AnalysisStatus.LOADING && (
            <div className="mt-12 p-8 bg-white rounded-[2rem] border border-emerald-100 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden relative">
              {/* Background Illustration */}
              <div className="absolute -right-12 -bottom-12 opacity-[0.03] rotate-12 pointer-events-none">
                <Search size={240} strokeWidth={1} />
              </div>

              <div className="flex items-center justify-between mb-2 relative z-10">
                <h3 className="font-black text-slate-900 flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                    <Search size={20} strokeWidth={3} />
                  </div>
                  校閲さんが精査しています
                </h3>
                <span className="text-emerald-600 font-black text-lg">{Math.round(progress)}%</span>
              </div>

              {/* Duck Family Animation */}
              <div className="relative w-full h-12 mb-1 pointer-events-none z-10">
                {/* Pond at the goal */}
                <div className="absolute right-0 bottom-0 w-24 h-6 bg-cyan-100/40 rounded-[100%] border border-cyan-200/30 flex items-center justify-center">
                  <div className="w-16 h-2 bg-cyan-200/20 rounded-full blur-sm"></div>
                  {progress >= 95 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl animate-[ping_1s_ease-out_infinite] opacity-50">💦</span>
                      <span className="text-lg animate-[bounce_0.5s_ease-in-out_infinite]">✨</span>
                    </div>
                  )}
                </div>

                <div 
                  className={`absolute transition-all duration-700 flex items-end gap-1 ${progress >= 95 ? 'bottom-[-4px] opacity-0 scale-50 translate-y-4' : 'bottom-0'}`}
                  style={{ left: `${Math.max(progress, 12)}%`, transform: 'translateX(-100%)' }}
                >
                  <div className="flex items-end gap-1 mb-1">
                    <span className="animate-bounce inline-block" style={{ animationDuration: '0.6s', animationDelay: '0.3s' }}>
                      <span className="inline-block text-[10px]" style={{ transform: 'scaleX(-1)' }}>🐤</span>
                    </span>
                    <span className="animate-bounce inline-block" style={{ animationDuration: '0.6s', animationDelay: '0.2s' }}>
                      <span className="inline-block text-[10px]" style={{ transform: 'scaleX(-1)' }}>🐤</span>
                    </span>
                    <span className="animate-bounce inline-block" style={{ animationDuration: '0.6s', animationDelay: '0.1s' }}>
                      <span className="inline-block text-[10px]" style={{ transform: 'scaleX(-1)' }}>🐤</span>
                    </span>
                    <span className="animate-bounce inline-block" style={{ animationDuration: '0.6s', animationDelay: '0s' }}>
                      <span className="inline-block text-xl" style={{ transform: 'scaleX(-1)' }}>🦆</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="w-full h-2.5 bg-slate-100 rounded-full mb-8 overflow-hidden relative z-10">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-12 gap-y-4 relative z-10">
                {ANALYSIS_STEPS.map((step, idx) => {
                  const isCompleted = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={idx} className={`flex items-center gap-4 transition-all duration-500 ${isCurrent ? 'translate-x-2' : ''} ${!isCompleted && !isCurrent ? 'opacity-30' : 'opacity-100'}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' : isCurrent ? 'bg-white border-emerald-600 text-emerald-600' : 'bg-white border-slate-200'}`}>
                        {isCompleted ? <Check size={14} strokeWidth={4} /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                      </div>
                      <span className={`text-sm font-bold ${isCurrent ? 'text-emerald-700' : isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-8 p-5 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl flex items-center gap-4">
            <div className="bg-rose-500 text-white p-1.5 rounded-full">
              <AlertCircle size={16} strokeWidth={3} />
            </div>
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <div id="results-section">
          {status === AnalysisStatus.SUCCESS && result && (
            <div className="mt-20">
               <ResultDisplay result={result} originalText={inputText} onReset={handleClear} />
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-emerald-100/60 py-16 bg-white/50">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-sm font-bold text-slate-400 tracking-tight">AI校閲さん</div>
          <p className="text-slate-400 text-xs font-medium">
            &copy; {new Date().getFullYear()} AI Proofreader. Professional proofreading powered by Gemini 3 Flash.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
