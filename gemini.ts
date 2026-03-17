import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from 'jsonrepair';

// Define types locally for the server to avoid importing from frontend types if they have React dependencies
// Assuming types.ts is pure TS, we can import it.
import { ProofreadingResult, GroundingSource, ProofreadingIssue } from "../src/types.js";

const getAi = (): GoogleGenAI => {
  const apiKey = process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("APIキーが設定されていません。環境変数 GEMINI_API_KEY を設定してください。");
  }
  const cleanKey = apiKey.replace(/^["']|["']$/g, '').trim();
  return new GoogleGenAI({ apiKey: cleanKey });
};

const transformUnits = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/メートル/g, '㍍')
    .replace(/キロ/g, '㌔')
    .replace(/グラム/g, '㌘')
    .replace(/リットル/g, '㍑');
};

const unifyBrackets = (text: string): string => {
  if (!text) return "";
  return text;
};

const verifyUrl = (url: string, searchSources: GroundingSource[]): 'verified' | 'hallucinated' | 'internal' => {
  if (!url) return 'internal';
  
  const isFoundInSearch = searchSources.some(s => {
    try {
      const searchUrl = new URL(s.uri);
      const targetUrl = new URL(url);
      return searchUrl.hostname === targetUrl.hostname && 
             (targetUrl.pathname.startsWith(searchUrl.pathname) || searchUrl.pathname.startsWith(targetUrl.pathname));
    } catch {
      return s.uri === url || s.uri.includes(url) || url.includes(s.uri);
    }
  });

  return isFoundInSearch ? 'verified' : 'hallucinated';
};

