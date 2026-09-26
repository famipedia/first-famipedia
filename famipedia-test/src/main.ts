/* ==========================================================
   main.ts  ―  画面の司令塔
   ----------------------------------------------------------
   流れ：
     質問を出す → おばあちゃんに聞く → 入力して「記録する」
     → AIが整える（api.ts）→ ページに反映（render.ts）
   ========================================================== */

import type { Answer, GenerateRequest } from './types';
import {
  store, save, clearAll, initStore,
  nextQuestion, findQuestion, addAnswer, addFollowUp, progress,
  BASE_QUESTIONS,
} from './store';
import { generateArticle } from './api';
import { render, SECTION_LABEL } from './render';
import { captureArticle, saveImage, imageFileName } from './longshot';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

// --- 画面の部品 ---
const elQuestion = $<HTMLParagraphElement>('#ask-question');
const elHint     = $<HTMLParagraphElement>('#ask-hint');
const elBadge    = $<HTMLParagraphElement>('#ask-badge');
const elStep     = $<HTMLSpanElement>('#ask-step');
const elInput    = $<HTMLTextAreaElement>('#ask-input');
const elSave     = $<HTMLButtonElement>('#btn-save');
const elSkip     = $<HTMLButtonElement>('#btn-skip');
const elSpinner  = $<HTMLSpanElement>('.btn-spinner');
const elBtnLabel = $<HTMLSpanElement>('.btn-label');
const elProgress = $<HTMLDivElement>('#progress-fill');
const elToast    = $<HTMLDivElement>('#toast');

/** 今出している質問のid */
let currentId: string | null = null;

/** 送信中は二重に押させない */
let busy = false;


/* ----------------------------------------------------------
   質問を出す
   ---------------------------------------------------------- */

function showQuestion(): void {
  const q = nextQuestion();

  // 進み具合のバー
  elProgress.style.width = `${Math.round(progress() * 100)}%`;

  if (!q) {
    currentId = null;
    elStep.textContent = '完了';
    elQuestion.textContent = 'ひと通り記録できました。おつかれさまでした。';
    elHint.textContent = '「書き出す」からテキストとして保存できます。';
    elBadge.hidden = true;
    elInput.hidden = true;
    elSave.hidden = true;
    elSkip.hidden = true;
    return;
  }

  currentId = q.id;

  const no = BASE_QUESTIONS.findIndex((x) => x.id === q.id) + 1;
  elStep.textContent = q.fromAi
    ? '追加の質問'
    : `質問 ${no} / ${BASE_QUESTIONS.length}`;

  elQuestion.textContent = q.text;
  elHint.textContent = q.hint ?? '';
  elBadge.hidden = q.fromAi !== true;

  elInput.value = '';
  elInput.hidden = false;
  elSave.hidden = false;
  elSkip.hidden = false;
}


/* ----------------------------------------------------------
   記録する（ここでAIを呼ぶ）
   ---------------------------------------------------------- */

async function handleSave(): Promise<void> {
  if (busy || !currentId) return;

  const raw = elInput.value.trim();
  if (raw === '') {
    elInput.focus();
    toast('入力してから押してください');
    return;
  }

  const q = findQuestion(currentId);
  if (!q) return;

  setBusy(true);

  // 基礎情報の欄なら、先に埋めておく（AIに渡す前提情報になる）
  if (q.field) {
    store.info[q.field] = raw;
    save();
  }

  const answer: Answer = {
    questionId: q.id,
    question: q.text,
    raw,
    savedAt: new Date().toISOString(),
    result: null,
  };

  const req: GenerateRequest = {
    question: q.text,
    answer: raw,
    person: { ...store.info },
  };

  try {
    // 基礎情報だけの質問はAIに通す必要がないので、そのまま保存
    if (!q.infoOnly) {
      answer.result = await generateArticle(q.id, req);
    }
  } catch (err) {
    // 通信に失敗しても、入力そのものは絶対に失わない
    console.error(err);
    toast('AIの処理に失敗しました。入力はそのまま保存しています');
  }

  addAnswer(answer);

  // AIが追加質問を返してきたら、質問リストに差し込む
  const followUp = answer.result?.followUp;
  if (followUp) addFollowUp(followUp, q.id);

  render(q.id);
  showQuestion();
  setBusy(false);

  if (!q.infoOnly) toast('ページに反映しました');
}


/** 送信中の見た目を切り替える */
function setBusy(on: boolean): void {
  busy = on;
  elSave.disabled = on;
  elSpinner.hidden = !on;
  elBtnLabel.textContent = on ? 'AIが整えています…' : '記録する';
}


/* ----------------------------------------------------------
   下部タブ（スマホ）で画面を切り替える
   ---------------------------------------------------------- */

function switchPane(name: string): void {
  document.querySelectorAll<HTMLElement>('.pane').forEach((p) => {
    p.classList.toggle('is-active', p.id === `pane-${name}`);
  });
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.pane === name);
  });
  window.scrollTo(0, 0);
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchPane(tab.dataset.pane ?? 'ask'));
});


/* ----------------------------------------------------------
   短い通知
   ---------------------------------------------------------- */

let toastTimer: number | undefined;

function toast(message: string): void {
  elToast.textContent = message;
  elToast.hidden = false;
  elToast.classList.add('is-shown');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elToast.classList.remove('is-shown');
    window.setTimeout(() => { elToast.hidden = true; }, 300);
  }, 2200);
}


/* ----------------------------------------------------------
   そのほかのボタン
   ---------------------------------------------------------- */

elSave.addEventListener('click', () => { void handleSave(); });

elSkip.addEventListener('click', () => {
  if (busy || !currentId) return;
  store.skipped.push(currentId);
  save();
  showQuestion();
});

// Ctrl（⌘）+ Enter でも記録できる
elInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleSave();
});

// 写真
const elPhotoSlot = $<HTMLButtonElement>('#photo-slot');
const elPhotoIn   = $<HTMLInputElement>('#photo-input');

elPhotoSlot.addEventListener('click', () => elPhotoIn.click());
elPhotoIn.addEventListener('change', () => {
  const file = elPhotoIn.files?.[0];
  if (!file) return;

  // スマホのカメラ写真は数MBあることが多く、そのまま保存すると
  // Firestoreの1ドキュメント1MBの上限に引っかかるので、
  // 横800pxくらいに縮めてから保存します
  void resizeImage(file, 800, 0.7)
    .then((dataUrl) => {
      store.photo = dataUrl;
      save();
      render();
    })
    .catch((err) => {
      console.error(err);
      toast('写真の読み込みに失敗しました');
    });
});

