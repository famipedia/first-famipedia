/* ==========================================================
   image.ts  ―  写真を小さくしてから保存するための道具
   ----------------------------------------------------------
   スマホのカメラ写真は数MBあることが多く、そのまま保存すると
   Firestoreの1ドキュメント1MBの上限に引っかかります。
   記事ページ（main.ts）と思い出ページ（memory.ts）で使います。
   ========================================================== */

/** 画像を指定した幅までリサイズ・圧縮してBase64(dataURL)にする */
export function resizeImage(file: File, maxWidth: number, quality: number): Promise<string> {
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
