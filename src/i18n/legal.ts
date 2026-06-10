// src/i18n/legal.ts
// Single source of truth for legal documents (Terms + Privacy), all site languages.
// Generated content — adapted for Kovra (crypto-only, international). Review by counsel recommended.
// Placeholders to fill: Kovra Ltd., Seychelles.
import type { Lang } from "./dict";

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; updated: string; related: string; sections: LegalSection[] };
export type LegalDocId = "terms" | "privacy";

export const LEGAL: Record<Lang, Record<LegalDocId, LegalDoc>> = {
  "en": {
    "terms": {
      "title": "Terms of Service",
      "updated": "Last updated: 11 June 2026",
      "related": "Related documents",
      "sections": [
        {
          "h": "1. General",
          "p": [
            "These Terms of Service (the «Terms») govern your use of the Kovra service (the «Service»), available at kovravpn.com and through the Telegram bot @KovraVPN_bot, operated by Kovra Ltd. (the «Operator», «we»).",
            "By using the Service — registering, paying, or accessing any materials — you confirm that you have read and accept these Terms in full. If you do not agree, you must stop using the Service."
          ]
        },
        {
          "h": "2. The Service",
          "p": [
            "Kovra is an intangible digital service that establishes an encrypted network connection (VPN) and issues connection configurations for your devices. It is intended to protect the confidentiality of your traffic and is provided as a network-security tool.",
            "We do not keep logs of your browsing activity, DNS queries, or the content of transmitted traffic. Only aggregate technical metrics required for billing and abuse prevention are stored."
          ]
        },
        {
          "h": "3. Eligibility and Acceptable Use",
          "p": [
            "The Service is provided for personal, non-commercial use. You must be of the age required to enter into a binding agreement in your jurisdiction.",
            "Sharing your credentials or subscription links with third parties, reselling access, and using the Service to operate a competing commercial VPN are prohibited.",
            "You are solely responsible for complying with the laws applicable to you. You must not use the Service for any unlawful purpose, to infringe the rights of others, or to abuse the infrastructure (including large-scale automated connections or activity that degrades the Service for other users)."
          ]
        },
        {
          "h": "4. Plans and Payment",
          "p": [
            "The Service is offered as prepaid subscriptions. Plans, terms, prices, and the number of devices are shown on the website at the time of purchase.",
            "Payment is accepted in cryptocurrency through third-party payment processors. A subscription is activated once the corresponding payment is confirmed on the relevant blockchain.",
            "Cryptocurrency transactions are irreversible. You are responsible for sending the correct amount in the correct asset to the address provided during checkout."
          ]
        },
        {
          "h": "5. Refunds",
          "p": [
            "Because the Service is an intangible digital service paid for with irreversible cryptocurrency transactions, payments are generally non-refundable once a subscription has been activated.",
            "A refund may be considered only where the Service was not delivered due to a fault on our side, confirmed by a support request submitted within 14 days of payment. Approved refunds are issued to the same wallet and in the same asset used for payment, less any network fees.",
            "We recommend purchasing the shortest available term first to verify compatibility with your devices and network before committing to a longer period."
          ]
        },
        {
          "h": "6. Service Quality",
          "p": [
            "We aim to provide a stable and fast connection, but quality depends on factors outside our control: your internet provider, your equipment, intermediate networks, and restrictions imposed by carriers or authorities in your location.",
            "The Service is provided «as is» and «as available». We do not guarantee uninterrupted or error-free operation, compatibility with any specific device or software, or that the Service will meet your expectations."
          ]
        },
        {
          "h": "7. Suspension and Termination",
          "p": [
            "We may suspend or terminate the Service where you breach these Terms, where abuse or fraudulent activity is detected, where required by a competent authority or payment processor, or where your activity creates elevated risk for the infrastructure, other users, or third parties.",
            "Termination for breach does not entitle you to a refund of amounts already paid."
          ]
        },
        {
          "h": "8. Fair Use and Abuse Prevention",
          "p": [
            "We use automated means to detect abuse, including analysis of traffic volume, connection frequency, and device activity. Where atypical load is detected, we may temporarily limit speed or suspend a connection until the matter is resolved.",
            "Atypical load includes, in particular, sustained maximum-speed use, large-volume peer-to-peer traffic, signs of reselling, and automated or bot connections."
          ]
        },
        {
          "h": "9. Intellectual Property",
          "p": [
            "All materials on the website and in the Telegram bot are protected by intellectual-property law. You may not copy, distribute, resell, or otherwise use them without the rightsholder's permission."
          ]
        },
        {
          "h": "10. Limitation of Liability",
          "p": [
            "To the maximum extent permitted by law, we are not liable for indirect or consequential losses, including lost profits, or for the acts or omissions of third parties such as internet providers and payment processors.",
            "Our aggregate liability to you is limited to the amount you paid for the Service in the three (3) months preceding the event giving rise to the claim."
          ]
        },
        {
          "h": "11. Referral Program",
          "p": [
            "You may invite others using a referral link. For each invited user who makes a first qualifying purchase, you receive the reward described on the website. The number of rewarded referrals per account may be limited.",
            "Abuse of the referral program — fake accounts, automated invitations, or self-referral — voids rewards and may result in account suspension."
          ]
        },
        {
          "h": "12. Changes to These Terms",
          "p": [
            "We may amend these Terms. The updated version is published on the website with its revision date. Continued use of the Service after publication constitutes acceptance of the new version."
          ]
        },
        {
          "h": "13. Governing Law and Disputes",
          "p": [
            "These Terms are governed by the laws of Seychelles. Any dispute that cannot be resolved amicably shall be settled by binding arbitration or by the competent courts of Seychelles, to the extent permitted by applicable mandatory law."
          ]
        },
        {
          "h": "14. Contact",
          "p": [
            "For any questions about the Service, contact us via the Telegram bot @KovraVPN_bot or by email at support@kovravpn.com."
          ]
        }
      ]
    },
    "privacy": {
      "title": "Privacy Policy",
      "updated": "Last updated: 11 June 2026",
      "related": "Related documents",
      "sections": [
        {
          "h": "1. General",
          "p": [
            "This Privacy Policy (the «Policy») explains how the Operator of Kovra (Kovra Ltd., «we», the data controller) collects, uses, and protects information you provide when using the Service at kovravpn.com and through the Telegram bot @KovraVPN_bot.",
            "By using the Service you accept this Policy. If you do not agree, you must stop using the Service."
          ]
        },
        {
          "h": "2. Data We Collect",
          "p": [
            "We collect only the data necessary to operate the Service:",
            "• a Telegram identifier (user ID, username, name) if you register through the Telegram bot, or an email address if you register through the website;",
            "• technical connection data (the IP address of your device at the time of payment and when connecting to a node, and basic VPN client information);",
            "• subscription and payment metadata (plan, term, transaction identifiers);",
            "• service logs of interactions with the bot and the website interface.",
            "We do not request or store identity documents, photographs, or payment-card details."
          ]
        },
        {
          "h": "3. No Activity Logs",
          "p": [
            "We do not keep logs of the websites you visit, the content of your traffic, or your DNS queries. We store only aggregate technical metrics (such as traffic volume per account and last-connection time) needed for billing and abuse prevention."
          ]
        },
        {
          "h": "4. How We Use Your Data",
          "p": [
            "We use the information solely to: provide the Service you ordered (issuing configurations, activating devices, managing subscriptions); identify you when you contact support; process payments through our payment processors; protect the Service against fraud and abuse; and send you notifications about your account and the Service."
          ]
        },
        {
          "h": "5. Legal Bases for Processing",
          "p": [
            "Where the GDPR applies, we process your data on the following bases: performance of our contract with you (providing the Service); our legitimate interests (security, fraud prevention, and improving the Service); compliance with legal obligations; and your consent, where required."
          ]
        },
        {
          "h": "6. Cryptocurrency Payments",
          "p": [
            "Payments are processed by third-party cryptocurrency payment processors. We do not store card or wallet credentials. Note that blockchain transactions are public by nature, and on-chain data is outside our control."
          ]
        },
        {
          "h": "7. Sharing of Data",
          "p": [
            "We do not sell your data. We share the minimum necessary data with payment processors to complete a transaction, with authorities where required by law through due process, and otherwise only with your explicit consent."
          ]
        },
        {
          "h": "8. International Transfers",
          "p": [
            "Kovra operates servers in multiple countries. Your data may be processed in countries other than your own. Where required, we rely on appropriate safeguards for such transfers, such as standard contractual clauses or equivalent measures."
          ]
        },
        {
          "h": "9. Data Retention",
          "p": [
            "We keep your data only for as long as necessary to provide the Service and for a reasonable period afterwards to resolve disputes and meet legal obligations. After you delete your account, your data is deleted within 30 days, except data we are required to retain by law."
          ]
        },
        {
          "h": "10. Your Rights",
          "p": [
            "You may at any time: request information about the data associated with your account; request correction or deletion of your data; restrict or object to certain processing; request a copy of your data in a portable format; and withdraw consent where processing is based on consent.",
            "To exercise these rights, contact us via the bot @KovraVPN_bot or at support@kovravpn.com. If the GDPR applies to you, you also have the right to lodge a complaint with your local data-protection supervisory authority."
          ]
        },
        {
          "h": "11. Cookies",
          "p": [
            "The website uses only technical cookies required for the interface and to maintain your authenticated session. We do not use third-party analytics or advertising cookies."
          ]
        },
        {
          "h": "12. Security",
          "p": [
            "We apply reasonable technical and organizational measures to protect your data, including encryption of data in transit, access controls, and regular infrastructure updates. No transmission over the internet is completely secure, and we cannot guarantee absolute security."
          ]
        },
        {
          "h": "13. Children",
          "p": [
            "The Service is not directed to children. We do not knowingly collect data from anyone under the age required for valid consent in their jurisdiction (16 in much of the EU). If you believe a child has provided us data, contact us and we will delete it."
          ]
        },
        {
          "h": "14. Changes to This Policy",
          "p": [
            "We may update this Policy. The current version is published at kovravpn.com/privacy with its revision date. Continued use after publication constitutes acceptance."
          ]
        },
        {
          "h": "15. Contact",
          "p": [
            "For questions about the processing of your personal data, contact the data controller via the Telegram bot @KovraVPN_bot or by email at support@kovravpn.com."
          ]
        }
      ]
    }
  },
  "ru": {
    "terms": {
      "title": "Пользовательское соглашение",
      "updated": "Редакция от 11 июня 2026 г.",
      "related": "Связанные документы",
      "sections": [
        {
          "h": "1. Общие положения",
          "p": [
            "Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует использование сервиса Kovra (далее — «Сервис»), доступного на сайте kovravpn.com и через Telegram-бота @KovraVPN_bot, оператором которого является Kovra Ltd. (далее — «Оператор», «мы»).",
            "Используя Сервис — регистрируясь, оплачивая услуги или получая доступ к материалам — вы подтверждаете, что полностью ознакомились с настоящим Соглашением и принимаете его. В случае несогласия вы обязаны прекратить использование Сервиса."
          ]
        },
        {
          "h": "2. Сервис",
          "p": [
            "Kovra — нематериальная цифровая услуга, которая устанавливает зашифрованное сетевое соединение (VPN) и выпускает конфигурации для подключения ваших устройств. Сервис предназначен для защиты конфиденциальности вашего трафика и предоставляется как средство сетевой безопасности.",
            "Мы не ведём журналы вашей сетевой активности, DNS-запросов и содержимого передаваемого трафика. Хранятся только агрегированные технические метрики, необходимые для тарификации и предотвращения злоупотреблений."
          ]
        },
        {
          "h": "3. Условия использования",
          "p": [
            "Сервис предоставляется для личного некоммерческого использования. Вы должны достичь возраста, с которого вправе заключать обязывающие соглашения в вашей юрисдикции.",
            "Передача учётных данных или ссылок подписки третьим лицам, перепродажа доступа и использование Сервиса для запуска конкурирующего коммерческого VPN запрещены.",
            "Вы несёте полную ответственность за соблюдение применимого к вам законодательства. Запрещается использовать Сервис в противоправных целях, для нарушения прав третьих лиц или для злоупотребления инфраструктурой (включая массовые автоматизированные подключения и действия, ухудшающие работу Сервиса для других пользователей)."
          ]
        },
        {
          "h": "4. Тарифы и оплата",
          "p": [
            "Сервис предоставляется по модели предоплаченных подписок. Тарифы, сроки, цены и количество устройств указаны на сайте на момент покупки.",
            "Оплата принимается в криптовалюте через сторонних платёжных провайдеров. Подписка активируется после подтверждения соответствующего платежа в соответствующей блокчейн-сети.",
            "Криптовалютные транзакции необратимы. Вы отвечаете за отправку корректной суммы в корректном активе на адрес, указанный при оформлении."
          ]
        },
        {
          "h": "5. Возврат средств",
          "p": [
            "Поскольку Сервис является нематериальной цифровой услугой, оплачиваемой необратимыми криптовалютными транзакциями, платежи, как правило, не подлежат возврату после активации подписки.",
            "Возврат может быть рассмотрен только если услуга не была оказана по вине Оператора, что подтверждено обращением в поддержку в течение 14 дней с даты платежа. Одобренный возврат производится на тот же кошелёк и в том же активе, которым была произведена оплата, за вычетом сетевых комиссий.",
            "Рекомендуем сначала приобрести минимальный доступный срок, чтобы проверить совместимость с вашими устройствами и сетью, прежде чем оплачивать более длительный период."
          ]
        },
        {
          "h": "6. Качество услуг",
          "p": [
            "Мы стремимся обеспечить стабильное и быстрое соединение, однако качество зависит от факторов вне нашего контроля: вашего интернет-провайдера, вашего оборудования, промежуточных сетей и ограничений, вводимых операторами связи или уполномоченными органами по месту вашего нахождения.",
            "Сервис предоставляется на условиях «как есть» и «по мере доступности». Мы не гарантируем бесперебойную или безошибочную работу, совместимость с конкретным устройством или программным обеспечением, а также соответствие Сервиса вашим ожиданиям."
          ]
        },
        {
          "h": "7. Приостановление и прекращение",
          "p": [
            "Мы вправе приостановить или прекратить предоставление Сервиса при нарушении вами настоящего Соглашения, при выявлении злоупотреблений или мошеннической активности, по требованию уполномоченного органа или платёжного провайдера, а также если ваши действия создают повышенный риск для инфраструктуры, других пользователей или третьих лиц.",
            "Прекращение в связи с нарушением не даёт права на возврат ранее уплаченных средств."
          ]
        },
        {
          "h": "8. Добросовестное использование и защита от злоупотреблений",
          "p": [
            "Мы применяем автоматизированные средства обнаружения злоупотреблений, включая анализ объёма трафика, частоты подключений и активности устройств. При выявлении нетипичной нагрузки мы вправе временно ограничить скорость или приостановить подключение до выяснения обстоятельств.",
            "К нетипичной нагрузке относятся, в частности, длительное использование канала на максимальной скорости, большие объёмы P2P-трафика, признаки перепродажи, а также автоматизированные или ботовые подключения."
          ]
        },
        {
          "h": "9. Интеллектуальная собственность",
          "p": [
            "Все материалы на сайте и в Telegram-боте охраняются законодательством об интеллектуальной собственности. Запрещается копировать, распространять, перепродавать или иным образом использовать их без разрешения правообладателя."
          ]
        },
        {
          "h": "10. Ограничение ответственности",
          "p": [
            "В максимально допустимой законом степени мы не несём ответственности за косвенные или вытекающие убытки, включая упущенную выгоду, а также за действия или бездействие третьих лиц, таких как интернет-провайдеры и платёжные провайдеры.",
            "Совокупная ответственность Оператора перед вами ограничена суммой, уплаченной вами за Сервис за три (3) месяца, предшествующих событию, послужившему основанием для требования."
          ]
        },
        {
          "h": "11. Реферальная программа",
          "p": [
            "Вы можете приглашать других пользователей по реферальной ссылке. За каждого приглашённого, совершившего первую квалифицирующую покупку, вы получаете вознаграждение, описанное на сайте. Количество вознаграждаемых приглашений на аккаунт может быть ограничено.",
            "Злоупотребление реферальной программой — фиктивные аккаунты, автоматизированные приглашения или саморегистрация — аннулирует вознаграждения и может повлечь блокировку аккаунта."
          ]
        },
        {
          "h": "12. Изменение Соглашения",
          "p": [
            "Мы вправе вносить изменения в настоящее Соглашение. Обновлённая версия публикуется на сайте с указанием даты редакции. Продолжение использования Сервиса после публикации означает согласие с новой редакцией."
          ]
        },
        {
          "h": "13. Применимое право и разрешение споров",
          "p": [
            "Настоящее Соглашение регулируется правом Seychelles. Любой спор, который не удалось разрешить мирным путём, подлежит разрешению в обязательном арбитраже или в компетентных судах Seychelles в той мере, в какой это допускается применимыми императивными нормами."
          ]
        },
        {
          "h": "14. Контакты",
          "p": [
            "По всем вопросам, связанным с Сервисом, обращайтесь через Telegram-бота @KovraVPN_bot или по электронной почте support@kovravpn.com."
          ]
        }
      ]
    },
    "privacy": {
      "title": "Политика конфиденциальности",
      "updated": "Редакция от 11 июня 2026 г.",
      "related": "Связанные документы",
      "sections": [
        {
          "h": "1. Общие положения",
          "p": [
            "Настоящая Политика конфиденциальности (далее — «Политика») описывает, как Оператор сервиса Kovra (Kovra Ltd., далее — «мы», оператор данных) собирает, использует и защищает информацию, которую вы предоставляете при использовании Сервиса на сайте kovravpn.com и через Telegram-бота @KovraVPN_bot.",
            "Используя Сервис, вы принимаете настоящую Политику. В случае несогласия вы обязаны прекратить использование Сервиса."
          ]
        },
        {
          "h": "2. Какие данные мы собираем",
          "p": [
            "Мы собираем только данные, необходимые для работы Сервиса:",
            "• идентификатор Telegram (user ID, username, имя), если вы регистрируетесь через Telegram-бота, либо адрес электронной почты, если регистрация выполнена через сайт;",
            "• технические данные подключения (IP-адрес устройства в момент оплаты и при подключении к узлу, базовые сведения о VPN-клиенте);",
            "• метаданные подписки и платежа (тариф, срок, идентификаторы транзакций);",
            "• служебные журналы взаимодействия с ботом и интерфейсом сайта.",
            "Мы не запрашиваем и не храним документы, удостоверяющие личность, фотографии и реквизиты банковских карт."
          ]
        },
        {
          "h": "3. Журналы трафика",
          "p": [
            "Мы не ведём журналы посещаемых вами сайтов, содержимого вашего трафика и DNS-запросов. Хранятся только агрегированные технические метрики (например, объём трафика по аккаунту и время последнего подключения), необходимые для тарификации и предотвращения злоупотреблений."
          ]
        },
        {
          "h": "4. Как мы используем данные",
          "p": [
            "Мы используем информацию исключительно для того, чтобы: предоставлять заказанную услугу (выпуск конфигураций, активация устройств, управление подписками); идентифицировать вас при обращении в поддержку; обрабатывать платежи через платёжных провайдеров; защищать Сервис от мошенничества и злоупотреблений; направлять вам уведомления об аккаунте и о Сервисе."
          ]
        },
        {
          "h": "5. Правовые основания обработки",
          "p": [
            "Когда применяется GDPR, мы обрабатываем ваши данные на следующих основаниях: исполнение договора с вами (предоставление Сервиса); наши законные интересы (безопасность, предотвращение мошенничества и улучшение Сервиса); соблюдение юридических обязанностей; а также ваше согласие, когда оно требуется."
          ]
        },
        {
          "h": "6. Криптовалютные платежи",
          "p": [
            "Платежи обрабатываются сторонними криптовалютными платёжными провайдерами. Мы не храним реквизиты карт или кошельков. Учтите, что транзакции в блокчейне по своей природе публичны, а данные в сети вне нашего контроля."
          ]
        },
        {
          "h": "7. Передача данных",
          "p": [
            "Мы не продаём ваши данные. Мы передаём минимально необходимые данные платёжным провайдерам для проведения транзакции, уполномоченным органам — когда это требуется по закону в установленном порядке, а в остальных случаях — только с вашего явного согласия."
          ]
        },
        {
          "h": "8. Трансграничная передача",
          "p": [
            "Kovra использует серверы в нескольких странах. Ваши данные могут обрабатываться за пределами вашей страны. При необходимости мы применяем надлежащие гарантии для такой передачи, например стандартные договорные положения или эквивалентные меры."
          ]
        },
        {
          "h": "9. Хранение данных",
          "p": [
            "Мы храним ваши данные только в течение срока, необходимого для предоставления Сервиса, и разумного периода после этого для разрешения споров и исполнения юридических обязанностей. После удаления аккаунта ваши данные удаляются в течение 30 дней, за исключением данных, которые мы обязаны хранить по закону."
          ]
        },
        {
          "h": "10. Ваши права",
          "p": [
            "Вы вправе в любой момент: запросить информацию о данных, связанных с вашим аккаунтом; потребовать исправления или удаления данных; ограничить обработку или возразить против неё; запросить копию данных в переносимом формате; отозвать согласие, если обработка основана на согласии.",
            "Для реализации этих прав обращайтесь через бота @KovraVPN_bot или на support@kovravpn.com. Если к вам применяется GDPR, вы также вправе подать жалобу в местный надзорный орган по защите данных."
          ]
        },
        {
          "h": "11. Cookies",
          "p": [
            "Сайт использует только технические cookies, необходимые для работы интерфейса и поддержания сессии авторизации. Аналитические и рекламные cookies сторонних сервисов не используются."
          ]
        },
        {
          "h": "12. Безопасность",
          "p": [
            "Мы применяем разумные технические и организационные меры защиты ваших данных, включая шифрование данных при передаче, ограничение доступа и регулярное обновление инфраструктуры. Ни одна передача данных через интернет не является абсолютно безопасной, и мы не можем гарантировать абсолютную защиту."
          ]
        },
        {
          "h": "13. Дети",
          "p": [
            "Сервис не предназначен для детей. Мы сознательно не собираем данные лиц, не достигших возраста действительного согласия в их юрисдикции (16 лет в значительной части ЕС). Если вы полагаете, что ребёнок предоставил нам данные, свяжитесь с нами, и мы их удалим."
          ]
        },
        {
          "h": "14. Изменения в Политике",
          "p": [
            "Мы вправе обновлять настоящую Политику. Актуальная версия публикуется по адресу kovravpn.com/privacy с указанием даты редакции. Продолжение использования после публикации означает согласие."
          ]
        },
        {
          "h": "15. Контакты",
          "p": [
            "По вопросам обработки персональных данных обращайтесь к оператору данных через Telegram-бота @KovraVPN_bot или по электронной почте support@kovravpn.com."
          ]
        }
      ]
    }
  },
  "es": {
    "terms": {
      "title": "Términos del servicio",
      "updated": "Última actualización: 11 de junio de 2026",
      "related": "Documentos relacionados",
      "sections": [
        {
          "h": "1. Disposiciones generales",
          "p": [
            "Estos Términos del servicio (los «Términos») regulan el uso del servicio Kovra (el «Servicio»), disponible en kovravpn.com y a través del bot de Telegram @KovraVPN_bot, operado por Kovra Ltd. (el «Operador», «nosotros»).",
            "Al utilizar el Servicio —al registrarte, pagar o acceder a cualquier material— confirmas que has leído y aceptas íntegramente estos Términos. Si no estás de acuerdo, debes dejar de utilizar el Servicio."
          ]
        },
        {
          "h": "2. El Servicio",
          "p": [
            "Kovra es un servicio digital intangible que establece una conexión de red cifrada (VPN) y emite configuraciones de conexión para tus dispositivos. Está destinado a proteger la confidencialidad de tu tráfico y se ofrece como herramienta de seguridad de red.",
            "No conservamos registros de tu actividad de navegación, tus consultas DNS ni el contenido del tráfico transmitido. Solo se almacenan métricas técnicas agregadas necesarias para la facturación y la prevención de abusos."
          ]
        },
        {
          "h": "3. Elegibilidad y uso aceptable",
          "p": [
            "El Servicio se ofrece para uso personal y no comercial. Debes tener la edad necesaria para celebrar un contrato vinculante en tu jurisdicción.",
            "Está prohibido compartir tus credenciales o enlaces de suscripción con terceros, revender el acceso y utilizar el Servicio para operar una VPN comercial competidora.",
            "Eres el único responsable de cumplir la legislación que te sea aplicable. No debes utilizar el Servicio con fines ilícitos, para vulnerar los derechos de terceros ni para abusar de la infraestructura (incluidas conexiones automatizadas a gran escala o actividades que degraden el Servicio para otros usuarios)."
          ]
        },
        {
          "h": "4. Planes y pago",
          "p": [
            "El Servicio se ofrece mediante suscripciones de prepago. Los planes, plazos, precios y el número de dispositivos se muestran en el sitio web en el momento de la compra.",
            "El pago se acepta en criptomoneda a través de procesadores de pago externos. La suscripción se activa una vez confirmado el pago correspondiente en la cadena de bloques pertinente.",
            "Las transacciones con criptomonedas son irreversibles. Eres responsable de enviar el importe correcto en el activo correcto a la dirección indicada durante el pago."
          ]
        },
        {
          "h": "5. Reembolsos",
          "p": [
            "Dado que el Servicio es un servicio digital intangible pagado mediante transacciones irreversibles de criptomonedas, los pagos no son reembolsables, por regla general, una vez activada la suscripción.",
            "Solo se podrá considerar un reembolso cuando el Servicio no se haya prestado por causa imputable a nosotros, confirmada mediante una solicitud al soporte presentada dentro de los 14 días siguientes al pago. Los reembolsos aprobados se efectúan a la misma cartera y en el mismo activo utilizado para el pago, menos las comisiones de red.",
            "Recomendamos adquirir primero el plazo mínimo disponible para comprobar la compatibilidad con tus dispositivos y tu red antes de contratar un período más largo."
          ]
        },
        {
          "h": "6. Calidad del Servicio",
          "p": [
            "Procuramos ofrecer una conexión estable y rápida, pero la calidad depende de factores ajenos a nuestro control: tu proveedor de Internet, tu equipo, las redes intermedias y las restricciones impuestas por operadores o autoridades en tu ubicación.",
            "El Servicio se presta «tal cual» y «según disponibilidad». No garantizamos un funcionamiento ininterrumpido o libre de errores, la compatibilidad con un dispositivo o software concreto, ni que el Servicio cumpla tus expectativas."
          ]
        },
        {
          "h": "7. Suspensión y resolución",
          "p": [
            "Podemos suspender o resolver el Servicio en caso de incumplimiento de estos Términos, cuando se detecte abuso o actividad fraudulenta, cuando lo exija una autoridad competente o un procesador de pagos, o cuando tu actividad genere un riesgo elevado para la infraestructura, otros usuarios o terceros.",
            "La resolución por incumplimiento no da derecho al reembolso de las cantidades ya pagadas."
          ]
        },
        {
          "h": "8. Uso razonable y prevención de abusos",
          "p": [
            "Empleamos medios automatizados para detectar abusos, incluido el análisis del volumen de tráfico, la frecuencia de conexión y la actividad de los dispositivos. Cuando se detecte una carga atípica, podremos limitar temporalmente la velocidad o suspender una conexión hasta que se resuelva la situación.",
            "Se considera carga atípica, en particular, el uso sostenido a la máxima velocidad, el tráfico P2P de gran volumen, los indicios de reventa y las conexiones automatizadas o de bots."
          ]
        },
        {
          "h": "9. Propiedad intelectual",
          "p": [
            "Todos los materiales del sitio web y del bot de Telegram están protegidos por la legislación de propiedad intelectual. No puedes copiarlos, distribuirlos, revenderlos ni utilizarlos de otro modo sin autorización del titular de los derechos."
          ]
        },
        {
          "h": "10. Limitación de responsabilidad",
          "p": [
            "En la máxima medida permitida por la ley, no somos responsables de daños indirectos o consecuentes, incluido el lucro cesante, ni de los actos u omisiones de terceros como los proveedores de Internet y los procesadores de pago.",
            "Nuestra responsabilidad total frente a ti se limita al importe que hayas pagado por el Servicio en los tres (3) meses anteriores al hecho que origine la reclamación."
          ]
        },
        {
          "h": "11. Programa de referidos",
          "p": [
            "Puedes invitar a otras personas mediante un enlace de referido. Por cada usuario invitado que realice una primera compra válida, recibirás la recompensa descrita en el sitio web. El número de referidos recompensados por cuenta puede estar limitado.",
            "El abuso del programa de referidos —cuentas falsas, invitaciones automatizadas o autorreferencia— anula las recompensas y puede conllevar la suspensión de la cuenta."
          ]
        },
        {
          "h": "12. Cambios en los Términos",
          "p": [
            "Podemos modificar estos Términos. La versión actualizada se publica en el sitio web con su fecha de revisión. El uso continuado del Servicio tras la publicación constituye la aceptación de la nueva versión."
          ]
        },
        {
          "h": "13. Ley aplicable y resolución de conflictos",
          "p": [
            "Estos Términos se rigen por la legislación de Seychelles. Cualquier conflicto que no pueda resolverse de forma amistosa se someterá a arbitraje vinculante o a los tribunales competentes de Seychelles, en la medida en que lo permita la normativa imperativa aplicable."
          ]
        },
        {
          "h": "14. Contacto",
          "p": [
            "Para cualquier consulta sobre el Servicio, contáctanos a través del bot de Telegram @KovraVPN_bot o por correo electrónico en support@kovravpn.com."
          ]
        }
      ]
    },
    "privacy": {
      "title": "Política de privacidad",
      "updated": "Última actualización: 11 de junio de 2026",
      "related": "Documentos relacionados",
      "sections": [
        {
          "h": "1. Disposiciones generales",
          "p": [
            "Esta Política de privacidad (la «Política») explica cómo el Operador de Kovra (Kovra Ltd., «nosotros», el responsable del tratamiento) recopila, utiliza y protege la información que facilitas al utilizar el Servicio en kovravpn.com y a través del bot de Telegram @KovraVPN_bot.",
            "Al utilizar el Servicio aceptas esta Política. Si no estás de acuerdo, debes dejar de utilizar el Servicio."
          ]
        },
        {
          "h": "2. Datos que recopilamos",
          "p": [
            "Solo recopilamos los datos necesarios para operar el Servicio:",
            "• un identificador de Telegram (ID de usuario, nombre de usuario, nombre) si te registras a través del bot de Telegram, o una dirección de correo electrónico si te registras a través del sitio web;",
            "• datos técnicos de conexión (la dirección IP de tu dispositivo en el momento del pago y al conectarte a un nodo, e información básica del cliente VPN);",
            "• metadatos de suscripción y pago (plan, plazo, identificadores de transacción);",
            "• registros de servicio de las interacciones con el bot y con la interfaz del sitio web.",
            "No solicitamos ni almacenamos documentos de identidad, fotografías ni datos de tarjetas de pago."
          ]
        },
        {
          "h": "3. Registros de tráfico",
          "p": [
            "No conservamos registros de los sitios que visitas, del contenido de tu tráfico ni de tus consultas DNS. Solo almacenamos métricas técnicas agregadas (como el volumen de tráfico por cuenta y la hora de la última conexión) necesarias para la facturación y la prevención de abusos."
          ]
        },
        {
          "h": "4. Cómo utilizamos tus datos",
          "p": [
            "Utilizamos la información únicamente para: prestar el Servicio contratado (emisión de configuraciones, activación de dispositivos, gestión de suscripciones); identificarte cuando contactas con el soporte; procesar pagos a través de nuestros procesadores de pago; proteger el Servicio frente al fraude y el abuso; y enviarte notificaciones sobre tu cuenta y el Servicio."
          ]
        },
        {
          "h": "5. Bases jurídicas del tratamiento",
          "p": [
            "Cuando se aplica el RGPD, tratamos tus datos sobre las siguientes bases: la ejecución de nuestro contrato contigo (la prestación del Servicio); nuestros intereses legítimos (seguridad, prevención del fraude y mejora del Servicio); el cumplimiento de obligaciones legales; y tu consentimiento, cuando sea necesario."
          ]
        },
        {
          "h": "6. Pagos con criptomonedas",
          "p": [
            "Los pagos son procesados por procesadores de pago de criptomonedas externos. No almacenamos credenciales de tarjetas ni de carteras. Ten en cuenta que las transacciones en la cadena de bloques son públicas por naturaleza y que los datos on-chain quedan fuera de nuestro control."
          ]
        },
        {
          "h": "7. Comunicación de datos",
          "p": [
            "No vendemos tus datos. Comunicamos los datos mínimos necesarios a los procesadores de pago para completar una transacción, a las autoridades cuando lo exige la ley mediante el procedimiento debido y, en los demás casos, solo con tu consentimiento explícito."
          ]
        },
        {
          "h": "8. Transferencias internacionales",
          "p": [
            "Kovra opera servidores en varios países. Tus datos pueden tratarse en países distintos del tuyo. Cuando es necesario, aplicamos garantías adecuadas para dichas transferencias, como cláusulas contractuales tipo o medidas equivalentes."
          ]
        },
        {
          "h": "9. Conservación de datos",
          "p": [
            "Conservamos tus datos solo durante el tiempo necesario para prestar el Servicio y un período razonable posterior para resolver conflictos y cumplir obligaciones legales. Tras eliminar tu cuenta, tus datos se eliminan en un plazo de 30 días, salvo los que estemos obligados a conservar por ley."
          ]
        },
        {
          "h": "10. Tus derechos",
          "p": [
            "Puedes, en cualquier momento: solicitar información sobre los datos asociados a tu cuenta; solicitar la rectificación o supresión de tus datos; limitar u oponerte a determinados tratamientos; solicitar una copia de tus datos en un formato portátil; y retirar el consentimiento cuando el tratamiento se base en él.",
            "Para ejercer estos derechos, contáctanos a través del bot @KovraVPN_bot o en support@kovravpn.com. Si se te aplica el RGPD, también tienes derecho a presentar una reclamación ante tu autoridad de control de protección de datos."
          ]
        },
        {
          "h": "11. Cookies",
          "p": [
            "El sitio web utiliza únicamente cookies técnicas necesarias para la interfaz y para mantener tu sesión autenticada. No utilizamos cookies de analítica ni de publicidad de terceros."
          ]
        },
        {
          "h": "12. Seguridad",
          "p": [
            "Aplicamos medidas técnicas y organizativas razonables para proteger tus datos, incluido el cifrado de los datos en tránsito, controles de acceso y actualizaciones periódicas de la infraestructura. Ninguna transmisión por Internet es completamente segura y no podemos garantizar una seguridad absoluta."
          ]
        },
        {
          "h": "13. Menores",
          "p": [
            "El Servicio no está dirigido a menores. No recopilamos a sabiendas datos de personas que no tengan la edad necesaria para prestar un consentimiento válido en su jurisdicción (16 años en gran parte de la UE). Si crees que un menor nos ha facilitado datos, contáctanos y los eliminaremos."
          ]
        },
        {
          "h": "14. Cambios en esta Política",
          "p": [
            "Podemos actualizar esta Política. La versión vigente se publica en kovravpn.com/privacy con su fecha de revisión. El uso continuado tras la publicación constituye su aceptación."
          ]
        },
        {
          "h": "15. Contacto",
          "p": [
            "Para consultas sobre el tratamiento de tus datos personales, contacta con el responsable del tratamiento a través del bot de Telegram @KovraVPN_bot o por correo electrónico en support@kovravpn.com."
          ]
        }
      ]
    }
  },
  "de": {
    "terms": {
      "title": "Nutzungsbedingungen",
      "updated": "Zuletzt aktualisiert: 11. Juni 2026",
      "related": "Zugehörige Dokumente",
      "sections": [
        {
          "h": "1. Allgemeines",
          "p": [
            "Diese Nutzungsbedingungen (die „Bedingungen“) regeln die Nutzung des Dienstes Kovra (der „Dienst“), verfügbar unter kovravpn.com und über den Telegram-Bot @KovraVPN_bot, betrieben von Kovra Ltd. (der „Betreiber“, „wir“).",
            "Mit der Nutzung des Dienstes – durch Registrierung, Zahlung oder Zugriff auf Inhalte – bestätigen Sie, dass Sie diese Bedingungen vollständig gelesen haben und akzeptieren. Wenn Sie nicht einverstanden sind, müssen Sie die Nutzung des Dienstes einstellen."
          ]
        },
        {
          "h": "2. Der Dienst",
          "p": [
            "Kovra ist ein immaterieller digitaler Dienst, der eine verschlüsselte Netzwerkverbindung (VPN) herstellt und Verbindungskonfigurationen für Ihre Geräte bereitstellt. Er dient dem Schutz der Vertraulichkeit Ihres Datenverkehrs und wird als Werkzeug für Netzwerksicherheit bereitgestellt.",
            "Wir führen keine Protokolle über Ihre Surfaktivität, Ihre DNS-Anfragen oder den Inhalt des übertragenen Datenverkehrs. Es werden nur aggregierte technische Kennzahlen gespeichert, die für die Abrechnung und die Missbrauchsprävention erforderlich sind."
          ]
        },
        {
          "h": "3. Voraussetzungen und zulässige Nutzung",
          "p": [
            "Der Dienst wird für den persönlichen, nicht kommerziellen Gebrauch bereitgestellt. Sie müssen das in Ihrer Rechtsordnung erforderliche Alter haben, um einen verbindlichen Vertrag zu schließen.",
            "Die Weitergabe Ihrer Zugangsdaten oder Abonnement-Links an Dritte, der Weiterverkauf des Zugangs sowie die Nutzung des Dienstes zum Betrieb eines konkurrierenden kommerziellen VPN sind untersagt.",
            "Sie sind allein dafür verantwortlich, die für Sie geltenden Gesetze einzuhalten. Sie dürfen den Dienst nicht für rechtswidrige Zwecke, zur Verletzung der Rechte Dritter oder zum Missbrauch der Infrastruktur nutzen (einschließlich groß angelegter automatisierter Verbindungen oder Aktivitäten, die den Dienst für andere Nutzer beeinträchtigen)."
          ]
        },
        {
          "h": "4. Tarife und Zahlung",
          "p": [
            "Der Dienst wird als im Voraus bezahltes Abonnement angeboten. Tarife, Laufzeiten, Preise und die Anzahl der Geräte werden zum Zeitpunkt des Kaufs auf der Website angezeigt.",
            "Die Zahlung erfolgt in Kryptowährung über externe Zahlungsdienstleister. Ein Abonnement wird aktiviert, sobald die entsprechende Zahlung in der jeweiligen Blockchain bestätigt ist.",
            "Kryptowährungstransaktionen sind unwiderruflich. Sie sind dafür verantwortlich, den korrekten Betrag im korrekten Asset an die beim Bezahlvorgang angegebene Adresse zu senden."
          ]
        },
        {
          "h": "5. Erstattungen",
          "p": [
            "Da der Dienst ein immaterieller digitaler Dienst ist, der mit unwiderruflichen Kryptowährungstransaktionen bezahlt wird, sind Zahlungen nach Aktivierung eines Abonnements grundsätzlich nicht erstattungsfähig.",
            "Eine Erstattung kommt nur in Betracht, wenn der Dienst aus einem von uns zu vertretenden Grund nicht erbracht wurde, bestätigt durch eine innerhalb von 14 Tagen nach der Zahlung eingereichte Support-Anfrage. Genehmigte Erstattungen erfolgen an dieselbe Wallet und im selben Asset, mit dem bezahlt wurde, abzüglich etwaiger Netzwerkgebühren.",
            "Wir empfehlen, zunächst die kürzeste verfügbare Laufzeit zu erwerben, um die Kompatibilität mit Ihren Geräten und Ihrem Netzwerk zu prüfen, bevor Sie einen längeren Zeitraum buchen."
          ]
        },
        {
          "h": "6. Dienstqualität",
          "p": [
            "Wir bemühen uns um eine stabile und schnelle Verbindung, die Qualität hängt jedoch von Faktoren außerhalb unserer Kontrolle ab: Ihrem Internetanbieter, Ihrer Ausrüstung, zwischengeschalteten Netzen und Beschränkungen durch Betreiber oder Behörden an Ihrem Standort.",
            "Der Dienst wird „wie besehen“ und „nach Verfügbarkeit“ bereitgestellt. Wir gewährleisten weder einen unterbrechungs- oder fehlerfreien Betrieb noch die Kompatibilität mit einem bestimmten Gerät oder einer bestimmten Software oder dass der Dienst Ihren Erwartungen entspricht."
          ]
        },
        {
          "h": "7. Aussetzung und Beendigung",
          "p": [
            "Wir können den Dienst aussetzen oder beenden, wenn Sie gegen diese Bedingungen verstoßen, wenn Missbrauch oder betrügerische Aktivität festgestellt wird, wenn dies von einer zuständigen Behörde oder einem Zahlungsdienstleister verlangt wird oder wenn Ihre Aktivität ein erhöhtes Risiko für die Infrastruktur, andere Nutzer oder Dritte darstellt.",
            "Eine Beendigung wegen Verstoßes begründet keinen Anspruch auf Erstattung bereits gezahlter Beträge."
          ]
        },
        {
          "h": "8. Faire Nutzung und Missbrauchsprävention",
          "p": [
            "Wir setzen automatisierte Mittel zur Missbrauchserkennung ein, einschließlich der Analyse von Datenvolumen, Verbindungshäufigkeit und Geräteaktivität. Bei Feststellung einer untypischen Last können wir die Geschwindigkeit vorübergehend begrenzen oder eine Verbindung aussetzen, bis die Angelegenheit geklärt ist.",
            "Zu untypischer Last zählen insbesondere die dauerhafte Nutzung mit maximaler Geschwindigkeit, P2P-Verkehr in großem Umfang, Anzeichen von Weiterverkauf sowie automatisierte oder Bot-Verbindungen."
          ]
        },
        {
          "h": "9. Geistiges Eigentum",
          "p": [
            "Alle Inhalte auf der Website und im Telegram-Bot sind durch das Recht des geistigen Eigentums geschützt. Sie dürfen sie ohne Zustimmung des Rechteinhabers nicht kopieren, verbreiten, weiterverkaufen oder anderweitig nutzen."
          ]
        },
        {
          "h": "10. Haftungsbeschränkung",
          "p": [
            "Soweit gesetzlich zulässig, haften wir nicht für mittelbare oder Folgeschäden, einschließlich entgangenen Gewinns, oder für Handlungen oder Unterlassungen Dritter wie Internetanbieter und Zahlungsdienstleister.",
            "Unsere Gesamthaftung Ihnen gegenüber ist auf den Betrag begrenzt, den Sie in den drei (3) Monaten vor dem haftungsbegründenden Ereignis für den Dienst gezahlt haben."
          ]
        },
        {
          "h": "11. Empfehlungsprogramm",
          "p": [
            "Sie können andere über einen Empfehlungslink einladen. Für jeden eingeladenen Nutzer, der einen ersten qualifizierten Kauf tätigt, erhalten Sie die auf der Website beschriebene Prämie. Die Anzahl der prämierten Empfehlungen pro Konto kann begrenzt sein.",
            "Missbrauch des Empfehlungsprogramms – gefälschte Konten, automatisierte Einladungen oder Selbstempfehlung – führt zum Verfall der Prämien und kann die Sperrung des Kontos nach sich ziehen."
          ]
        },
        {
          "h": "12. Änderungen dieser Bedingungen",
          "p": [
            "Wir können diese Bedingungen ändern. Die aktualisierte Fassung wird mit ihrem Revisionsdatum auf der Website veröffentlicht. Die fortgesetzte Nutzung des Dienstes nach der Veröffentlichung gilt als Annahme der neuen Fassung."
          ]
        },
        {
          "h": "13. Anwendbares Recht und Streitbeilegung",
          "p": [
            "Diese Bedingungen unterliegen dem Recht von Seychelles. Streitigkeiten, die nicht einvernehmlich beigelegt werden können, werden durch verbindliches Schiedsverfahren oder vor den zuständigen Gerichten von Seychelles beigelegt, soweit zwingendes anwendbares Recht dies zulässt."
          ]
        },
        {
          "h": "14. Kontakt",
          "p": [
            "Bei Fragen zum Dienst kontaktieren Sie uns über den Telegram-Bot @KovraVPN_bot oder per E-Mail unter support@kovravpn.com."
          ]
        }
      ]
    },
    "privacy": {
      "title": "Datenschutzerklärung",
      "updated": "Zuletzt aktualisiert: 11. Juni 2026",
      "related": "Zugehörige Dokumente",
      "sections": [
        {
          "h": "1. Allgemeines",
          "p": [
            "Diese Datenschutzerklärung (die „Erklärung“) beschreibt, wie der Betreiber von Kovra (Kovra Ltd., „wir“, der Verantwortliche) Informationen erhebt, verwendet und schützt, die Sie bei der Nutzung des Dienstes unter kovravpn.com und über den Telegram-Bot @KovraVPN_bot bereitstellen.",
            "Mit der Nutzung des Dienstes akzeptieren Sie diese Erklärung. Wenn Sie nicht einverstanden sind, müssen Sie die Nutzung des Dienstes einstellen."
          ]
        },
        {
          "h": "2. Welche Daten wir erheben",
          "p": [
            "Wir erheben nur die für den Betrieb des Dienstes erforderlichen Daten:",
            "• eine Telegram-Kennung (Benutzer-ID, Benutzername, Name), wenn Sie sich über den Telegram-Bot registrieren, oder eine E-Mail-Adresse, wenn Sie sich über die Website registrieren;",
            "• technische Verbindungsdaten (die IP-Adresse Ihres Geräts zum Zeitpunkt der Zahlung und beim Verbinden mit einem Knoten sowie grundlegende Informationen zum VPN-Client);",
            "• Abonnement- und Zahlungsmetadaten (Tarif, Laufzeit, Transaktionskennungen);",
            "• Dienstprotokolle der Interaktionen mit dem Bot und der Website-Oberfläche.",
            "Wir fordern und speichern keine Ausweisdokumente, Fotos oder Zahlungskartendaten."
          ]
        },
        {
          "h": "3. Verkehrsprotokolle",
          "p": [
            "Wir führen keine Protokolle über die von Ihnen besuchten Websites, den Inhalt Ihres Datenverkehrs oder Ihre DNS-Anfragen. Wir speichern nur aggregierte technische Kennzahlen (z. B. Datenvolumen pro Konto und Zeitpunkt der letzten Verbindung), die für die Abrechnung und die Missbrauchsprävention erforderlich sind."
          ]
        },
        {
          "h": "4. Wie wir Ihre Daten verwenden",
          "p": [
            "Wir verwenden die Informationen ausschließlich, um: den von Ihnen bestellten Dienst bereitzustellen (Ausstellung von Konfigurationen, Aktivierung von Geräten, Verwaltung von Abonnements); Sie bei der Kontaktaufnahme mit dem Support zu identifizieren; Zahlungen über unsere Zahlungsdienstleister abzuwickeln; den Dienst vor Betrug und Missbrauch zu schützen; und Ihnen Benachrichtigungen zu Ihrem Konto und zum Dienst zu senden."
          ]
        },
        {
          "h": "5. Rechtsgrundlagen der Verarbeitung",
          "p": [
            "Soweit die DSGVO Anwendung findet, verarbeiten wir Ihre Daten auf folgenden Grundlagen: Erfüllung unseres Vertrags mit Ihnen (Bereitstellung des Dienstes); unsere berechtigten Interessen (Sicherheit, Betrugsprävention und Verbesserung des Dienstes); Erfüllung rechtlicher Verpflichtungen; und Ihre Einwilligung, soweit erforderlich."
          ]
        },
        {
          "h": "6. Zahlungen mit Kryptowährung",
          "p": [
            "Zahlungen werden von externen Kryptowährungs-Zahlungsdienstleistern abgewickelt. Wir speichern keine Karten- oder Wallet-Zugangsdaten. Beachten Sie, dass Blockchain-Transaktionen ihrer Natur nach öffentlich sind und On-Chain-Daten außerhalb unserer Kontrolle liegen."
          ]
        },
        {
          "h": "7. Weitergabe von Daten",
          "p": [
            "Wir verkaufen Ihre Daten nicht. Wir geben die mindestens erforderlichen Daten an Zahlungsdienstleister weiter, um eine Transaktion abzuschließen, an Behörden, soweit dies gesetzlich im ordnungsgemäßen Verfahren erforderlich ist, und im Übrigen nur mit Ihrer ausdrücklichen Einwilligung."
          ]
        },
        {
          "h": "8. Internationale Datenübermittlungen",
          "p": [
            "Kovra betreibt Server in mehreren Ländern. Ihre Daten können in anderen Ländern als Ihrem eigenen verarbeitet werden. Soweit erforderlich, stützen wir uns für solche Übermittlungen auf geeignete Garantien wie Standardvertragsklauseln oder gleichwertige Maßnahmen."
          ]
        },
        {
          "h": "9. Speicherdauer",
          "p": [
            "Wir speichern Ihre Daten nur so lange, wie es für die Bereitstellung des Dienstes erforderlich ist, sowie für einen angemessenen Zeitraum danach zur Beilegung von Streitigkeiten und zur Erfüllung rechtlicher Pflichten. Nach Löschung Ihres Kontos werden Ihre Daten innerhalb von 30 Tagen gelöscht, mit Ausnahme von Daten, die wir gesetzlich aufbewahren müssen."
          ]
        },
        {
          "h": "10. Ihre Rechte",
          "p": [
            "Sie können jederzeit: Auskunft über die mit Ihrem Konto verbundenen Daten verlangen; die Berichtigung oder Löschung Ihrer Daten verlangen; bestimmte Verarbeitungen einschränken oder ihnen widersprechen; eine Kopie Ihrer Daten in einem übertragbaren Format anfordern; und eine Einwilligung widerrufen, soweit die Verarbeitung auf ihr beruht.",
            "Um diese Rechte auszuüben, kontaktieren Sie uns über den Bot @KovraVPN_bot oder unter support@kovravpn.com. Wenn die DSGVO auf Sie Anwendung findet, haben Sie zudem das Recht, eine Beschwerde bei Ihrer Datenschutzaufsichtsbehörde einzureichen."
          ]
        },
        {
          "h": "11. Cookies",
          "p": [
            "Die Website verwendet nur technische Cookies, die für die Oberfläche und zur Aufrechterhaltung Ihrer authentifizierten Sitzung erforderlich sind. Wir verwenden keine Analyse- oder Werbe-Cookies Dritter."
          ]
        },
        {
          "h": "12. Sicherheit",
          "p": [
            "Wir treffen angemessene technische und organisatorische Maßnahmen zum Schutz Ihrer Daten, einschließlich der Verschlüsselung von Daten während der Übertragung, Zugriffskontrollen und regelmäßiger Aktualisierungen der Infrastruktur. Keine Übertragung über das Internet ist vollständig sicher, und wir können keine absolute Sicherheit garantieren."
          ]
        },
        {
          "h": "13. Kinder",
          "p": [
            "Der Dienst richtet sich nicht an Kinder. Wir erheben nicht wissentlich Daten von Personen, die das für eine wirksame Einwilligung in ihrer Rechtsordnung erforderliche Alter (16 Jahre in weiten Teilen der EU) nicht erreicht haben. Wenn Sie glauben, dass ein Kind uns Daten übermittelt hat, kontaktieren Sie uns, und wir werden sie löschen."
          ]
        },
        {
          "h": "14. Änderungen dieser Erklärung",
          "p": [
            "Wir können diese Erklärung aktualisieren. Die aktuelle Fassung wird unter kovravpn.com/privacy mit ihrem Revisionsdatum veröffentlicht. Die fortgesetzte Nutzung nach der Veröffentlichung gilt als Annahme."
          ]
        },
        {
          "h": "15. Kontakt",
          "p": [
            "Bei Fragen zur Verarbeitung Ihrer personenbezogenen Daten kontaktieren Sie den Verantwortlichen über den Telegram-Bot @KovraVPN_bot oder per E-Mail unter support@kovravpn.com."
          ]
        }
      ]
    }
  },
  "fr": {
    "terms": {
      "title": "Conditions d'utilisation",
      "updated": "Dernière mise à jour : 11 juin 2026",
      "related": "Documents associés",
      "sections": [
        {
          "h": "1. Dispositions générales",
          "p": [
            "Les présentes Conditions d'utilisation (les « Conditions ») régissent l'utilisation du service Kovra (le « Service »), accessible sur kovravpn.com et via le bot Telegram @KovraVPN_bot, exploité par Kovra Ltd. (l'« Opérateur », « nous »).",
            "En utilisant le Service — en vous inscrivant, en payant ou en accédant à un contenu — vous confirmez avoir lu et accepté intégralement les présentes Conditions. Si vous n'êtes pas d'accord, vous devez cesser d'utiliser le Service."
          ]
        },
        {
          "h": "2. Le Service",
          "p": [
            "Kovra est un service numérique immatériel qui établit une connexion réseau chiffrée (VPN) et émet des configurations de connexion pour vos appareils. Il vise à protéger la confidentialité de votre trafic et est fourni comme un outil de sécurité réseau.",
            "Nous ne conservons aucun journal de votre activité de navigation, de vos requêtes DNS ni du contenu du trafic transmis. Seules des métriques techniques agrégées, nécessaires à la facturation et à la prévention des abus, sont conservées."
          ]
        },
        {
          "h": "3. Conditions d'éligibilité et usage acceptable",
          "p": [
            "Le Service est fourni pour un usage personnel et non commercial. Vous devez avoir l'âge requis pour conclure un contrat contraignant dans votre juridiction.",
            "Le partage de vos identifiants ou de vos liens d'abonnement avec des tiers, la revente de l'accès et l'utilisation du Service pour exploiter un VPN commercial concurrent sont interdits.",
            "Vous êtes seul responsable du respect des lois qui vous sont applicables. Vous ne devez pas utiliser le Service à des fins illicites, pour porter atteinte aux droits de tiers ou pour abuser de l'infrastructure (y compris des connexions automatisées à grande échelle ou des activités qui dégradent le Service pour les autres utilisateurs)."
          ]
        },
        {
          "h": "4. Offres et paiement",
          "p": [
            "Le Service est proposé sous forme d'abonnements prépayés. Les offres, durées, prix et le nombre d'appareils sont indiqués sur le site web au moment de l'achat.",
            "Le paiement est accepté en cryptomonnaie via des prestataires de paiement tiers. Un abonnement est activé une fois le paiement correspondant confirmé sur la blockchain concernée.",
            "Les transactions en cryptomonnaie sont irréversibles. Vous êtes responsable de l'envoi du montant correct dans l'actif correct à l'adresse indiquée lors du paiement."
          ]
        },
        {
          "h": "5. Remboursements",
          "p": [
            "Le Service étant un service numérique immatériel payé au moyen de transactions en cryptomonnaie irréversibles, les paiements ne sont, en règle générale, pas remboursables une fois l'abonnement activé.",
            "Un remboursement ne peut être envisagé que si le Service n'a pas été fourni en raison d'une faute de notre part, confirmée par une demande au support soumise dans les 14 jours suivant le paiement. Les remboursements approuvés sont effectués vers le même portefeuille et dans le même actif que celui utilisé pour le paiement, déduction faite des frais de réseau.",
            "Nous recommandons d'acheter d'abord la durée minimale disponible afin de vérifier la compatibilité avec vos appareils et votre réseau avant de souscrire une période plus longue."
          ]
        },
        {
          "h": "6. Qualité du Service",
          "p": [
            "Nous nous efforçons d'assurer une connexion stable et rapide, mais la qualité dépend de facteurs indépendants de notre volonté : votre fournisseur d'accès, votre équipement, les réseaux intermédiaires et les restrictions imposées par les opérateurs ou les autorités de votre localité.",
            "Le Service est fourni « en l'état » et « selon disponibilité ». Nous ne garantissons ni un fonctionnement ininterrompu ou sans erreur, ni la compatibilité avec un appareil ou un logiciel particulier, ni que le Service réponde à vos attentes."
          ]
        },
        {
          "h": "7. Suspension et résiliation",
          "p": [
            "Nous pouvons suspendre ou résilier le Service en cas de violation des présentes Conditions, lorsqu'un abus ou une activité frauduleuse est détecté, lorsque la loi ou un prestataire de paiement l'exige, ou lorsque votre activité crée un risque accru pour l'infrastructure, les autres utilisateurs ou des tiers.",
            "La résiliation pour violation n'ouvre pas droit au remboursement des sommes déjà versées."
          ]
        },
        {
          "h": "8. Usage raisonnable et prévention des abus",
          "p": [
            "Nous utilisons des moyens automatisés pour détecter les abus, y compris l'analyse du volume de trafic, de la fréquence des connexions et de l'activité des appareils. En cas de charge atypique, nous pouvons limiter temporairement la vitesse ou suspendre une connexion jusqu'à la résolution de la situation.",
            "Constituent notamment une charge atypique l'utilisation soutenue à la vitesse maximale, le trafic P2P de grand volume, les indices de revente ainsi que les connexions automatisées ou par bots."
          ]
        },
        {
          "h": "9. Propriété intellectuelle",
          "p": [
            "Tous les contenus du site web et du bot Telegram sont protégés par le droit de la propriété intellectuelle. Vous ne pouvez pas les copier, les distribuer, les revendre ou les utiliser autrement sans l'autorisation du titulaire des droits."
          ]
        },
        {
          "h": "10. Limitation de responsabilité",
          "p": [
            "Dans la mesure maximale permise par la loi, nous ne sommes pas responsables des dommages indirects ou consécutifs, y compris le manque à gagner, ni des actes ou omissions de tiers tels que les fournisseurs d'accès et les prestataires de paiement.",
            "Notre responsabilité globale envers vous est limitée au montant que vous avez payé pour le Service au cours des trois (3) mois précédant le fait générateur de la réclamation."
          ]
        },
        {
          "h": "11. Programme de parrainage",
          "p": [
            "Vous pouvez inviter d'autres personnes au moyen d'un lien de parrainage. Pour chaque utilisateur invité qui effectue un premier achat éligible, vous recevez la récompense décrite sur le site web. Le nombre de parrainages récompensés par compte peut être limité.",
            "L'abus du programme de parrainage — faux comptes, invitations automatisées ou auto-parrainage — annule les récompenses et peut entraîner la suspension du compte."
          ]
        },
        {
          "h": "12. Modification des Conditions",
          "p": [
            "Nous pouvons modifier les présentes Conditions. La version mise à jour est publiée sur le site web avec sa date de révision. La poursuite de l'utilisation du Service après la publication vaut acceptation de la nouvelle version."
          ]
        },
        {
          "h": "13. Droit applicable et règlement des litiges",
          "p": [
            "Les présentes Conditions sont régies par le droit de Seychelles. Tout litige ne pouvant être résolu à l'amiable sera tranché par arbitrage contraignant ou par les tribunaux compétents de Seychelles, dans la mesure permise par les dispositions impératives applicables."
          ]
        },
        {
          "h": "14. Contact",
          "p": [
            "Pour toute question relative au Service, contactez-nous via le bot Telegram @KovraVPN_bot ou par e-mail à support@kovravpn.com."
          ]
        }
      ]
    },
    "privacy": {
      "title": "Politique de confidentialité",
      "updated": "Dernière mise à jour : 11 juin 2026",
      "related": "Documents associés",
      "sections": [
        {
          "h": "1. Dispositions générales",
          "p": [
            "La présente Politique de confidentialité (la « Politique ») explique comment l'Opérateur de Kovra (Kovra Ltd., « nous », le responsable du traitement) collecte, utilise et protège les informations que vous fournissez lors de l'utilisation du Service sur kovravpn.com et via le bot Telegram @KovraVPN_bot.",
            "En utilisant le Service, vous acceptez la présente Politique. Si vous n'êtes pas d'accord, vous devez cesser d'utiliser le Service."
          ]
        },
        {
          "h": "2. Données que nous collectons",
          "p": [
            "Nous ne collectons que les données nécessaires au fonctionnement du Service :",
            "• un identifiant Telegram (ID utilisateur, nom d'utilisateur, nom) si vous vous inscrivez via le bot Telegram, ou une adresse e-mail si vous vous inscrivez via le site web ;",
            "• des données techniques de connexion (l'adresse IP de votre appareil au moment du paiement et lors de la connexion à un nœud, ainsi que des informations de base sur le client VPN) ;",
            "• des métadonnées d'abonnement et de paiement (offre, durée, identifiants de transaction) ;",
            "• des journaux de service des interactions avec le bot et l'interface du site web.",
            "Nous ne demandons ni ne conservons de pièces d'identité, de photographies ou de données de carte de paiement."
          ]
        },
        {
          "h": "3. Journaux de trafic",
          "p": [
            "Nous ne conservons aucun journal des sites que vous visitez, du contenu de votre trafic ni de vos requêtes DNS. Nous ne conservons que des métriques techniques agrégées (telles que le volume de trafic par compte et l'heure de la dernière connexion) nécessaires à la facturation et à la prévention des abus."
          ]
        },
        {
          "h": "4. Comment nous utilisons vos données",
          "p": [
            "Nous utilisons les informations uniquement pour : fournir le Service commandé (émission de configurations, activation des appareils, gestion des abonnements) ; vous identifier lorsque vous contactez le support ; traiter les paiements via nos prestataires de paiement ; protéger le Service contre la fraude et les abus ; et vous envoyer des notifications concernant votre compte et le Service."
          ]
        },
        {
          "h": "5. Bases légales du traitement",
          "p": [
            "Lorsque le RGPD s'applique, nous traitons vos données sur les bases suivantes : l'exécution de notre contrat avec vous (la fourniture du Service) ; nos intérêts légitimes (sécurité, prévention de la fraude et amélioration du Service) ; le respect d'obligations légales ; et votre consentement, lorsqu'il est requis."
          ]
        },
        {
          "h": "6. Paiements en cryptomonnaie",
          "p": [
            "Les paiements sont traités par des prestataires de paiement en cryptomonnaie tiers. Nous ne conservons aucune donnée de carte ou de portefeuille. Notez que les transactions sur la blockchain sont par nature publiques et que les données on-chain échappent à notre contrôle."
          ]
        },
        {
          "h": "7. Partage des données",
          "p": [
            "Nous ne vendons pas vos données. Nous communiquons le minimum de données nécessaire aux prestataires de paiement pour réaliser une transaction, aux autorités lorsque la loi l'exige selon la procédure appropriée et, à défaut, uniquement avec votre consentement explicite."
          ]
        },
        {
          "h": "8. Transferts internationaux",
          "p": [
            "Kovra exploite des serveurs dans plusieurs pays. Vos données peuvent être traitées dans des pays autres que le vôtre. Lorsque cela est nécessaire, nous nous appuyons sur des garanties appropriées pour ces transferts, telles que des clauses contractuelles types ou des mesures équivalentes."
          ]
        },
        {
          "h": "9. Conservation des données",
          "p": [
            "Nous ne conservons vos données que le temps nécessaire à la fourniture du Service et pendant une période raisonnable par la suite pour résoudre les litiges et respecter les obligations légales. Après la suppression de votre compte, vos données sont supprimées sous 30 jours, à l'exception des données que nous sommes tenus de conserver par la loi."
          ]
        },
        {
          "h": "10. Vos droits",
          "p": [
            "Vous pouvez à tout moment : demander des informations sur les données associées à votre compte ; demander la rectification ou la suppression de vos données ; limiter certains traitements ou vous y opposer ; demander une copie de vos données dans un format portable ; et retirer votre consentement lorsque le traitement repose sur celui-ci.",
            "Pour exercer ces droits, contactez-nous via le bot @KovraVPN_bot ou à support@kovravpn.com. Si le RGPD s'applique à vous, vous avez également le droit d'introduire une réclamation auprès de votre autorité de contrôle de la protection des données."
          ]
        },
        {
          "h": "11. Cookies",
          "p": [
            "Le site web utilise uniquement des cookies techniques nécessaires à l'interface et au maintien de votre session authentifiée. Nous n'utilisons pas de cookies d'analyse ou de publicité tiers."
          ]
        },
        {
          "h": "12. Sécurité",
          "p": [
            "Nous appliquons des mesures techniques et organisationnelles raisonnables pour protéger vos données, y compris le chiffrement des données en transit, des contrôles d'accès et des mises à jour régulières de l'infrastructure. Aucune transmission sur Internet n'est totalement sûre et nous ne pouvons garantir une sécurité absolue."
          ]
        },
        {
          "h": "13. Enfants",
          "p": [
            "Le Service ne s'adresse pas aux enfants. Nous ne collectons pas sciemment de données auprès de personnes n'ayant pas l'âge requis pour un consentement valable dans leur juridiction (16 ans dans une grande partie de l'UE). Si vous pensez qu'un enfant nous a fourni des données, contactez-nous et nous les supprimerons."
          ]
        },
        {
          "h": "14. Modifications de la présente Politique",
          "p": [
            "Nous pouvons mettre à jour la présente Politique. La version en vigueur est publiée sur kovravpn.com/privacy avec sa date de révision. La poursuite de l'utilisation après la publication vaut acceptation."
          ]
        },
        {
          "h": "15. Contact",
          "p": [
            "Pour toute question relative au traitement de vos données personnelles, contactez le responsable du traitement via le bot Telegram @KovraVPN_bot ou par e-mail à support@kovravpn.com."
          ]
        }
      ]
    }
  }
} as const;
