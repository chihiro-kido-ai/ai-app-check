import { ProofreadingResult, GroundingSource, ProofreadingIssue } from "../types";

export const convertToVisibleVerticalNumbers = (text: string): string => {
  if (!text) return "";
  return text.replace(/[0-9０-９]+/g, (match) => {
    const normalized = match.replace(/[０-９]/g, m => 
      String.fromCharCode(m.charCodeAt(0) - 0xFEE0)
    );
    if (normalized.length === 2) {
      return normalized;
    }
    return match;
  });
};

export const transformToVerticalNumbers = (text: string): string => {
  if (!text) return "";
  let processedText = decodeVerticalNumbers(text);
  return processedText.replace(/[0-9]+/g, (match) => {
    if (match.length === 2) {
      const num = parseInt(match, 10);
      return String.fromCharCode(num + 61903);
    }
    return match;
  });
};

export const decodeVerticalNumbers = (text: string): string => {
  if (!text) return "";
  let result = text.replace(/[\u{1D7EC}-\u{1D7F5}]/gu, (char) => {
    const code = char.codePointAt(0) || 0;
    return (code - 0x1D7EC).toString();
  });
  const chars = [...result];
  return chars.map(char => {
    const code = char.charCodeAt(0);
    if (code >= 61903 && code <= 61903 + 99) {
      const num = code - 61903;
      return num.toString().padStart(2, '0');
    }
    return char;
  }).join('');
};

export const analyzeText = async (text: string, fileData?: { data: string, mimeType: string }): Promise<ProofreadingResult> => {
  const response = await fetch('/api/analyzeText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, fileData })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "サーバーエラーが発生しました。");
  }
  
  return response.json();
};

export const searchGuide = async (query: string): Promise<string> => {
  if (!query.trim()) return "";
  const response = await fetch('/api/searchGuide', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "サーバーエラーが発生しました。");
  }
  
  const data = await response.json();
  return data.result;
};