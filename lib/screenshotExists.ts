import { existsSync } from "node:fs";
import { join } from "node:path";

// Проверка на сервере (файлы кладутся в public/screens/ руками, без апи) —
// как только заказчик положит файл, компонент сам покажет картинку вместо
// заглушки, без правки кода.
export function screenshotExists(filename: string): boolean {
  return existsSync(join(process.cwd(), "public", "screens", filename));
}
