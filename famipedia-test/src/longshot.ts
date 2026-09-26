/* ==========================================================
   longshot.ts  ―  スクショ：記事（Wikipedia風の部分）を画像にする
   ----------------------------------------------------------
   画面に見えている範囲だけでなく、記事の最初から最後までを
   いま表示されている見た目のまま、縦長の画像1枚にします。
   上にロゴ、下に「ファミペディアで作成・日付」を添えます。
   ========================================================== */

/** iPhoneのSafariは、これより大きい画像を作ろうとすると真っ白になる */
const MAX_PIXELS = 16_000_000;

/** 画像に写さない部品（ボタンやリンク、写真が入っていない「写真を追加」の枠） */
const NOT_IN_IMAGE = [
  '.doc-shot',                       // スクショボタン
  '.doc-foot-donate',                // 「支援する」リンク
  '.infobox-edit',                   // 基礎情報の ✎ ボタン
  '.para-edit',                      // 文章ごとの［編集］ボタン
  '.infobox-photo:not(.has-image)',  // 写真が入っていない「写真を追加」の枠
].join(', ');

/** 記事を縦長の画像（PNG）にする */
export async function captureArticle(article: HTMLElement): Promise<Blob> {
  // 使うときだけ読み込む（普段の表示を重くしないため）
  const { domToBlob } = await import('modern-screenshot');

  // 画面外に同じ幅で複製を置き、写さない部品を外してから撮る。
  // 元の記事から直接外すと、一瞬表示が崩れて見えてしまうため
  const frame = document.createElement('div');
  frame.className = 'shot-frame';
  frame.style.width = `${article.offsetWidth}px`;
  frame.setAttribute('aria-hidden', 'true');

  const brand = document.createElement('div');
  brand.className = 'shot-brand';
  brand.innerHTML =
    '<span class="logo-mark">F</span>'
    + '<span class="logo-text"><strong>ファミペディア</strong><small>家族の百科事典</small></span>';

  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(NOT_IN_IMAGE).forEach((el) => el.remove());
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // 追加直後の黄色いハイライトが写り込まないようにする
  clone.querySelectorAll('.just-added').forEach((el) => el.classList.remove('just-added'));
  // 記事の下の広い余白は、すぐ下に日付を置くので詰める
  clone.style.paddingBottom = '12px';
  const foot = document.createElement('p');
  foot.className = 'shot-foot';
  foot.textContent = `ファミペディアで作成 ・ ${todayLabel()}`;

  // ロゴと日付の左右の余白を、記事の本文とそろえる
  const { paddingLeft, paddingRight } = getComputedStyle(article);
  for (const el of [brand, foot]) {
    el.style.paddingLeft = paddingLeft;
    el.style.paddingRight = paddingRight;
  }

  frame.append(brand, clone, foot);
  document.body.append(frame);

  try {
    // 長い記事ほど解像度を下げて、上限を超えないようにする
    const { offsetWidth: w, offsetHeight: h } = frame;
    const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (w * h)));

    return await domToBlob(frame, {
      scale,
      backgroundColor: '#ffffff',
      // 複製は画面外に置いてあるので、画像の中では左上に戻す
      style: { position: 'static', left: '0', top: '0' },
    });
  } finally {
    frame.remove();
  }
}

function todayLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}


/* ----------------------------------------------------------
   保存
   ----------------------------------------------------------
   スマホでは共有シートを開きます（そこから「画像を保存」を選べる）。
   PCや共有できない環境では、ファイルとしてダウンロードします。
   ---------------------------------------------------------- */

export async function saveImage(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // 共有シートを閉じただけなら、何もしない
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  // ページに置いてからでないと、ファイル名が無視されるブラウザがある
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 例：famipedia_田中一郎_20260926.png */
export function imageFileName(personName: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const name = personName.replace(/[\\/:*?"<>|\s]+/g, '') || '記録';
  return `famipedia_${name}_${ymd}.png`;
}