/** 画像を指定した幅までリサイズ・圧縮してBase64(dataURL)にする */
function resizeImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('読み込みに失敗しました'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvasを初期化できませんでした'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ----------------------------------------------------------
   書き出し
   ----------------------------------------------------------
   ページから直接ファイルを保存する方法は、埋め込み表示だと
   許可されません。そこで、本文を画面に出して
   コピーしてもらう形にしています。
   ---------------------------------------------------------- */

function buildExportText(): string {
  const i = store.info;
  const lines: string[] = [`# ${i.name || '無題'}`, ''];

  // 基礎情報
  const facts: string[] = [];
  if (i.birth)  facts.push(`- 生まれ：${i.birth}`);
  if (i.place)  facts.push(`- 出身地：${i.place}`);
  if (i.job)    facts.push(`- 仕事：${i.job}`);
  if (i.family) facts.push(`- 家族：${i.family}`);
  if (facts.length) lines.push(...facts, '');

  (Object.keys(SECTION_LABEL) as (keyof typeof SECTION_LABEL)[]).forEach((sec) => {
    const items = store.answers.filter((a) => {
      const q = findQuestion(a.questionId);
      return (a.result?.section ?? q?.section) === sec && q?.infoOnly !== true;
    });
    if (items.length === 0) return;

    lines.push(`## ${SECTION_LABEL[sec]}`, '');
    items.forEach((a) => {
      lines.push(`**${a.question}**`, '', a.result?.text ?? a.raw, '');
    });
  });

  if (store.answers.length === 0) lines.push('（まだ記録がありません）');
  return lines.join('\n');
}

const elExportModal = $<HTMLDivElement>('#export-modal');
const elExportText  = $<HTMLTextAreaElement>('#export-text');

$('#btn-export').addEventListener('click', () => {
  elExportText.value = buildExportText();
  elExportModal.hidden = false;
});

$('#export-close').addEventListener('click', () => {
  elExportModal.hidden = true;
});

elExportModal.addEventListener('click', (e) => {
  if (e.target === elExportModal) elExportModal.hidden = true;
});

$('#export-copy').addEventListener('click', () => {
  // まず標準のコピー機能を試す
  void navigator.clipboard?.writeText(elExportText.value)
    .then(() => toast('コピーしました'))
    .catch(() => selectFallback());

  // 使えない環境では、文章を選択状態にして手動コピーしてもらう
  function selectFallback(): void {
    elExportText.focus();
    elExportText.select();
    toast('文字を選択しました。長押しでコピーしてください');
  }
});

/* ----------------------------------------------------------
   縦長の画像で保存
   ---------------------------------------------------------- */

const elShotBtn   = $<HTMLButtonElement>('#btn-shot');
const elShotModal = $<HTMLDivElement>('#shot-modal');
const elShotImg   = $<HTMLImageElement>('#shot-img');

let shotBlob: Blob | null = null;

elShotBtn.addEventListener('click', () => {
  if (elShotBtn.disabled) return;
  elShotBtn.disabled = true;
  elShotBtn.textContent = '画像を作っています…';

  captureArticle($<HTMLElement>('.doc'))
    .then((blob) => {
      shotBlob = blob;
      elShotImg.src = URL.createObjectURL(blob);
      elShotModal.hidden = false;
    })
    .catch((err) => {
      console.error(err);
      toast('画像を作れませんでした。もう一度お試しください');
    })
    .finally(() => {
      elShotBtn.disabled = false;
      elShotBtn.textContent = '縦長の画像で保存';
    });
});

function closeShot(): void {
  elShotModal.hidden = true;
  if (elShotImg.src) URL.revokeObjectURL(elShotImg.src);
  elShotImg.removeAttribute('src');
  shotBlob = null;
}

$('#shot-close').addEventListener('click', closeShot);
elShotModal.addEventListener('click', (e) => {
  if (e.target === elShotModal) closeShot();
});

$('#shot-save').addEventListener('click', () => {
  if (!shotBlob) return;
  void saveImage(shotBlob, imageFileName(store.info.name));
});

// 最初から
//
// ブラウザ標準の confirm() は、埋め込み表示だと出ないことがあります。
// （押しても何も起きない、という状態になる）
// そのため、自前の確認ダイアログを開く形にしています。

const elModal = $<HTMLDivElement>('#modal');

function openModal(): void {
  elModal.hidden = false;
  $<HTMLButtonElement>('#modal-cancel').focus();
}

function closeModal(): void {
  elModal.hidden = true;
}

$('#btn-clear').addEventListener('click', openModal);
$('#modal-cancel').addEventListener('click', closeModal);

// 背景の暗い部分を押しても閉じる
elModal.addEventListener('click', (e) => {
  if (e.target === elModal) closeModal();
});

// Escキーでも閉じる
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !elModal.hidden) closeModal();
});

$('#modal-ok').addEventListener('click', () => {
  clearAll();

  // 完了画面で隠していた部品を、もう一度出す
  elInput.hidden = false;
  elSave.hidden = false;
  elSkip.hidden = false;
  elSave.disabled = false;
  elInput.value = '';

  render();
  showQuestion();
  closeModal();
  toast('記録を消しました');
});


/* ----------------------------------------------------------
   ログアウト
   ---------------------------------------------------------- */

document.getElementById('btn-logout')?.addEventListener('click', () => {
  void signOut(auth).then(() => {
    location.href = './login.html';
  });
});


/* ----------------------------------------------------------
   起動
   ----------------------------------------------------------
   1. URLの ?person=... から、どの記録を開くか調べる
   2. ログインしているか確認する（していなければlogin.htmlへ）
   3. Firestoreからその記録を読み込んで、はじめて画面を作る
   ---------------------------------------------------------- */

const personId = new URLSearchParams(location.search).get('person');

if (!personId) {
  // どの記録を開くか指定が無いので、一覧画面に戻す
  location.href = './people.html';
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      location.href = './login.html';
      return;
    }
    void boot(personId);
  });
}

async function boot(id: string): Promise<void> {
  try {
    await initStore(id);
  } catch (err) {
    console.error(err);
    alert('この記録を開けませんでした。一覧画面に戻ります。');
    location.href = './people.html';
    return;
  }

  render();
  showQuestion();
}
