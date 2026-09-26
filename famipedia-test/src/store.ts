/* ==========================================================
   store.ts  ―  データの保管庫
   ----------------------------------------------------------
   今開いている「1人分の記録」をメモリ上に持ち、Firestoreの
   people/{personId} ドキュメントと同期します。

   （もともとはlocalStorageに保存していましたが、複数人分の
    記録をアカウントで共有できるよう、Firestore保存に変えました）
   ========================================================== */

import type { Store, Question, Answer } from './types';
import questionsJson from './questions.json';
import { loadPerson, savePersonStore } from './db';

/** JSONから読み込んだ、もともとの質問リスト */
export const BASE_QUESTIONS = questionsJson.questions as Question[];

/** 今開いている記録のFirestore上のid */
let currentPersonId: string | null = null;

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

export const store: Store = emptyStore();

/** 指定した記録をFirestoreから読み込み、storeに反映する。
 *  main.ts の起動時（ログイン確認のあと）に1回だけ呼びます */
export async function initStore(personId: string): Promise<void> {
  currentPersonId = personId;

  const person = await loadPerson(personId);
  const data = person ?? emptyStore();

  store.info = data.info;
  store.answers = data.answers;
  store.photo = data.photo;
  store.skipped = data.skipped;
  store.extraQuestions = data.extraQuestions;
}

/** 今の状態をFirestoreに書き込む。
 *
 *  通信には少し時間がかかりますが、呼び出し側を await だらけに
 *  しないよう、ここでは「投げて忘れる」形にしています。
 *  失敗しても入力そのものはメモリ上に残るので、画面は壊れません */
export function save(): void {
  if (!currentPersonId) return;
  void savePersonStore(currentPersonId, store).catch((err) => {
    console.warn('保存できませんでした（通信状況をご確認ください）', err);
  });
}

/** 今の記録だけ、まっさらな状態に戻す
 *  （記録そのもの＝ドキュメントは消さず、中身だけ空にします） */
export function clearAll(): void {
  const empty = emptyStore();
  store.info = empty.info;
  store.answers = empty.answers;
  store.photo = empty.photo;
  store.skipped = empty.skipped;
  store.extraQuestions = empty.extraQuestions;
  save();
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
    section: parent?.section ?? 'timeline',
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
