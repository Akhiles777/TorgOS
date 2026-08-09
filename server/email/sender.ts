// Отправка почты — интерфейс + единственная реализация-заглушка (console.log).
// SMTP пока не подключён (см. отчёт по шагу 5 плана Фазы 2): рекомендация на
// будущее — Timeweb Postbox (сервер и так у российского хостера, лучше
// доставляемость до @mail.ru/@yandex.ru, оплата в рублях без карты).
// Когда подключим реальный провайдер — просто добавится вторая реализация
// EmailSender, вызывающий код (onboarding.ts) трогать не придётся.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`\n── Письмо (заглушка, SMTP не подключён) ──\nКому: ${message.to}\nТема: ${message.subject}\n\n${message.text}\n───────────────────────────────────────────\n`);
  }
}

export const emailSender: EmailSender = new ConsoleEmailSender();
