// Шаблоны URL по вендору регистратора — единственное место, где различия
// между Dahua/Hikvision/безымянными прошивками оседают. Компоненты и сервисы
// сюда не лезут напрямую URL строкой, только через эти функции.
//
// Чистые функции без побочных эффектов и без секретов внутри модуля (пароль
// приходит параметром) — по тому же принципу, что lib/ean13.ts/importParser.ts.
//
// ВАЖНО: rtsp-шаблоны Dahua — из брифа основателя, ещё не проверены на живом
// DHI-HCVR5108C-S2 (прошивка 2015 года у старых Dahua иногда отличается).
// Hikvision — по общеизвестной схеме ISAPI, тоже не проверено на реальном
// устройстве. Первая живая проверка — отдельный шаг с доступом по LAN.

export type CameraVendor = "DAHUA" | "HIKVISION" | "GENERIC";

export type VendorUrlContext = {
  host: string;
  rtspPort: number;
  httpPort: number;
  username: string;
  password: string;
  channel: number;
};

export type VendorTemplate = {
  label: string;
  // Основной поток — только для полноэкранного режима одной камеры.
  rtspUrl: (ctx: VendorUrlContext) => string;
  // Пониженный поток — всегда в сетке (см. отчёт по фиче: 8 каналов основным
  // потоком не влезают в исходящий канал магазина).
  rtspUrlSub: (ctx: VendorUrlContext) => string;
  // Архивное воспроизведение по диапазону времени напрямую через RTSP —
  // работает без CGI-поиска файлов, деградированный, но рабочий путь
  // (см. отчёт по фиче: если CGI-список файлов не заработает на прошивке,
  // просто просим плейбек с нужного времени без предварительной разметки).
  playbackRtspUrl: (ctx: VendorUrlContext, from: Date, to: Date) => string;
  // Список файлов архива с отметками, где есть запись — НЕ реализовано для
  // Dahua/Hikvision: у Dahua это многошаговый CGI (factory.create →
  // findFile.open → findFile.findNext → findFile.close, с session-состоянием
  // между вызовами), у Hikvision — POST с XML-телом на ISAPI/ContentMgmt/search.
  // И то, и другое требует проверки на реальном устройстве, чтобы не написать
  // код, который выглядит правдоподобно, но не работает — оставляю null,
  // архив работает через playbackRtspUrl без предварительной разметки
  // (ровно тот деградированный режим, который явно разрешён в брифе).
  archiveFileList: null;
  // Проверка часов регистратора — см. отчёт по фиче, §7.
  clockCheck: (ctx: VendorUrlContext) => { url: string; method: "GET"; parseTime: (body: string, headers: Record<string, string>) => Date | null };
};

function dahuaTime(d: Date): string {
  // YYYY_MM_DD_HH_MM_SS — формат из брифа, локальное время регистратора.
  // Работаем в UTC как в общем знаменателе; при реальной проверке может
  // понадобиться сдвиг на таймзону магазина (Store.timezone).
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}_${p(d.getUTCMonth() + 1)}_${p(d.getUTCDate())}_${p(d.getUTCHours())}_${p(d.getUTCMinutes())}_${p(d.getUTCSeconds())}`;
}

// Общий вспомогательный парсер: сервер отвечает "table.Table=...\ntime=YYYY-MM-DD HH:MM:SS"
// для Dahua global.cgi?action=getCurrentTime (типичный формат ответа Dahua CGI —
// построчный "ключ=значение", не JSON/XML). Не проверено на реальном устройстве.
function parseDahuaKeyValueTime(body: string): Date | null {
  const m = body.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const d = new Date(m[1].replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export const CAMERA_VENDORS: Record<CameraVendor, VendorTemplate> = {
  DAHUA: {
    label: "Dahua",
    rtspUrl: (ctx) =>
      `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/cam/realmonitor?channel=${ctx.channel}&subtype=0`,
    rtspUrlSub: (ctx) =>
      `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/cam/realmonitor?channel=${ctx.channel}&subtype=1`,
    playbackRtspUrl: (ctx, from, to) =>
      `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/cam/playback?channel=${ctx.channel}&starttime=${dahuaTime(from)}&endtime=${dahuaTime(to)}`,
    archiveFileList: null,
    clockCheck: (ctx) => ({
      url: `http://${ctx.host}:${ctx.httpPort}/cgi-bin/global.cgi?action=getCurrentTime`,
      method: "GET",
      parseTime: (body) => parseDahuaKeyValueTime(body),
    }),
  },
  HIKVISION: {
    label: "Hikvision",
    // ISAPI: ID канала = номер_канала*100 + тип_потока (01=основной, 02=суб).
    rtspUrl: (ctx) => `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/Streaming/Channels/${ctx.channel}01`,
    rtspUrlSub: (ctx) => `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/Streaming/Channels/${ctx.channel}02`,
    playbackRtspUrl: (ctx, from, to) =>
      `rtsp://${ctx.username}:${encodeURIComponent(ctx.password)}@${ctx.host}:${ctx.rtspPort}/Streaming/tracks/${ctx.channel}01?starttime=${from.toISOString()}&endtime=${to.toISOString()}`,
    archiveFileList: null,
    clockCheck: (ctx) => ({
      url: `http://${ctx.host}:${ctx.httpPort}/ISAPI/System/time`,
      method: "GET",
      parseTime: (body) => {
        const m = body.match(/<systemTime>([^<]+)<\/systemTime>/);
        if (!m) return null;
        const d = new Date(m[1]);
        return Number.isNaN(d.getTime()) ? null : d;
      },
    }),
  },
  // Не имеет собственных шаблонов вовсе — полностью полагается на
  // CameraDevice.urlOverride (введённые вручную URL), см. server/services/cameras.ts.
  GENERIC: {
    label: "Другой / не определён",
    rtspUrl: () => {
      throw new Error("Для GENERIC нужен urlOverride.rtspUrl — шаблона по умолчанию нет");
    },
    rtspUrlSub: () => {
      throw new Error("Для GENERIC нужен urlOverride.rtspUrlSub — шаблона по умолчанию нет");
    },
    playbackRtspUrl: () => {
      throw new Error("Для GENERIC нужен urlOverride.playbackRtspUrl — шаблона по умолчанию нет");
    },
    archiveFileList: null,
    clockCheck: () => {
      throw new Error("Для GENERIC проверка часов недоступна без urlOverride");
    },
  },
};

// Запасной, ни на что не полагающийся вариант: если для устройства задан
// urlOverride с конкретным полем — он побеждает шаблон вендора целиком,
// вне зависимости от того, GENERIC это или нет (клиент мог у Dahua тоже
// захотеть подправить URL руками под нестандартную прошивку).
export type UrlOverride = Partial<{
  rtspUrl: string;
  rtspUrlSub: string;
}>;
