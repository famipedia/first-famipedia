/* ==========================================================
   db.ts  ―  Firestoreとの読み書きをまとめた場所
   ----------------------------------------------------------
   「people」コレクションに、記録(Store)を1人1ドキュメントで
   保存します。ownerId(ログイン中のuid)で持ち主を判定します。

   ★ ここがFirestoreとやり取りする唯一の場所です。
     store.ts や people.ts は、この中の関数を呼ぶだけでOKです。
   ========================================================== */

import {
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { PersonDoc, PersonSummary, Store } from './types';

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
 *  ※ もし実行時にコンソールへ「インデックスが必要です」という
 *     エラーとリンクが出た場合は、そのリンクをクリックすれば
 *     Firebase側が自動でインデックスを作ってくれます。 */
export async function listPeople(ownerId: string): Promise<PersonSummary[]> {
  const q = query(
    peopleRef,
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as Omit<PersonDoc, 'id'>;
    return {
      id: d.id,
      name: data.info?.name || '名前未入力',
      photo: data.photo || '',
      answerCount: data.answers?.length ?? 0,
      updatedAt: data.updatedAt,
    };
  });
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
