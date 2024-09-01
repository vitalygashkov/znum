import { createWriteStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { SingleBar, Presets } from 'cli-progress';
import PDFDocument from 'pdfkit';

export const convertImagesToPdf = async (pages, output) => {
  const pdfProgress = new SingleBar({}, Presets.shades_classic);
  pdfProgress.start(pages.length, 0);
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.pipe(createWriteStream(output));
  for (let i = 1; i <= pages.length; i++) {
    const page = pages[i - 1];
    if (!existsSync(page)) {
      console.log(`Не найден файл страницы ${i}, пропускаем...`);
      continue;
    }
    const pageImage = doc.openImage(page);
    doc.addPage({ size: [pageImage.width, pageImage.height] });
    doc.image(pageImage, 0, 0);
    pdfProgress.update(i);
  }
  doc.end();
  pdfProgress.stop();
  console.log(`Конвертирование завершено: ${output}`);
};
