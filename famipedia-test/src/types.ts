/* ==========================================================
   types.ts  ―  チーム共通の「データの形」の取り決め
   ----------------------------------------------------------
   フロント担当とAI/サーバー担当が別々に作業しても
   噛み合うように、やり取りする形をここに集めています。
   ここを変えるときは必ずチームに共有してください。
   ========================================================== */

/** 記事のどのセクションに入れるか */
export type SectionId = 'summary' | 'timeline';

/** 基礎情報ボックス（記事の右上に出る表） */
export interface PersonInfo {
  name: string;
  birth: string;
  place: string;
  job: string;
  family: string;
  height?: string;
  blood?: string;
}

/** 質問1件。questions.json の中身がこの形になります */
export interface Question {
  id: string;
  text: string;
  hint?: string;
  section: SectionId;
  /** 基礎情報ボックスのどの欄に入れるか */
  field?: keyof PersonInfo;
  /** true なら基礎情報にだけ使い、本文には載せない */
  infoOnly?: boolean;
  /** AIが提案した追加質問かどうか（実行中に増えるぶん） */
  fromAi?: boolean;
}

/** 大学生が入力した、生の回答 */
export interface Answer {
  questionId: string;
  question: string;
  /** 打ち込んだままの文章 */
  raw: string;
  savedAt: string;
  /** AIが整えた結果。まだ処理していなければ null */
  result: GenerateResult | null;
}

/* ----------------------------------------------------------
   ここから下が、AI（サーバー）とのやり取り部分
   ---------------------------------------------------------- */

/** サーバーに送る内容 */
export interface GenerateRequest {
  question: string;
  answer: string;
  /** 誰の記録かという前提情報。文章の書き方が変わるので一緒に送る */
  person: PersonInfo;
}

/** サーバーから返ってくる内容 */
export interface GenerateResult {
  /** どのセクションに置くべきか、AIが判断した結果 */
  section: SectionId;
  /** 年表用。「1972年」など。読み取れなければ null */
  year: string | null;
  /** AIが文章の内容から推測した年代（幼少・少年期、青年期、壮年期、高年期）。判断できなければ null */
  period?: string | null;
  /** 記事本文（整えられた文章） */
  text: string;
  /** さらに掘り下げるための追加質問。無ければ null */
  followUp: string | null;
}

/** 通信に失敗したときの形 */
export interface GenerateError {
  ok: false;
  message: string;
}

/** ブラウザに保存しておくデータ一式 */
export interface Store {
  info: PersonInfo;
  answers: Answer[];
  /** 画像（base64） */
  photo: string;
  /** 飛ばした質問のid */
  skipped: string[];
  /** AIが追加した質問 */
  extraQuestions: Question[];
}

/* ----------------------------------------------------------
   ここから下が、Firestore（people コレクション）とのやり取り部分
   ---------------------------------------------------------- */

/** Firestoreに保存する記録1件ぶん。Storeの中身に加えて、
 *  誰のもの（ownerId）かと、いつのものかを持ちます */
export interface PersonDoc extends Store {
  id: string;
  /** ログイン中のアカウントのuid。これで持ち主を判定します */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

/** 記録一覧（people.html）にはこれだけあれば十分、という軽い形 */
export interface PersonSummary {
  id: string;
  name: string;
  photo: string;
  answerCount: number;
  updatedAt: string;
}
