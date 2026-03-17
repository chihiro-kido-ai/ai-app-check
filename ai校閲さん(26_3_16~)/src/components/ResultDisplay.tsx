import { transformToVerticalNumbers } from '../services/geminiService';
import React, { useState, useMemo, useEffect } from 'react';
import { ProofreadingResult, ProofreadingIssue } from '../types';
import * as Diff from 'diff';

// 校閲（チェック）が終わったあとの「結果」を画面に表示するための部品だよ！
interface ResultDisplayProps {
  result: ProofreadingResult;
  originalText: string;
  onReset: () => void;
}

const VerificationBadge: React.FC<{ status: ProofreadingIssue['verificationStatus'] }> = ({ status }) => {
  if (status === 'verified') {
    return (
      <span 
        className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        公式ソース検証済
      </span>
    );
  }
  if (status === 'hallucinated') {
    return (
      <span 
        className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        事実関係を確認してください
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[9px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
      手引・社内規定
    </span>
  );
};

const IssueBadge: React.FC<{ type: ProofreadingIssue['type'] }> = ({ type }) => {
  const styles = {
    typo: 'bg-rose-50 text-rose-600 border-rose-100',
    grammar: 'bg-amber-50 text-amber-600 border-amber-100',
    style: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    context: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    risk: 'bg-purple-50 text-purple-600 border-purple-100',
  };
  const labels = { typo: '表記・誤字', grammar: '文法・語法', style: '報道基準', context: '事実関係', risk: '炎上リスク' };
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border shadow-sm ${styles[type]} tracking-tight`}>
      {labels[type]}
    </span>
  );
};

const FormattedReason: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(手引P\d+|【注意：要確認】)/i);
  return (
    <div className="text-[13px] text-slate-600 leading-relaxed font-medium">
      {parts.map((part, i) => {
        if (/手引P\d+/i.test(part)) {
          return <span key={i} className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded mx-0.5 font-bold border border-emerald-200">{part}</span>;
        }
        if (part === '【注意：要確認】') {
          return <span key={i} className="text-rose-600 font-black">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({ result, originalText, onReset }) => {
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set(result.issues.map((_, i) => i)));
  const [manualDraft, setManualDraft] = useState<string>('');
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'visual' | 'diff'>('visual');

  const autoFinalDraft = useMemo(() => {
    let draft = originalText;
    const sortedIssues = [...result.issues]
      .map((issue, index) => ({ ...issue, index }))
      .filter(item => appliedIndices.has(item.index))
      .sort((a, b) => b.original.length - a.original.length);

    sortedIssues.forEach(issue => {
      draft = draft.split(issue.original).join(issue.suggestion);
    });
    return draft;
  }, [originalText, result.issues, appliedIndices]);

  // ハイライト表示用のセグメント分割
  const highlightedSegments = useMemo(() => {
    let segments: { text: string; issueIdx?: number; type?: ProofreadingIssue['type'] }[] = [{ text: originalText }];

    const sortedIssues = [...result.issues]
      .map((issue, index) => ({ ...issue, index }))
      .filter(item => appliedIndices.has(item.index))
      .sort((a, b) => b.original.length - a.original.length);

    sortedIssues.forEach(issue => {
      const newSegments: typeof segments = [];
      segments.forEach(segment => {
        if (segment.issueIdx !== undefined) {
          newSegments.push(segment);
          return;
        }
        
        const parts = segment.text.split(issue.original);
        parts.forEach((part, i) => {
          if (part) newSegments.push({ text: part });
          if (i < parts.length - 1) {
            newSegments.push({ text: issue.suggestion, issueIdx: issue.index, type: issue.type });
          }
        });
      });
      segments = newSegments;
    });

    return segments;
  }, [originalText, result.issues, appliedIndices]);

  const diffSegments = useMemo(() => {
    return Diff.diffChars(originalText, autoFinalDraft);
  }, [originalText, autoFinalDraft]);

  useEffect(() => {
    if (!isManuallyEdited) setManualDraft(autoFinalDraft);
  }, [autoFinalDraft, isManuallyEdited]);

  const toggleIssue = (index: number) => {
    const newSet = new Set(appliedIndices);
    newSet.has(index) ? newSet.delete(index) : newSet.add(index);
    setAppliedIndices(newSet);
    setIsManuallyEdited(false);
  };

  const executeCopy = () => {
    const transformedText = transformToVerticalNumbers(manualDraft);
    navigator.clipboard.writeText(transformedText);
    setIsConfirming(false);
    alert('クリップボードにコピーしました！');
  };

  const scrollToIssue = (idx: number) => {
    const el = document.getElementById(`issue-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 一瞬光らせるなどの演出
      el.classList.add('ring-4', 'ring-emerald-400');
      setTimeout(() => el.classList.remove('ring-4', 'ring-emerald-400'), 1000);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 pb-20">
      
      {/* 警告モーダル */}
      {isConfirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full p-10 space-y-8 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            <div className="text-center space-y-6">
              <h4 className="text-xl font-black text-slate-900">最終確認をお願いします</h4>
              <p className="text-slate-800 leading-relaxed font-bold">
                指摘事項に「事実関係を確認してください」の項目が含まれている可能性があります。必ず一次ソースを直接確認してください。
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={executeCopy} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black transition-all">確認しました</button>
              <button onClick={() => setIsConfirming(false)} className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all">戻って再検討</button>
            </div>
          </div>
        </div>
      )}

      {/* 1. 総評 */}
      <section className="bg-white rounded-[2rem] shadow-xl border border-emerald-100 overflow-hidden">
        <div className="bg-emerald-600 px-10 py-5 border-b border-emerald-700 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">AI校閲レポート概要</h3>
        </div>
        <div className="p-8 flex items-start gap-4">
             <div className="text-3xl">📝</div>
             <p className="text-slate-800 text-lg font-bold leading-relaxed whitespace-pre-wrap">
               {result.overallEvaluation || (result.issues.length === 0 
                 ? "手引に沿った丁寧な原稿ですね。お疲れ様です。指摘事項はありませんでした。" 
                 : "いくつか確認が必要な箇所が見つかりました。詳細をご確認ください。お疲れ様です。")}
             </p>
        </div>
      </section>

      {/* 2. メイングリッド */}
      <div className="grid lg:grid-cols-2 gap-10 items-start">
        <div className="space-y-6">
          <div className="flex items-center justify-between ml-2">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-3">
              指摘事項
              <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-full">{result.issues.length}</span>
            </h3>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">クリックで適用/解除</div>
          </div>
          
          <div className="space-y-4">
            {result.issues.length > 0 ? (
              result.issues.map((issue, idx) => {
                const isApplied = appliedIndices.has(idx);
                const isWarning = issue.verificationStatus === 'hallucinated';
                const isHovered = hoveredIdx === idx;
                const searchQuery = issue.sourceTitle || issue.suggestion || issue.original;
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
                const kdSearchUrl = `http://vctd00v.press.local/tdb/`;
                
                return (
                  <div 
                    key={idx}
                    id={`issue-${idx}`}
                    onClick={() => toggleIssue(idx)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`relative cursor-pointer group w-full text-left bg-white rounded-2xl p-6 border transition-all duration-300
                      ${isApplied ? (isWarning ? 'border-rose-300 shadow-rose-100 shadow-lg' : 'border-emerald-200 shadow-lg') : 'border-slate-100 opacity-60 grayscale scale-95'}
                      ${isHovered ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}
                    `}
                  >
                    <div className="flex gap-4">
                      <div className="shrink-0 mt-1">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isApplied ? (isWarning ? 'bg-rose-500 border-rose-500 text-white' : 'bg-emerald-600 border-emerald-600 text-white') : 'bg-white border-slate-300'}`}>
                          {isApplied && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <IssueBadge type={issue.type} />
                          <VerificationBadge status={issue.verificationStatus} />
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
                          <span className="text-rose-500 font-bold line-through text-sm">{issue.original}</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-emerald-700 font-black text-sm bg-emerald-50 px-2 py-0.5 rounded">{issue.suggestion}</span>
                        </div>
                        
                        <FormattedReason text={issue.reason} />
                        
                        <div 
                          className={`mt-4 rounded-xl p-4 border space-y-3 transition-colors ${isWarning ? 'bg-rose-50/50 border-rose-100' : 'bg-emerald-50/30 border-emerald-100'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            <span className="text-[10px] font-black uppercase tracking-wider">事実関係を確認:</span>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <a 
                              href={googleSearchUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className={`group/link flex-1 inline-flex items-center justify-between gap-2 p-2.5 rounded-lg border transition-all ${isWarning ? 'bg-rose-50 border-rose-200 hover:bg-rose-100 hover:border-rose-400' : 'bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-md'}`}
                            >
                              <span className={`text-[11px] font-black line-clamp-1 ${isWarning ? 'text-rose-700' : 'text-emerald-800'}`}>
                                Googleで検索: {issue.sourceTitle || issue.suggestion || issue.original}
                              </span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`shrink-0 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 ${isWarning ? 'text-rose-500' : 'text-emerald-600'}`} aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>

                            <a 
                              href={kdSearchUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="group/kd flex-1 inline-flex items-center justify-between gap-2 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-all"
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-600 shrink-0"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                                <span className="text-[11px] font-black text-indigo-800 truncate">KDで検索 (社内専用)</span>
                              </div>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-500 shrink-0 transition-transform group-hover/kd:-translate-y-0.5 group-hover/kd:translate-x-0.5" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-10 text-center bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-sm">
                <div className="text-4xl mb-4">✨</div>
                <h4 className="text-lg font-black text-emerald-800 mb-2">指摘事項はありません</h4>
                <p className="text-emerald-600 font-medium text-sm">この原稿は手引のルールに沿って美しく書かれています！</p>
              </div>
            )}
          </div>
        </div>

        {/* プレビュー */}
        <div className="lg:sticky lg:top-24 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-black text-slate-900">最終原稿（プレビュー）</h3>
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('visual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'visual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                ビジュアル
              </button>
              <button 
                onClick={() => setViewMode('diff')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'diff' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                比較
              </button>
              <button 
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'edit' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                編集
              </button>
            </div>
          </div>

          <div className="relative">
            {viewMode === 'visual' ? (
              <div className="w-full min-h-[500px] bg-white rounded-[1.5rem] p-8 border border-slate-200 shadow-2xl text-slate-900 text-lg leading-relaxed font-medium whitespace-pre-wrap">
                {highlightedSegments.map((segment, i) => {
                  if (segment.issueIdx !== undefined) {
                    const isHovered = hoveredIdx === segment.issueIdx;
                    const typeStyles = {
                      typo: 'bg-rose-100 text-rose-900 border-rose-200',
                      grammar: 'bg-amber-100 text-amber-900 border-amber-200',
                      style: 'bg-emerald-100 text-emerald-900 border-emerald-200',
                      context: 'bg-indigo-100 text-indigo-900 border-indigo-200',
                      risk: 'bg-purple-100 text-purple-900 border-purple-200',
                    };
                    return (
                      <span 
                        key={i}
                        onMouseEnter={() => setHoveredIdx(segment.issueIdx!)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => scrollToIssue(segment.issueIdx!)}
                        className={`
                          cursor-pointer px-0.5 rounded border-b-2 transition-all duration-200
                          ${typeStyles[segment.type || 'style']}
                          ${isHovered ? 'ring-2 ring-emerald-400 ring-offset-1 scale-110 inline-block' : 'opacity-100'}
                        `}
                      >
                        {segment.text}
                      </span>
                    );
                  }
                  return <span key={i}>{segment.text}</span>;
                })}
              </div>
            ) : viewMode === 'diff' ? (
              <div className="w-full min-h-[500px] bg-white rounded-[1.5rem] p-8 border border-slate-200 shadow-2xl text-slate-900 text-lg leading-relaxed font-medium whitespace-pre-wrap">
                {diffSegments.map((part, i) => {
                  const color = part.added ? 'bg-emerald-100 text-emerald-900' : part.removed ? 'bg-rose-100 text-rose-900 line-through' : '';
                  return (
                    <span key={i} className={color}>
                      {part.value}
                    </span>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={manualDraft}
                onChange={e => { setManualDraft(e.target.value); setIsManuallyEdited(true); }}
                className="w-full min-h-[500px] bg-white rounded-[1.5rem] p-8 border border-slate-200 shadow-2xl text-slate-900 text-lg leading-relaxed focus:outline-none resize-none font-medium"
              />
            )}
            
            <div className="absolute bottom-6 right-6">
              <button 
                onClick={() => setIsConfirming(true)} 
                className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                コピー・保存
              </button>
            </div>
          </div>
          
          {viewMode === 'visual' && (
            <p className="text-center text-xs font-bold text-slate-400 animate-pulse">
              ハイライト箇所をクリックすると、左側の指摘事項へスクロールします
            </p>
          )}

          <div className="pt-8 flex justify-center">
            <button
              onClick={onReset}
              className="group flex items-center gap-3 px-8 py-4 bg-white border-2 border-emerald-600 text-emerald-700 rounded-2xl font-black hover:bg-emerald-50 transition-all shadow-lg hover:shadow-emerald-100 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="group-hover:rotate-180 transition-transform duration-500"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
              次の原稿を校閲する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultDisplay;