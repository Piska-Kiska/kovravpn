// src/app/privacy/page.tsx
import Link from "next/link";
import Logo from "@/components/Logo";
import NavToggles from "@/components/NavToggles";

export const metadata = {
  title: "Политика конфиденциальности — ПроксисВпнович",
  description:
    "Какие данные собирает сервис ПроксисВпнович, как они используются и защищаются.",
  alternates: { canonical: "https://proxysvpn.com/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <nav className="container mx-auto px-4 md:px-6 pt-6 mb-12">
        <div className="nm-raised-sm px-3 md:px-5 py-3 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="nm-circle w-9 h-9 flex items-center justify-center">
              <Logo size={18} className="text-nm-accent" />
            </div>
            <span
              className="hidden sm:inline font-semibold text-nm-text tracking-tight"
              data-i18n="common.brand"
            >
              ПроксисВпнович
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <NavToggles />
            <Link
              href="/"
              className="nm-btn px-3 md:px-4 py-2 text-xs md:text-sm text-nm-text-secondary"
              data-i18n="common.back.home"
            >
              ← На главную
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 md:px-6 max-w-3xl pb-20">
        <h1
          className="font-heading text-3xl md:text-4xl font-bold text-nm-text mb-2 tracking-tight"
          data-i18n="privacy.h1"
        >
          Политика конфиденциальности
        </h1>
        <p className="text-nm-text-secondary text-sm mb-10" data-i18n="privacy.rev">
          Редакция от 4 мая 2026 г.
        </p>

        <div className="space-y-8 text-nm-text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s1.h">1. Общие положения</h2>
            <p data-i18n="privacy.s1.p1">
              Настоящая Политика конфиденциальности (далее — «Политика») регулирует
              порядок сбора, использования и защиты информации, которую Пользователь
              передаёт при использовании сервиса «ПроксисВпнович» (далее — «Сервис»),
              доступного на сайте proxysvpn.com и через Telegram-бота @proxysvpn_bot.
            </p>
            <p className="mt-2" data-i18n="privacy.s1.p2">
              Используя Сервис, Пользователь подтверждает согласие с условиями настоящей
              Политики. При несогласии Пользователь обязан прекратить использование Сервиса.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s2.h">2. Какие данные мы собираем</h2>
            <p data-i18n="privacy.s2.p1">Сервис собирает только минимально необходимые для работы данные:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li data-i18n="privacy.s2.li1">идентификатор Telegram-аккаунта (user ID, username, имя), если регистрация выполнена через Telegram-бота;</li>
              <li data-i18n="privacy.s2.li2">адрес электронной почты, если регистрация выполнена через сайт;</li>
              <li data-i18n="privacy.s2.li3">технические данные подключения (IP-адрес устройства при оплате и подключении к узлу, сведения о клиенте VPN);</li>
              <li data-i18n="privacy.s2.li4">историю операций по балансу (пополнения, списания, реферальные начисления);</li>
              <li data-i18n="privacy.s2.li5">служебные журналы взаимодействия с Telegram-ботом и интерфейсом сайта.</li>
            </ul>
            <p className="mt-2" data-i18n-html="privacy.s2.p2.html">
              Сервис <strong>не запрашивает и не хранит</strong> паспортные данные, сканы
              документов, фотографии, реквизиты банковских карт и иную избыточную личную
              информацию.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s3.h">3. Журналы трафика</h2>
            <p data-i18n="privacy.s3.p1">
              Сервис не ведёт журналы посещаемых Пользователем сайтов, содержимого передаваемого
              трафика и историю DNS-запросов. Хранятся только агрегированные технические метрики
              (объём израсходованного трафика по аккаунту, время последнего подключения),
              необходимые для тарификации и обнаружения злоупотреблений.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s4.h">4. Как используются данные</h2>
            <p data-i18n="privacy.s4.p1">Полученная информация используется исключительно для:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li data-i18n="privacy.s4.li1">предоставления Пользователю заказанной услуги (выпуск конфигураций, тарификация, активация устройств);</li>
              <li data-i18n="privacy.s4.li2">идентификации Пользователя при обращении в поддержку;</li>
              <li data-i18n="privacy.s4.li3">обработки платежей через подключённых платёжных провайдеров;</li>
              <li data-i18n="privacy.s4.li4">защиты Сервиса от мошеннических действий и злоупотреблений (см. п. 13 Пользовательского соглашения);</li>
              <li data-i18n="privacy.s4.li5">уведомлений о состоянии аккаунта, балансе и работе Сервиса.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s5.h">5. Передача данных третьим лицам</h2>
            <p data-i18n="privacy.s5.p1">
              Сервис не передаёт данные Пользователя третьим лицам, за исключением случаев:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li data-i18n="privacy.s5.li1">передачи минимально необходимых данных платёжным провайдерам и агрегаторам для проведения оплаты;</li>
              <li data-i18n="privacy.s5.li2">исполнения обязательных требований законодательства, предъявленных уполномоченными органами в установленном порядке;</li>
              <li data-i18n="privacy.s5.li3">при наличии явного согласия Пользователя.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s6.h">6. Хранение и защита данных</h2>
            <p data-i18n="privacy.s6.p1">
              Данные хранятся в течение срока, необходимого для достижения целей обработки,
              а также в течение разумного периода после прекращения использования Сервиса
              для целей разрешения возможных споров и исполнения требований законодательства.
            </p>
            <p className="mt-2" data-i18n="privacy.s6.p2">
              Сервис применяет разумные технические и организационные меры защиты:
              шифрование каналов передачи данных, ограничение доступа к данным, регулярные
              обновления инфраструктуры. Сервис не гарантирует абсолютной безопасности
              информации при её передаче через сеть Интернет.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s7.h">7. Cookies и аналогичные технологии</h2>
            <p data-i18n="privacy.s7.p1">
              Сайт Сервиса использует технические cookies, необходимые для работы интерфейса
              и поддержания сессии авторизации. Аналитические и рекламные cookies сторонних
              сервисов не используются.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s8.h">8. Права Пользователя</h2>
            <p data-i18n="privacy.s8.p1">
              Пользователь вправе в любой момент:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li data-i18n="privacy.s8.li1">запросить информацию о хранимых данных, связанных с его аккаунтом;</li>
              <li data-i18n="privacy.s8.li2">удалить свой аккаунт через интерфейс Сервиса или обращением в поддержку;</li>
              <li data-i18n="privacy.s8.li3">отозвать согласие на обработку данных, прекратив использование Сервиса.</li>
            </ul>
            <p className="mt-2" data-i18n="privacy.s8.p2">
              После удаления аккаунта данные удаляются в течение 30 дней, кроме данных,
              хранение которых требуется законодательством или необходимо для разрешения
              незакрытых обязательств.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s9.h">9. Отказ от ответственности</h2>
            <p data-i18n="privacy.s9.p1">
              Пользователь понимает и соглашается, что передача информации через сеть
              Интернет всегда сопряжена с рисками. Сервис не несёт ответственности за утрату,
              кражу или раскрытие данных, произошедшие по вине третьих лиц или в результате
              действий самого Пользователя (компрометация устройства, передача учётных данных
              третьим лицам и т. п.).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s10.h">10. Изменения в Политике</h2>
            <p data-i18n="privacy.s10.p1">
              Сервис вправе вносить изменения в настоящую Политику. Актуальная редакция
              публикуется по адресу proxysvpn.com/privacy с указанием даты обновления.
              Продолжение использования Сервиса после публикации изменений означает согласие
              с новой редакцией.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-nm-text mb-3" data-i18n="privacy.s11.h">11. Контакты</h2>
            <p data-i18n-html="privacy.s11.p1.html">
              По всем вопросам, связанным с обработкой персональных данных, Пользователь
              может обратиться через Telegram-бота{" "}
              <a href="https://t.me/proxysvpn_support_bot" className="text-nm-accent hover:underline">
                @proxysvpn_support_bot
              </a>{" "}
              или на адрес{" "}
              <a href="mailto:support@proxysvpn.com" className="text-nm-accent hover:underline">
                support@proxysvpn.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
