/* ==========================================================
   types.ts  ―  チーム共通の「データの形」の取り決め
   ----------------------------------------------------------
   フロント担当とAI/サーバー担当が別々に作業しても
   噛み合うように、やり取りする形をここに集めています。
   ここを変えるときは必ずチームに共有してください。
   ========================================================== */

/** 記事のどのセクションに入れるか */
export type SectionId = 'summary' | 'timeline' | 'episode';

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
  /** 人物の記録か、思い出の記録か */
  type: RecordType;
  name: string;
  photo: string;
  answerCount: number;
  updatedAt: string;
  /** 思い出の別の呼び名（リンクの自動付与に使う）。人物は空 */
  aliases: string[];
}

/* ----------------------------------------------------------
   ここから下が、思い出（場所・出来事など）の記録
   人物と同じ people コレクションに type: 'memory' で保存します。
   （type が無い古い記録は人物として扱います）
   ---------------------------------------------------------- */

export type RecordType = 'person' | 'memory';

/** 思い出ページの写真1枚 */
export interface MemoryPhoto {
  /** 画像（base64のdataURL） */
  src: string;
  /** 写真の下に出す説明（省略可） */
  caption: string;
}

/** 思い出の記録1件ぶん（memory.html） */
export interface MemoryDoc {
  id: string;
  type: 'memory';
  ownerId: string;
  /** ページのタイトル。例：市民会館 */
  title: string;
  /** よみがな。例：しみんかいかん（省略可） */
  reading: string;
  /** 別の呼び名。本文にこれが出てきてもリンクになる */
  aliases: string[];
  /** 種類。例：市民公民館、公園、お店 */
  kind: string;
  /** ゆかり。例：田中家 */
  related: string;
  /** 本文。段落は改行で区切る。[[キーワード]] でリンクも書ける */
  body: string;
  photos: MemoryPhoto[];
  createdAt: string;
  updatedAt: string;
}
