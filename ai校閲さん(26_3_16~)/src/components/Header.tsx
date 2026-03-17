
import React, { useState, useEffect, useRef } from 'react';
import { searchGuide } from '../services/geminiService';

const QUICK_TAGS = ['数字の書き方', '送り仮名', '差別用語', '固有名詞', '外来語表記'];

// 画面の一番上にある「ヘッダー（看板みたいなところ）」を作る部品だよ。
// ここで「編集の手引」のルールを検索できるんだ。
const Header: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) return;
    setSearchQuery(query);
    setIsSearching(true);
    setShowResults(true);
    setShowSuggestions(false);
    try {
      const result = await searchGuide(query);
      setSearchResult(result);
    } catch (error) {
      setSearchResult("エラーが発生しました。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  };

  const handleTagClick = (tag: string) => {
    performSearch(tag);
  };

  // 外側クリックで結果を閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="glass-header border-b border-emerald-100/60 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Logo */}
        <div 
          className="flex items-center gap-3 group cursor-pointer shrink-0" 
          onClick={() => window.location.reload()}
          role="button"
          aria-label="トップページに戻る"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && window.location.reload()}
        >
          <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-lg shadow-emerald-600/20 group-hover:scale-105 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tighter">
            AI<span className="text-emerald-600">校閲さん</span>
          </h1>
        </div>

        {/* Search Bar Container */}
        <div className="flex-1 max-w-xl relative" ref={searchRef} role="search">
          <div className="relative group">
            <form onSubmit={handleSearchSubmit}>
              <input
                type="text"
                value={searchQuery}
                onFocus={() => { setShowSuggestions(true); setShowResults(false); }}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="「編集の手引」のルールを確認..."
                aria-label="編集の手引のルールを検索"
                aria-haspopup="listbox"
                aria-expanded={showSuggestions || showResults}
                className="w-full bg-slate-100/80 border border-slate-200 rounded-2xl py-2.5 pl-11 pr-4 text-sm font-bold focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all placeholder:text-slate-400"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
            </form>

            {/* Quick Suggestions */}
            {showSuggestions && !isSearching && (
              <div 
                className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-4 animate-in fade-in slide-in-from-top-1 duration-200 z-[60]"
                role="listbox"
                aria-label="よく検索される項目"
              >
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">よく検索される項目</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleTagClick(tag)}
                      role="option"
                      aria-selected="false"
                      className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-[11px] font-bold hover:bg-emerald-50 hover:text-emerald-700 transition-colors border border-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search Result Overlay */}
          {showResults && (searchResult || isSearching) && (
            <div 
              className="absolute top-full mt-3 w-full bg-white rounded-[2rem] shadow-2xl border border-emerald-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-[70]"
              aria-live="polite"
              role="region"
              aria-labelledby="search-result-title"
            >
              <div className="bg-emerald-600 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  <span id="search-result-title" className="text-xs font-black uppercase tracking-widest">編集の手引 スニペット</span>
                </div>
                <button 
                  onClick={() => setShowResults(false)} 
                  className="text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
                  aria-label="検索結果を閉じる"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="p-6">
                {isSearching ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-4">
                    <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                    <span className="text-sm font-bold text-slate-500 animate-pulse">ガイドラインを精査中...</span>
                  </div>
                ) : (
                  <div className="prose prose-sm max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    <div className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap font-medium bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                      {searchResult}
                    </div>
                  </div>
                )}
                
                {!isSearching && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400 font-bold italic">※ AI要約のため、最終判断は手引現物で行ってください。</p>
                    <button 
                      onClick={() => {
                        if (searchResult) navigator.clipboard.writeText(searchResult);
                      }}
                      className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 underline focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                    >
                      内容をコピー
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Spacer */}
        <div className="hidden md:block w-32"></div>
      </div>
    </header>
  );
};

export default Header;