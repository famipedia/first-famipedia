/* ==========================================================
   db.ts  ―  Firestoreとの読み書きをまとめた場所
   ----------------------------------------------------------
   「people」コレクションに、記録(Store)を1人1ドキュメントで
   保存します。ownerId(ログイン中のuid)で持ち主を判定します。

   ★ ここがFirestoreとやり取りする唯一の場所です。
     store.ts や people.ts は、この中の関数を呼ぶだけでOKです。
   ========================================================== */

import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc,
  query, where,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { MemoryDoc, PersonDoc, PersonSummary, Store } from './types';

const peopleRef = collection(db, 'people');

/** 空っぽの記録の中身 */
function emptyStoreFields(): Store {
  return {
    info: { name: '', birth: '', place: '', job: '', family: '' },
    answers: [],
    photo: '',
    skipped: [],
    extraQuestions: [],
  };
}

/** 新しい記録を1件作る。作った記録のidを返す */
export async function createPerson(ownerId: string, name = ''): Promise<string> {
  const now = new Date().toISOString();
  const fields = emptyStoreFields();
  fields.info.name = name;

  const ref = await addDoc(peopleRef, {
    ownerId,
    ...fields,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

/** ログイン中の人が持っている記録の一覧（新しい順）
 *
 *  where と orderBy を組み合わせると、Firestore側に「複合インデックス」を
 *  作っておかないと読み込みが失敗します。1人が持つ記録は多くないので、
 *  並べ替えはここ（ブラウザ側）で行い、インデックスを不要にしています。 */
export async function listPeople(ownerId: string): Promise<PersonSummary[]> {
  const q = query(peopleRef, where('ownerId', '==', ownerId));
  const snap = await getDocs(q);

  const people = snap.docs.map((d): PersonSummary => {
    const raw = d.data();

    // 思い出の記録（type: 'memory'）
    if (raw.type === 'memory') {
      const m = raw as Omit<MemoryDoc, 'id'>;
      return {
        id: d.id,
        type: 'memory',
        name: m.title || 'タイトル未入力',
        photo: m.photos?.[0]?.src || '',
        answerCount: 0,
        updatedAt: m.updatedAt ?? '',
        aliases: m.aliases ?? [],
      };
    }

    // 人物の記録（type が無い古い記録もこちら）
    const data = raw as Omit<PersonDoc, 'id'>;
    return {
      id: d.id,
      type: 'person',
      name: data.info?.name || '名前未入力',
      photo: data.photo || '',
      answerCount: data.answers?.length ?? 0,
      updatedAt: data.updatedAt ?? '',
      aliases: [],
    };
  });

  // ISO形式の日時は文字列のまま比べれば新しい順に並ぶ
  return people.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 記録を1件読み込む。無ければ null */
export async function loadPerson(personId: string): Promise<PersonDoc | null> {
  const snap = await getDoc(doc(peopleRef, personId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PersonDoc, 'id'>) };
}

/** 記録の中身（Storeぶん）をまるごと保存する */
export async function savePersonStore(personId: string, store: Store): Promise<void> {
  await setDoc(
    doc(peopleRef, personId),
    { ...store, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

/** 記録を1件まるごと削除する（元に戻せません） */
export async function deletePerson(personId: string): Promise<void> {
  await deleteDoc(doc(peopleRef, personId));
}


/* ----------------------------------------------------------
   思い出の記録（people コレクションに type: 'memory' で保存）
   ---------------------------------------------------------- */

/** 新しい思い出を1件作る。作った記録のidを返す */
export async function createMemory(ownerId: string, title = ''): Promise<string> {
  const now = new Date().toISOString();
  const fields: Omit<MemoryDoc, 'id'> = {
    type: 'memory',
    ownerId,
    title,
    reading: '',
    aliases: [],
    kind: '',
    related: '',
    body: '',
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(peopleRef, fields);
  return ref.id;
}

/** 思い出を1件読み込む。無い、または思い出ではない記録なら null */
export async function loadMemory(memoryId: string): Promise<MemoryDoc | null> {
  const snap = await getDoc(doc(peopleRef, memoryId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.type !== 'memory') return null;
  // あとから項目が増えても古い記録で壊れないよう、無い項目は空で補う
  const m = data as Partial<MemoryDoc>;
  return {
    id: snap.id,
    type: 'memory',
    ownerId: m.ownerId ?? '',
    title: m.title ?? '',
    reading: m.reading ?? '',
    aliases: m.aliases ?? [],
    kind: m.kind ?? '',
    related: m.related ?? '',
    body: m.body ?? '',
    photos: m.photos ?? [],
    createdAt: m.createdAt ?? '',
    updatedAt: m.updatedAt ?? '',
  };
}

/** 思い出の中身を保存する（id と ownerId、作成日時は変えない） */
export async function saveMemory(memory: MemoryDoc): Promise<void> {
  const { id, ownerId: _owner, createdAt: _created, ...fields } = memory;
  await setDoc(
    doc(peopleRef, id),
    { ...fields, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
