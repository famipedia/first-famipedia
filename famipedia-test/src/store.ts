/* ==========================================================
   store.ts  ―  データの保管庫
   ----------------------------------------------------------
   入力された内容を覚えておき、リロードしても消えないように
   端末（ブラウザ）に保存します。
   ========================================================== */

import type { Store, Question, Answer } from './types';
import questionsJson from './questions.json';

const STORAGE_KEY = 'famipedia-v1';

/** JSONから読み込んだ、もともとの質問リスト */
export const BASE_QUESTIONS = questionsJson.questions as Question[];

/** 空っぽの状態 */
function emptyStore(): Store {
  return {
    info: { name: '', birth: '', place: '', job: '', family: '' },
    answers: [],
    photo: '',
    skipped: [],
    extraQuestions: [],
  };
}

/** 保存されているデータを読み出す */
function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    // 古い保存データに新しい項目が無くても落ちないよう、空の形に重ねる
    return { ...emptyStore(), ...JSON.parse(raw) as Partial<Store> };
  } catch {
    return emptyStore();
  }
}

export const store: Store = load();

/** 今の状態を端末に書き込む */
export function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 容量オーバーなどで保存できなくても、アプリは止めない
    console.warn('保存できませんでした（容量不足の可能性）');
  }
}

/** すべて消して、まっさらな状態に戻す
 *
 *  端末の保存を消すだけでなく、いま動いている store の中身も
 *  空に入れ替えます。こうしておけば、ページを再読み込みしなくても
 *  その場で最初の状態に戻ります。
 *  （埋め込み表示だと再読み込みが効かない場合があるため） */
export function clearAll(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても、下のリセットは実行する
  }

  const empty = emptyStore();
  store.info = empty.info;
  store.answers = empty.answers;
  store.photo = empty.photo;
  store.skipped = empty.skipped;
  store.extraQuestions = empty.extraQuestions;
}

/** もとの質問 + AIが増やした質問 */
export function allQuestions(): Question[] {
  return [...BASE_QUESTIONS, ...store.extraQuestions];
}

/** idから質問を1件引く */
export function findQuestion(id: string): Question | undefined {
  return allQuestions().find((q) => q.id === id);
}

/** 次に出すべき質問を決める（未回答・未スキップのうち先頭） */
export function nextQuestion(): Question | null {
  const done = new Set(store.answers.map((a) => a.questionId));
  const skipped = new Set(store.skipped);

  // AIの追加質問を優先する。会話の流れが途切れないように
  const extra = store.extraQuestions.find(
    (q) => !done.has(q.id) && !skipped.has(q.id));
  if (extra) return extra;

  return BASE_QUESTIONS.find(
    (q) => !done.has(q.id) && !skipped.has(q.id)) ?? null;
}

/** 回答を1件足す */
export function addAnswer(a: Answer): void {
  store.answers.push(a);
  save();
}

/** AIが提案した追加質問を、質問リストに差し込む */
export function addFollowUp(text: string, parentId: string): void {
  const parent = findQuestion(parentId);
  const id = `${parentId}-fu-${store.extraQuestions.length + 1}`;

  store.extraQuestions.push({
    id,
    text,
    section: parent?.section ?? 'episode',
    fromAi: true,
  });
  save();
}

/** 進み具合（0〜1） */
export function progress(): number {
  const total = BASE_QUESTIONS.length;
  const done = store.answers.filter(
    (a) => BASE_QUESTIONS.some((q) => q.id === a.questionId)).length;
  return total === 0 ? 0 : done / total;
}
