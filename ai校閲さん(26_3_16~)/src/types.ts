
export interface ProofreadingIssue {
  type: 'typo' | 'grammar' | 'style' | 'context' | 'risk';
  original: string;
  suggestion: string;
  reason: string;
  sourceUrl?: string;
  sourceTitle?: string;
  urlRelevance?: 'high' | 'medium' | 'low' | 'unverified';
  verificationStatus?: 'verified' | 'hallucinated' | 'internal'; // 検証ステータスを追加
}

export interface MissingElement {
  element: string;
  description: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ProofreadingResult {
  fullCorrectedText: string;
  issues: ProofreadingIssue[];
  missingElements: MissingElement[];
  overallEvaluation: string;
  sources: GroundingSource[];
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