export const analyzeTextOnServer = async (text: string, fileData?: { data: string, mimeType: string }): Promise<ProofreadingResult> => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  const parts: any[] = [
    { text: `校閲対象のテキスト（原稿）:\n---\n${text}\n---` }
  ];

  if (fileData) {
    parts.push({
      inlineData: {
        data: fileData.data,
        mimeType: fileData.mimeType
      }
    });
    
    const isPdf = fileData.mimeType === 'application/pdf';
    const isEps = fileData.mimeType === 'application/postscript';
    const fileTypeName = isPdf ? 'PDF' : isEps ? 'EPS' : '画像';

    parts.push({ text: `
【最優先：${fileTypeName}解析指示】
1. アップロードされた${fileTypeName}${isPdf || isEps ? 'ドキュメント' : ''}の内容をすべて読み取り、原稿テキストと照合してください。
2. 見出し、キャプション、図表、看板等に含まれる「固有名詞（人名・地名・団体名）」に1文字でも誤字脱字があれば、それを最優先の重大な指摘として報告してください。
3. 原稿では正しいが、${fileTypeName}側のレイアウトやデザイン側で間違っているケースも厳格に指摘してください。
4. ${fileTypeName}内のグラフ、地図、日付、数値と、テキストの説明に矛盾がないか徹底的に検証してください。` });
  }

  const ai = getAi();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: `あなたは河北新報社の極めて優秀なベテラン校閲記者です。現在の日付は **${dateStr}** です。
アップロードされた「河北新報 編集の手引 第6版」の全ルールを遵守してください。

【校閲の極意と厳守ルール】
1. **正確な指摘**: 誤字脱字、「てにをは」の誤用、文章の違和感、主述の不一致をプロの視点で一文字も見逃さず指摘してください。
2. **固有名詞の厳格かつ慎重な検証（最重要）**: 人名、地名、企業名、団体名、施設名などの「固有名詞」は、一文字でも間違っていれば致命的です。必ずGoogle Searchを用いて実在するか、正しい漢字表記かを徹底的に確認してください。
   - **【重要】誤指摘の防止**: AIによる固有名詞の誤指摘（存在しない名前への修正など）は厳禁です。検索結果から「確実に誤りである」という明確な証拠が得られない場合や、少しでも自信がない場合は、安易に修正案（suggestion）を出さないでください。
   - 明らかな誤りでない限り、原稿の表記を尊重してください。疑わしい場合は「事実確認が必要（要確認）」として指摘（type: "context"）するにとどめ、勝手に別の名前に書き換えないでください。
   - 特に**人名の同音異字（例：信幸と伸幸、渡辺と渡邊など）**は多発するため、役職や所属などの文脈と完全に一致する情報があるか厳格に照合してください。
3. **重複の排除**: まったく同じ内容（同じ箇所、同じ修正案、同じ理由）の指摘が複数回出る場合は、必ず1つにまとめてください。
4. **事実確認**: 数字や日付の正確性についても、公的機関や信頼できる報道機関の情報を元に検証してください。

【画像やPDFが含まれる場合の「鉄則」】
- **見出しは聖域**: ドキュメント内の「見出し」や「大きな文字」に含まれる固有名詞の誤りや誤字脱字は、記事の信頼性を損なう致命的なミス（一等指摘）として扱ってください。
- **視覚的矛盾**: テキストが示す状況と、ビジュアル（写真やPDFの内容）に矛盾がないか、細部まで観察して指摘してください。

【SNS炎上リスクの検知】
- 差別的、攻撃的、特定の個人・団体を不当に貶める表現、または誤解を招きやすくSNS等で炎上（批判の殺到）を招くおそれのある表現が含まれている場合は、リスクとして指摘し、より客観的で穏当な表現を提案してください。

【特定の表記ルール（河北新報スタイル）】
- **かぎかっこの統一（最重要）**: かぎかっこは原則として「 」（一重かぎかっこ）を使用してください。二重かぎかっこ『 』は、**「 」の中に含まれる場合（入れ子構造）に限り使用を認めます**。それ以外の場合（独立して使用されている場合など）は「 」に修正してください。
- **敬称の原則**: 中学生以上は原則として「氏」または「さん」を付けてください。
- **電話番号の表記**: ハイフン（-）は使用せず、市外局番をかっこで囲む「（ ）」表記を基本としてください。例：「022-781-1571」ではなく「022(781)1571」とします（全角・半角は原稿のまま許容します）。「フリーダイヤル」「ナビダイヤル」等は登録商標であることに留意し、番号表記は「(0120)××××××」のように最初にかっこを付けてください。
- **人権・差別への配慮**: 「ノイローゼ」等の差別的・不適切な用語は避け、手引に従い「精神障害」「心身症」等へ適切に言い換えてください。
- **事件・性犯罪の表記**: 「強姦」「いたずら」等の表現は使用せず、最新の法的呼称や、手引が推奨する「性的暴行」「乱暴」等の表現を用いてください。
- **ジェンダー・多様性**: ジェンダーバイアスのある表現や、多様な性への配慮に欠ける記述を修正してください。
- **ルビ（ふりがな）の扱い**:
  - 原稿内に「親文字（ルビ）」の形式でルビが含まれている場合、読み方が正しいものであれば、一般的な熟語（例：「休（きゅう）職（しょく）」など）であっても**すべて意図的なものとして扱い、そのまま維持**してください。これらを削除したり、修正案として提示したりしないでください。
- **「ら」と「など」の使い分け**: 人には「ら」、団体・モノには「など」を使用します。家族は団体とみなし「家族連れなど」とします。
- **「旧」と「元」の区別**: 組織・団体には「旧」、個人には「元」を使用します（例：旧日本軍、元市長）。
- **単位の組文字化**: 以下の単位は、必ず組文字（ kumimoji ）を使用して表記してください。
  - 「メートル」→「㍍」、「キロ」→「㌔」、「グラム」→「㌘」、「リットル」→「㍑」
- **サイレント修正・削除の徹底**:
  - 記事の内容に関係のない「制御文字」「不要な記号（◆、◇、■、□など）」「システム由来のゴミ」などが含まれている場合、それらは指摘事項（issues）には含めず、**\`fullCorrectedText\` から直接（サイレントに）削除**してください。
  - 数値の小数点に「・」（中黒）が使われている場合、半角数字に合わせて**半角ピリオド「.」にサイレント修正**してください。これも指摘事項には含めないでください。
- **年代表記のルール（最重要）**:
  - 文中で年代表記が連続する場合、**同じ世紀内であれば2回目以降は下2桁**で表記してください。
  - **世紀が変わる場合**、または前回の年代表記から世紀が移動した直後は、**4桁表記に戻して**ください。
  - 例：2026年（初回）→ 25年（同世紀なので2桁）→ 1999年（世紀が変わったので4桁）→ 2022年（世紀が変わったので4桁）→ 24年（同世紀なので2桁）。
- **数詞の表記**: 単位語において「千」は使用せず、数字で表記します（例：2000、3000）。また、**半角数字を全角数字に変換する提案は一切不要**です。数字は原則として半角のまま維持してください。
- **固有名詞の修正と取り扱い（厳格なルール）**:
  - 「青葉通」→「青葉通り」、「秋田竿燈」→「秋田竿灯」など、手引指定の表記がある場合はそれを優先してください。
  - 【重要】原稿内に固有名詞（人名、地名、企業名、施設名、イベント名など）が含まれる場合は、**必ずGoogle検索ツールを用いて事実確認（ファクトチェック）を行ってください**。
  - 調査の結果、明らかな誤りであることが確認できた場合のみ修正を提案し、正しい表記を提示してください。
  - 検索して調査しても正誤が判断できない場合（ネット上に情報がないなど）や、一般的でない珍しい名前の場合は、推測での修正提案（ハルシネーション）は行わず、「検索ツールで確認しましたが、正誤の判断ができませんでした。念のため表記が正しいかご自身で確認をお願いします」と、ユーザー側での正誤確認を促す指摘（issue）を出してください。
- **区間・路線の表記**: 「―」（ダッシュ）を用い、「駅」を省略します（例：大宮―盛岡間）。
- **政治記事の用語**: 「勇退」は使用せず、「退任」または「引退」と言い換えてください。
- **関連記事の案内**:
  - 複数の面に関連記事があるのみの場合は「・」（中黒）で繋ぎ、「（１・２面に関連記事）」のように表記してください。「（２、３面に関連記事）」のような読点や「面」を繰り返す表記は修正対象です。
  - ただし、「（２面に関連記事、９面に論戦のポイント）」のように、関連記事以外の要素（「論戦のポイント」など）が併記されている場合は、その形式を維持し、許容してください。
- **文末表現**: 「べき」止め（文末を「べき」で終えること）は不可です。適切な結びに修正してください。
- 作品名（書名・楽曲等）も「 」で表記。
- 「SNS」は「交流サイト（SNS）」と表記。
- 日付：当月の場合は「10月10日」ではなく「10日」と略す。
- 期間記号：波ダッシュ「～」を使用。

【AI校閲レポート概要（overallEvaluation）について】
- 修正の有無にかかわらず、必ず出力してください。
- 基本的なトーン：書き手に過剰に媚びたり褒めちぎる必要はありませんが、決して上から目線や説教じみた態度にならないよう注意してください。執筆の苦労をねぎらい、優しく寄り添うような「伴走者」としてのトーンでフィードバックを返してください。
- 修正がない場合：「手引に沿った丁寧な原稿ですね。お疲れ様です」といった自然な労いの言葉をかけてください。
- 通常の修正（表現の微調整など）の場合：「こちらの表現を整えると、さらに読みやすくなりそうです」といった穏やかで前向きな提案の形をとってください。
- 【重要】致命的な誤り（固有名詞の間違い、明らかな誤字脱字、事実誤認など）が含まれる場合：この場合に限り、記事の信頼性を損なう重大なリスクがあるため、「固有名詞に誤りがあるようです。必ず確認・修正をお願いします」など、強い文言で明確かつ厳格に修正を促してください。`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullCorrectedText: { type: Type.STRING },
          issues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["typo", "grammar", "style", "context", "risk"] },
                original: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                reason: { type: Type.STRING },
                sourceUrl: { type: Type.STRING },
                sourceTitle: { type: Type.STRING }
              },
              required: ["type", "original", "suggestion", "reason"]
            }
          },
          overallEvaluation: { type: Type.STRING },
          missingElements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                element: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          }
        },
        required: ["fullCorrectedText", "issues", "overallEvaluation", "missingElements"]
      },
      maxOutputTokens: 8192
    },
  });

  const textOutput = response.text;
  if (!textOutput) throw new Error("AIからの応答が空です。");
  
  let parsed;
  try {
    parsed = JSON.parse(textOutput);
  } catch (initialError) {
    try {
      let cleanedText = textOutput.trim();
      const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (jsonMatch) {
        cleanedText = jsonMatch[1].trim();
      } else {
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace + 1).trim();
        } else if (firstBrace !== -1) {
          cleanedText = cleanedText.substring(firstBrace).trim();
        }
      }
      cleanedText = cleanedText.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');
      const repairedJson = jsonrepair(cleanedText);
      parsed = JSON.parse(repairedJson);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      console.error("Raw Output:", textOutput);
      throw new Error("AIからの応答形式が不正でした（JSONパースエラー）。長すぎる文章や複雑すぎる指示が原因の可能性があります。");
    }
  }

  // AIがoverallEvaluationを空で返してきた場合のフォールバック処理を確実に行う
  if (!parsed.overallEvaluation || typeof parsed.overallEvaluation !== 'string' || parsed.overallEvaluation.trim() === '') {
    const hasCritical = parsed.issues?.some((i: any) => ['typo', 'context', 'risk'].includes(i.type));
    if (!parsed.issues || parsed.issues.length === 0) {
      parsed.overallEvaluation = "手引に沿った丁寧な原稿ですね。お疲れ様です。指摘事項はありませんでした。";
    } else if (hasCritical) {
      parsed.overallEvaluation = "固有名詞の誤りや誤字脱字など、確認が必要な箇所が見つかりました。記事の信頼性に関わるため、必ず確認・修正をお願いします。";
    } else {
      parsed.overallEvaluation = "いくつか表現の調整を提案しています。こちらの表現を整えると、さらに読みやすくなりそうです。お疲れ様です。";
    }
  }

  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const groundingChunks = groundingMetadata?.groundingChunks || [];
  
  const actualSearchSources: GroundingSource[] = groundingChunks
    .filter((chunk: any) => chunk.web && chunk.web.uri)
    .map((chunk: any) => ({
      title: chunk.web.title || "検索結果",
      uri: chunk.web.uri
    }));

  parsed.fullCorrectedText = unifyBrackets(transformUnits(parsed.fullCorrectedText));

  const issueSet = new Set<string>();
  const validatedIssues: ProofreadingIssue[] = [];

  for (const issue of (parsed.issues || [])) {
    if (!issue || !issue.original || !issue.suggestion) continue;

    issue.suggestion = unifyBrackets(transformUnits(issue.suggestion));
    
    const issueKey = `${issue.original.trim()}|${issue.suggestion.trim()}|${issue.type}`;
    if (issueSet.has(issueKey)) continue;
    
    issueSet.add(issueKey);

    const status = verifyUrl(issue.sourceUrl || '', actualSearchSources);
    validatedIssues.push({
      ...issue,
      verificationStatus: status,
      reason: status === 'hallucinated' 
        ? `【注意：要確認】${issue.reason || ''} （※事実関係に疑義があります。必ず一次ソースを確認してください）` 
        : (issue.reason || '')
    });
  }

  return { 
    ...parsed, 
    issues: validatedIssues,
    sources: actualSearchSources
  } as ProofreadingResult;
};

export const searchGuideOnServer = async (query: string): Promise<string> => {
  if (!query.trim()) return "";
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `検索クエリ：${query}`,
    config: {
      systemInstruction: `あなたは「河北新報 編集の手引 第6版」の全文を把握している検索ボットです。要約して回答してください。`,
    }
  });
  return response.text || "該当する記載が見つかりませんでした。";
};
