// Обёртка над HTTP API локального go2rtc — синхронизирует список RTSP-
// источников с тем, что прислал сервер при регистрации агента.
//
// ВНИМАНИЕ (см. отчёт по фиче): точный синтаксис runtime-API go2rtc для
// добавления/удаления потока без перезаписи всего config.yaml и рестарта —
// НЕ проверен на реальном go2rtc, только по документации на момент письма.
// Ниже — реализация через `PUT/DELETE /api/streams`; если у используемой
// версии go2rtc API называется иначе, это единственное место правки.
import http from "node:http";

function request(baseUrl, method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function listStreams(go2rtcApi) {
  const res = await request(go2rtcApi, "GET", "/api/streams");
  if (res.status !== 200) throw new Error(`go2rtc /api/streams вернул ${res.status}`);
  try {
    return JSON.parse(res.body || "{}");
  } catch {
    return {};
  }
}

export async function syncStreams(go2rtcApi, desired) {
  const current = await listStreams(go2rtcApi).catch(() => ({}));
  const desiredNames = new Set();
  for (const s of desired) {
    desiredNames.add(s.name);
    if (s.rtspUrlSub) desiredNames.add(`${s.name}_sub`);
  }

  // Убираем то, чего больше не должно быть (камеру отключили/удалили).
  for (const name of Object.keys(current)) {
    if (!desiredNames.has(name)) {
      await request(go2rtcApi, "DELETE", `/api/streams?name=${encodeURIComponent(name)}`).catch((e) =>
        console.error(`Не удалось удалить поток ${name} из go2rtc:`, e.message),
      );
    }
  }

  // Основной поток (полноэкранный режим) и пониженный (сетка) — два
  // отдельных имени в go2rtc, не один поток с двумя источниками: так проще
  // просить у go2rtc конкретно нужное качество, не полагаясь на его
  // собственный выбор источника.
  for (const stream of desired) {
    await request(go2rtcApi, "PUT", `/api/streams?name=${encodeURIComponent(stream.name)}&src=${encodeURIComponent(stream.rtspUrl)}`).catch((e) =>
      console.error(`Не удалось добавить поток ${stream.name} в go2rtc:`, e.message),
    );
    if (stream.rtspUrlSub) {
      await request(
        go2rtcApi, "PUT",
        `/api/streams?name=${encodeURIComponent(stream.name + "_sub")}&src=${encodeURIComponent(stream.rtspUrlSub)}`,
      ).catch((e) => console.error(`Не удалось добавить суб-поток ${stream.name}_sub в go2rtc:`, e.message));
    }
  }
}
