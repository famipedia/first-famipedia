/* ==========================================================
   longshot.ts  ―  記事ページを縦長の画像1枚にする
   ----------------------------------------------------------
   画面に見えている範囲だけでなく、記事の最初から最後までを
   スマホ幅の縦長画像にします。PCで押しても同じ幅で撮るので、
   LINEなどで送ったときに読みやすい形になります。
   ========================================================== */

/** 画像の横幅（CSSピクセル）。スマホの画面幅に合わせています */
const SHOT_WIDTH = 420;

/** iPhoneのSafariは、これより大きい画像を作ろうとすると真っ白になる */
const MAX_PIXELS = 16_000_000;

/** 記事を複製して縦長の画像（PNG）にする */
export async function captureArticle(article: HTMLElement): Promise<Blob> {
  // 使うときだけ読み込む（普段の表示を重くしないため）
  const { domToBlob } = await import('modern-screenshot');

  const frame = buildFrame(article);
  document.body.append(frame);

  try {
    // 長い記事ほど解像度を下げて、上限を超えないようにする
    const height = frame.offsetHeight;
    const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (SHOT_WIDTH * height)));

    return await domToBlob(frame, {
      scale,
      backgroundColor: '#ffffff',
      // 撮影用の枠は画面外に置いてあるので、画像の中では左上に戻す
      style: { position: 'static', left: '0', top: '0' },
    });
  } finally {
    frame.remove();
  }
}

/** 撮影用の枠：ロゴ → 記事の複製 → 日付、の順に並べる */
function buildFrame(article: HTMLElement): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'shot-frame';
  frame.style.width = `${SHOT_WIDTH}px`;
  frame.setAttribute('aria-hidden', 'true');

  const brand = document.createElement('div');
  brand.className = 'shot-brand';
  brand.innerHTML =
    '<span class="logo-mark">F</span>'
    + '<span class="logo-text"><strong>ファミペディア</strong><small>家族の百科事典</small></span>';

  const clone = article.cloneNode(true) as HTMLElement;
  // 画像に写す必要のない部品と、元の画面とかぶる id を外す
  clone.querySelectorAll('.doc-shot, .doc-foot-donate, .infobox-edit').forEach((el) => el.remove());
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  const foot = document.createElement('p');
  foot.className = 'shot-foot';
  foot.textContent = `ファミペディアで作成 ・ ${todayLabel()}`;

  frame.append(brand, clone, foot);
  return frame;
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
