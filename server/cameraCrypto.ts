// Шифрование паролей от регистраторов — чужое оборудование в чужом магазине,
// в БД пароль в открытом виде лежать не должен. Первый настоящий секрет
// такого рода в проекте (AUTH_SECRET объявлен, но нигде не читается).
//
// Формат: один непрозрачный base64-блоб на колонку — [1 байт версия][12 байт
// iv][16 байт authTag][шифротекст], а не отдельные iv/tag столбцы. Тот же
// принцип, что у Session.id = sha256(token): один опаковый идентификатор,
// не набор полей, которые могут разойтись. Байт версии — дешёвый задел на
// смену алгоритма в будущем, сейчас всегда 0x01.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey(): Buffer {
  const raw = process.env.CAMERA_ENCRYPTION_KEY;
  if (!raw) throw new Error("CAMERA_ENCRYPTION_KEY не задан — камеры работать не будут");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`CAMERA_ENCRYPTION_KEY должен быть 32 байта в base64 (openssl rand -base64 32), получено ${key.length}`);
  }
  return key;
}

// Ключ читается лениво, не при импорте модуля — иначе сборка/тесты, которые
// вообще не трогают камеры, падали бы из-за отсутствия переменной окружения.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN) throw new Error("Повреждённое значение: слишком короткое");
  const version = buf[0];
  if (version !== VERSION) throw new Error(`Неизвестная версия шифрования: ${version}`);
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
