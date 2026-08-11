import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./cameraCrypto";

describe("cameraCrypto", () => {
  it("раунд-трип: расшифровка даёт исходный текст", () => {
    const plain = "SuperSecretDvrPassword123!";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("пустая строка тоже round-trip'ится (пустой пароль — валидный edge case)", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("два шифрования одного текста дают разные блобы (случайный iv)", () => {
    const a = encryptSecret("одинаковый пароль");
    const b = encryptSecret("одинаковый пароль");
    expect(a).not.toBe(b);
  });

  it("кириллица и спецсимволы переживают round-trip", () => {
    const plain = "Пароль-123!@#$%^&*()_+ 日本語";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("порча одного байта шифротекста — расшифровка падает (GCM authTag)", () => {
    const encoded = encryptSecret("test");
    const buf = Buffer.from(encoded, "base64");
    buf[buf.length - 1] ^= 0xff; // портим последний байт шифротекста
    const tampered = buf.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("неизвестная версия — явная ошибка, не тихий мусор", () => {
    const encoded = encryptSecret("test");
    const buf = Buffer.from(encoded, "base64");
    buf[0] = 0x99;
    expect(() => decryptSecret(buf.toString("base64"))).toThrow(/версия/);
  });

  it("слишком короткое значение — явная ошибка", () => {
    expect(() => decryptSecret(Buffer.from([1, 2, 3]).toString("base64"))).toThrow(/короткое/);
  });
});
