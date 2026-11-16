/** Browser: draw the card's SVG onto a canvas and read the PNG back. */
import { cardSvg, type CardLayout } from '../../core/export/lyricCard';

export function cardToPng(layout: CardLayout, _handle?: unknown): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = layout.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not draw the picture.'));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('Could not make the picture.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not draw the picture.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cardSvg(layout));
  });
}
