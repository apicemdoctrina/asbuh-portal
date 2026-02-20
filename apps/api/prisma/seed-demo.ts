/**
 * Демо-данные: сотрудники, секции, организации, банковские счета, доступы к системам.
 * Запуск: npm run db:seed-demo -w apps/api
 *
 * Скрипт идемпотентен — при повторном запуске пропускает уже существующие записи.
 *
 * Тестовые аккаунты после запуска:
 *   admin@asbuh.local    / Admin123!   (admin)
 *   manager@asbuh.local  / Demo12345!  (manager, участки 1+2)
 *   manager2@asbuh.local / Demo12345!  (manager, участки 2+3)
 *   buh1@asbuh.local     / Demo12345!  (accountant, участок 1)
 *   buh2@asbuh.local     / Demo12345!  (accountant, участок 2)
 *   buh3@asbuh.local     / Demo12345!  (accountant, участок 3)
 *   client@asbuh.local   / Demo12345!  (client, ООО «АльфаТрейд»)
 */
import { PrismaClient, SystemAccessType } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV === "production") {
  console.error("❌ Демо-данные нельзя загружать в production!");
  process.exit(1);
}

const prisma = new PrismaClient();

// ─── Секции ───────────────────────────────────────────────────────────────────

const SECTIONS = [
  { number: 1, name: "Северный" },
  { number: 2, name: "Южный" },
  { number: 3, name: "Центральный" },
];

// ─── Сотрудники ───────────────────────────────────────────────────────────────

const DEMO_PASSWORD_HASH = await bcrypt.hash("Demo12345!", 12);

type DemoUser = {
  email: string;
  firstName: string;
  lastName: string;
  role: "manager" | "accountant" | "client";
  phone?: string;
};

const STAFF_USERS: DemoUser[] = [
  {
    email: "manager@asbuh.local",
    firstName: "Ольга",
    lastName: "Смирнова",
    role: "manager",
    phone: "+7 (495) 111-22-33",
  },
  {
    email: "manager2@asbuh.local",
    firstName: "Артём",
    lastName: "Козлов",
    role: "manager",
    phone: "+7 (495) 111-22-44",
  },
  {
    email: "buh1@asbuh.local",
    firstName: "Анна",
    lastName: "Белова",
    role: "accountant",
    phone: "+7 (916) 100-10-01",
  },
  {
    email: "buh2@asbuh.local",
    firstName: "Дмитрий",
    lastName: "Фёдоров",
    role: "accountant",
    phone: "+7 (916) 200-20-02",
  },
  {
    email: "buh3@asbuh.local",
    firstName: "Наталья",
    lastName: "Орлова",
    role: "accountant",
    phone: "+7 (916) 300-30-03",
  },
  {
    email: "client@asbuh.local",
    firstName: "Иван",
    lastName: "Петров",
    role: "client",
    phone: "+7 (903) 999-88-77",
  },
];

// ─── Организации ──────────────────────────────────────────────────────────────

type OrgSeed = Parameters<typeof prisma.organization.create>[0]["data"];

function buildOrgs(sectionIds: string[]): OrgSeed[] {
  const [s1, s2, s3] = sectionIds;

  return [
    // ── Полностью заполненные (index 0–4) ──
    {
      name: 'ООО "АльфаТрейд"',
      form: "OOO",
      inn: "7701234501",
      ogrn: "1027700001001",
      kpp: "770101001",
      sectionId: s1,
      status: "active",
      taxSystems: ["USN6"],
      employeeCount: 12,
      hasCashRegister: true,
      legalAddress: "г. Москва, ул. Ленина, д. 10, оф. 201",
      digitalSignature: "US",
      digitalSignatureExpiry: new Date("2026-12-31"),
      reportingChannel: "KONTUR",
      serviceType: "FULL",
      monthlyPayment: 12000,
      paymentDestination: "р/с 40702810001234567890 в Сбербанке",
      checkingAccount: "40702810001234567890",
      bik: "044525225",
      correspondentAccount: "30101810400000000225",
      requisitesBank: "ПАО Сбербанк",
    },
    {
      name: "ИП Петрова Наталья Сергеевна",
      form: "IP",
      inn: "503412345678",
      ogrn: "314502736000001",
      sectionId: s2,
      status: "active",
      taxSystems: ["PSN"],
      employeeCount: 3,
      legalAddress: "г. Подольск, ул. Садовая, д. 5",
      digitalSignature: "CLIENT",
      digitalSignatureExpiry: new Date("2026-09-01"),
      reportingChannel: "SBIS",
      serviceType: "MINIMAL",
      monthlyPayment: 4500,
      paymentDestination: "р/с 40802810500000000001 в Тинькофф",
      checkingAccount: "40802810500000000001",
      bik: "044525974",
      correspondentAccount: "30101810145250000974",
      requisitesBank: "АО Тинькофф Банк",
    },
    {
      name: 'ООО "БетаСервис"',
      form: "OOO",
      inn: "5027109812",
      ogrn: "1025006182001",
      kpp: "502701001",
      sectionId: s3,
      status: "active",
      taxSystems: ["OSNO"],
      employeeCount: 45,
      hasCashRegister: false,
      legalAddress: "г. Балашиха, пр-т Энтузиастов, д. 2",
      digitalSignature: "US",
      digitalSignatureExpiry: new Date("2027-03-15"),
      reportingChannel: "ASTRAL",
      serviceType: "HR",
      monthlyPayment: 18000,
      paymentDestination: "р/с 40702810200000000002 в ВТБ",
      checkingAccount: "40702810200000000002",
      bik: "044525187",
      correspondentAccount: "30101810700000000187",
      requisitesBank: "Банк ВТБ (ПАО)",
    },
    {
      name: 'АО "ГаммаИнвест"',
      form: "AO",
      inn: "7714567890",
      ogrn: "1037714900001",
      kpp: "771401001",
      sectionId: s1,
      status: "active",
      taxSystems: ["OSNO", "USN_NDS22"],
      employeeCount: 120,
      legalAddress: "г. Москва, Кутузовский пр-т, д. 3, стр. 1",
      digitalSignature: "US",
      digitalSignatureExpiry: new Date("2026-06-30"),
      reportingChannel: "KONTUR",
      serviceType: "FULL",
      monthlyPayment: 35000,
      paymentDestination: "р/с 40702810300000000003 в Альфа-Банке",
      checkingAccount: "40702810300000000003",
      bik: "044525593",
      correspondentAccount: "30101810200000000593",
      requisitesBank: "АО «Альфа-Банк»",
    },
    {
      name: "ИП Сидоров Алексей Владимирович",
      form: "IP",
      inn: "771812345601",
      ogrn: "318774600000001",
      sectionId: s2,
      status: "active",
      taxSystems: ["USN15"],
      employeeCount: 7,
      legalAddress: "г. Москва, ул. Профсоюзная, д. 40, кв. 15",
      digitalSignature: "CLIENT",
      digitalSignatureExpiry: new Date("2026-11-20"),
      reportingChannel: "SBIS",
      serviceType: "REPORTING",
      monthlyPayment: 6000,
      paymentDestination: "р/с 40802810100000000005 в Сбербанке",
      checkingAccount: "40802810100000000005",
      bik: "044525225",
      correspondentAccount: "30101810400000000225",
      requisitesBank: "ПАО Сбербанк",
    },

    // ── Хорошо заполненные (index 5–11) ──
    {
      name: 'ООО "ДельтаГрупп"',
      form: "OOO",
      inn: "6658901234",
      ogrn: "1046602985001",
      kpp: "665801001",
      sectionId: s3,
      status: "active",
      taxSystems: ["USN6"],
      employeeCount: 30,
      legalAddress: "г. Екатеринбург, ул. Малышева, д. 51",
      digitalSignature: "US",
      reportingChannel: "KONTUR",
      serviceType: "FULL",
      monthlyPayment: 22000,
      paymentDestination: "р/с 40702810400000000006 в Уралсибе",
      checkingAccount: "40702810400000000006",
      bik: "046577795",
      correspondentAccount: null,
      requisitesBank: "ПАО «БАНК УРАЛСИБ»",
    },
    {
      name: 'ООО "ЭпсилонТех"',
      form: "OOO",
      inn: "7728345671",
      ogrn: "1047728050001",
      sectionId: s1,
      status: "active",
      taxSystems: ["OSNO"],
      employeeCount: 55,
      legalAddress: "г. Москва, ул. Новослободская, д. 73",
      digitalSignature: "NONE",
      reportingChannel: "SBIS",
      serviceType: "PARTIAL",
      monthlyPayment: 9000,
      checkingAccount: "40702810500000000007",
      bik: "044525974",
      correspondentAccount: "30101810145250000974",
      requisitesBank: "АО Тинькофф Банк",
    },
    {
      name: "ИП Козлова Марина Дмитриевна",
      form: "IP",
      inn: "771901234567",
      ogrn: "319774600000008",
      sectionId: s2,
      status: "active",
      taxSystems: ["USN6"],
      employeeCount: 2,
      legalAddress: "г. Москва, ул. Трёхгорный вал, д. 12, кв. 3",
      digitalSignature: "CLIENT",
      reportingChannel: "KONTUR",
      serviceType: "MINIMAL",
      monthlyPayment: 3800,
      checkingAccount: "40802810600000000008",
      bik: "044525225",
      requisitesBank: "ПАО Сбербанк",
    },
    {
      name: 'ООО "ЗетаПром"',
      form: "OOO",
      inn: "5047234519",
      ogrn: "1045006900001",
      kpp: "504701001",
      sectionId: s3,
      status: "active",
      taxSystems: ["USN15", "OSNO"],
      employeeCount: 18,
      legalAddress: "г. Люберцы, ул. Юбилейная, д. 7",
      digitalSignature: "US",
      reportingChannel: "ASTRAL",
      serviceType: "HR_REPORTING",
      monthlyPayment: 14500,
      checkingAccount: "40702810700000000009",
      bik: "044525187",
      requisitesBank: "Банк ВТБ (ПАО)",
    },
    {
      name: 'ООО "ЭтаМедиа"',
      form: "OOO",
      inn: "7716890123",
      ogrn: "1057716900001",
      kpp: "771601001",
      sectionId: s1,
      status: "active",
      taxSystems: ["USN6"],
      employeeCount: 8,
      legalAddress: "г. Москва, Дмитровское шоссе, д. 9",
      reportingChannel: "KONTUR",
      serviceType: "FULL",
      monthlyPayment: 28000,
      checkingAccount: "40702810800000000010",
      bik: "044525593",
      requisitesBank: "АО «Альфа-Банк»",
    },
    {
      name: 'НКО "Тэта Фонд"',
      form: "NKO",
      inn: "7703456782",
      ogrn: "1037703900001",
      kpp: "770301001",
      sectionId: s2,
      status: "active",
      taxSystems: ["OSNO"],
      employeeCount: 10,
      legalAddress: "г. Москва, ул. Пречистенка, д. 17",
      digitalSignature: "US",
      reportingChannel: "SBIS",
      serviceType: "REPORTING",
      monthlyPayment: 8500,
      checkingAccount: "40703810900000000011",
      bik: "044525225",
      requisitesBank: "ПАО Сбербанк",
    },
    {
      name: 'ООО "Иота Трейдинг"',
      form: "OOO",
      inn: "6670123458",
      ogrn: "1046670800001",
      kpp: "667001001",
      sectionId: s3,
      status: "new",
      taxSystems: ["USN6"],
      legalAddress: "г. Пермь, ул. Ленина, д. 58",
      digitalSignature: "CLIENT",
      reportingChannel: "KONTUR",
      serviceType: "MINIMAL",
      monthlyPayment: 5200,
      checkingAccount: "40702810000000000012",
      bik: "045773603",
      requisitesBank: "ПАО «Промсвязьбанк»",
    },

    // ── Средне заполненные (index 12–18) ──
    {
      name: 'ООО "КаппаСтрой"',
      form: "OOO",
      inn: "5032678904",
      ogrn: "1045032100001",
      sectionId: s1,
      status: "active",
      taxSystems: ["USN15"],
      legalAddress: "г. Химки, ул. Лавочкина, д. 4",
      digitalSignature: "NONE",
      serviceType: "FULL",
      monthlyPayment: 16000,
    },
    {
      name: "ИП Новиков Павел Иванович",
      form: "IP",
      inn: "504301234568",
      sectionId: s2,
      status: "active",
      taxSystems: ["PSN"],
      legalAddress: "г. Одинцово, ул. Можайское шоссе, д. 35",
      reportingChannel: "SBIS",
      monthlyPayment: 3200,
    },
    {
      name: 'ООО "ЛямбдаФуд"',
      form: "OOO",
      inn: "7743901235",
      ogrn: "1057743100001",
      sectionId: s3,
      status: "active",
      taxSystems: ["OSNO"],
      digitalSignature: "US",
      reportingChannel: "ASTRAL",
      serviceType: "HR",
      monthlyPayment: 19500,
      checkingAccount: "40702810200000000015",
    },
    {
      name: 'ООО "МюАвто"',
      form: "OOO",
      inn: "5047901236",
      ogrn: "1045047200001",
      sectionId: s1,
      status: "not_paying",
      taxSystems: ["USN6"],
      legalAddress: "г. Королёв, ул. Горького, д. 21",
      serviceType: "MINIMAL",
      monthlyPayment: 7000,
      debtAmount: 21000,
      importantComment: "Задолженность 3 месяца, работа приостановлена до оплаты",
    },
    {
      name: "ИП Орлова Светлана Александровна",
      form: "IP",
      inn: "773212345679",
      sectionId: s2,
      status: "active",
      taxSystems: ["USN6"],
      reportingChannel: "KONTUR",
      serviceType: "ZERO",
      monthlyPayment: 2000,
    },
    {
      name: 'ООО "НюМаркет"',
      form: "OOO",
      inn: "7723012347",
      sectionId: s3,
      status: "active",
      taxSystems: ["USN15"],
      legalAddress: "г. Москва, ул. Коровий вал, д. 7",
      digitalSignature: "CLIENT",
      monthlyPayment: 11000,
    },
    {
      name: 'АО "КсиГрупп"',
      form: "AO",
      inn: "7709123458",
      ogrn: "1027709300001",
      sectionId: s1,
      status: "liquidating",
      taxSystems: ["OSNO"],
      legalAddress: "г. Москва, 1-й Неопалимовский пер., д. 4",
      importantComment: "Идёт процедура ликвидации, отчётность подаётся в штатном режиме",
    },

    // ── Слабо заполненные (index 19–24) ──
    {
      name: 'ООО "ОмикронПлюс"',
      form: "OOO",
      inn: "6658123459",
      status: "new",
      taxSystems: [],
    },
    {
      name: "ИП Фёдоров Игорь Николаевич",
      form: "IP",
      status: "new",
      taxSystems: ["USN6"],
    },
    {
      name: 'ООО "ПиТранс"',
      form: "OOO",
      inn: "5027890125",
      status: "active",
      taxSystems: [],
      legalAddress: "г. Жуковский, ул. Туполева, д. 3",
    },
    {
      name: 'ООО "РоСервис"',
      status: "new",
      taxSystems: [],
    },
    {
      name: "ИП Смирнова Ольга Петровна",
      form: "IP",
      status: "active",
      taxSystems: [],
    },
    {
      name: 'ООО "СигмаКонсалт"',
      form: "OOO",
      inn: "7722345013",
      status: "active",
      taxSystems: ["USN6"],
      serviceType: "MINIMAL",
    },
  ];
}

// ─── Контакты ─────────────────────────────────────────────────────────────────

type ContactData = { contactPerson: string; phone: string; email?: string; telegram?: string };

const CONTACTS_BY_INDEX: Record<number, ContactData[]> = {
  0: [
    {
      contactPerson: "Иванов Сергей Михайлович",
      phone: "+7 (495) 123-45-67",
      email: "ivanov@alfatrade.ru",
      telegram: "@s_ivanov",
    },
  ],
  1: [{ contactPerson: "Петрова Наталья Сергеевна", phone: "+7 (917) 234-56-78" }],
  2: [
    {
      contactPerson: "Белов Андрей Геннадьевич",
      phone: "+7 (495) 345-67-89",
      email: "belov@betaservice.ru",
    },
    {
      contactPerson: "Ким Юлия (бухгалтер)",
      phone: "+7 (916) 456-78-90",
      telegram: "@yulia_kim",
    },
  ],
  3: [
    {
      contactPerson: "Громов Виктор Павлович",
      phone: "+7 (495) 567-89-01",
      email: "gromov@gammainvest.ru",
    },
  ],
  4: [{ contactPerson: "Сидоров Алексей Владимирович", phone: "+7 (903) 678-90-12" }],
  5: [
    {
      contactPerson: "Дёмина Анна Юрьевна",
      phone: "+7 (343) 678-90-12",
      email: "demina@deltagroupp.ru",
    },
  ],
  7: [
    {
      contactPerson: "Козлова Марина Дмитриевна",
      phone: "+7 (903) 789-01-23",
      telegram: "@kozlova_md",
    },
  ],
  9: [
    {
      contactPerson: "Медведев Роман Сергеевич",
      phone: "+7 (495) 222-33-44",
      email: "medvedev@etamedia.ru",
    },
  ],
  11: [{ contactPerson: "Поляков Дмитрий Александрович", phone: "+7 (342) 890-12-34" }],
  15: [{ contactPerson: "Новиков Павел Иванович", phone: "+7 (495) 777-88-99" }],
};

// ─── Банковские счета ─────────────────────────────────────────────────────────

type BankAccountData = { bankName: string; accountNumber?: string; comment?: string };

const BANK_ACCOUNTS_BY_INDEX: Record<number, BankAccountData[]> = {
  0: [
    { bankName: "ПАО Сбербанк", accountNumber: "40702810001234567890", comment: "Основной р/с" },
    {
      bankName: "АО «Альфа-Банк»",
      accountNumber: "40702810300000000090",
      comment: "Для расчётов с поставщиками",
    },
  ],
  1: [{ bankName: "АО Тинькофф Банк", accountNumber: "40802810500000000001" }],
  2: [
    { bankName: "Банк ВТБ (ПАО)", accountNumber: "40702810200000000002", comment: "Основной р/с" },
    {
      bankName: "ПАО Сбербанк",
      accountNumber: "40702810001111111111",
      comment: "Зарплатный проект",
    },
  ],
  3: [{ bankName: "АО «Альфа-Банк»", accountNumber: "40702810300000000003" }],
  4: [{ bankName: "ПАО Сбербанк", accountNumber: "40802810100000000005" }],
  5: [{ bankName: "ПАО «БАНК УРАЛСИБ»", accountNumber: "40702810400000000006" }],
  6: [{ bankName: "АО Тинькофф Банк", accountNumber: "40702810500000000007" }],
  8: [{ bankName: "Банк ВТБ (ПАО)", accountNumber: "40702810700000000009" }],
  10: [
    { bankName: "ПАО Сбербанк", accountNumber: "40703810900000000011", comment: "Целевой р/с НКО" },
  ],
};

// ─── Системные доступы ────────────────────────────────────────────────────────

type SystemAccessData = { systemType: SystemAccessType; name?: string; comment?: string };

const SYSTEM_ACCESSES_BY_INDEX: Record<number, SystemAccessData[]> = {
  0: [
    { systemType: "ONE_C", name: "1С:Бухгалтерия 3.0", comment: "Облако, 3 пользователя" },
    { systemType: "KASSA", name: "Касса Сбербанк", comment: "Торговая точка на Ленина 10" },
  ],
  1: [{ systemType: "ONE_C", name: "1С:ИП", comment: "Локальная версия" }],
  2: [
    { systemType: "ONE_C", name: "1С:Зарплата и управление персоналом", comment: "45 сотрудников" },
    { systemType: "KASSA", name: "Эвотор", comment: "3 кассы" },
    { systemType: "OTHER", name: "Контур.Экстерн", comment: "Электронная отчётность" },
  ],
  3: [
    { systemType: "ONE_C", name: "1С:Предприятие ERP", comment: "Серверная лицензия" },
    { systemType: "OTHER", name: "Диадок", comment: "ЭДО с контрагентами" },
  ],
  4: [{ systemType: "OTHER", name: "СБИС", comment: "Отчётность и ЭДО" }],
  5: [
    { systemType: "ONE_C", name: "1С:Бухгалтерия 3.0" },
    { systemType: "OTHER", name: "Контур.Фокус", comment: "Проверка контрагентов" },
  ],
  6: [{ systemType: "ONE_C", name: "1С:Бухгалтерия 3.0", comment: "Облако" }],
  8: [{ systemType: "ONE_C", name: "1С:ЗУП", comment: "18 сотрудников" }],
  9: [
    { systemType: "ONE_C", name: "1С:Бухгалтерия 3.0" },
    { systemType: "KASSA", name: "Атол", comment: "2 кассы" },
  ],
  11: [{ systemType: "OTHER", name: "СБИС", comment: "Отчётность" }],
};

// ─── Главная функция ──────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Начинаем посев демо-данных...\n");

  // 1. Секции
  console.log("── Секции ──");
  const sectionIds: string[] = [];
  for (const s of SECTIONS) {
    const section = await prisma.section.upsert({
      where: { number: s.number },
      update: {},
      create: s,
    });
    sectionIds.push(section.id);
    console.log(`  ✓ Участок #${s.number} "${s.name}"`);
  }

  // 2. Роли (нужны для назначения сотрудникам)
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  // 3. Сотрудники
  console.log("\n── Сотрудники ──");
  const staffIds: Record<string, string> = {};

  for (const u of STAFF_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      staffIds[u.email] = existing.id;
      console.log(`  — ${u.lastName} ${u.firstName} (уже существует)`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: DEMO_PASSWORD_HASH,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone ?? null,
      },
    });
    staffIds[u.email] = user.id;

    // Назначить роль
    const roleId = roleMap[u.role];
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }

    console.log(`  + ${u.lastName} ${u.firstName} <${u.email}> [${u.role}]`);
  }

  // 4. Членство в секциях
  console.log("\n── Членство в секциях ──");
  const sectionMemberships: Array<{ email: string; sectionIdx: number; role: string }> = [
    { email: "manager@asbuh.local", sectionIdx: 0, role: "manager" },
    { email: "manager@asbuh.local", sectionIdx: 1, role: "manager" },
    { email: "manager2@asbuh.local", sectionIdx: 1, role: "manager" },
    { email: "manager2@asbuh.local", sectionIdx: 2, role: "manager" },
    { email: "buh1@asbuh.local", sectionIdx: 0, role: "accountant" },
    { email: "buh2@asbuh.local", sectionIdx: 1, role: "accountant" },
    { email: "buh3@asbuh.local", sectionIdx: 2, role: "accountant" },
  ];

  for (const m of sectionMemberships) {
    const userId = staffIds[m.email];
    const sectionId = sectionIds[m.sectionIdx];
    if (!userId || !sectionId) continue;

    await prisma.sectionMember.upsert({
      where: { sectionId_userId: { sectionId, userId } },
      update: {},
      create: { sectionId, userId, role: m.role },
    });
    console.log(`  ✓ ${m.email} → участок #${m.sectionIdx + 1}`);
  }

  // 5. Организации
  console.log("\n── Организации ──");
  const orgData = buildOrgs(sectionIds);
  let orgCreated = 0;
  let orgSkipped = 0;
  const createdOrgs: { id: string; name: string; sectionId: string | null }[] = [];

  for (const data of orgData) {
    const existing = data.inn
      ? await prisma.organization.findUnique({ where: { inn: data.inn as string } })
      : await prisma.organization.findFirst({ where: { name: data.name as string } });

    if (existing) {
      orgSkipped++;
      createdOrgs.push(existing);
      continue;
    }

    const org = await prisma.organization.create({ data });
    createdOrgs.push(org);
    orgCreated++;
    console.log(`  + ${org.name}`);
  }

  console.log(`  Итого: создано ${orgCreated}, пропущено ${orgSkipped}`);

  // 6. Контакты
  console.log("\n── Контакты ──");
  let contactsAdded = 0;
  for (const [idxStr, contacts] of Object.entries(CONTACTS_BY_INDEX)) {
    const idx = Number(idxStr);
    const org = createdOrgs[idx];
    if (!org) continue;

    const existingCount = await prisma.organizationContact.count({
      where: { organizationId: org.id },
    });
    if (existingCount > 0) continue;

    for (const c of contacts) {
      await prisma.organizationContact.create({
        data: { organizationId: org.id, ...c },
      });
      contactsAdded++;
    }
  }
  console.log(`  Добавлено контактов: ${contactsAdded}`);

  // 7. Банковские счета
  console.log("\n── Банковские счета ──");
  let bankAdded = 0;
  for (const [idxStr, accounts] of Object.entries(BANK_ACCOUNTS_BY_INDEX)) {
    const idx = Number(idxStr);
    const org = createdOrgs[idx];
    if (!org) continue;

    const existingCount = await prisma.organizationBankAccount.count({
      where: { organizationId: org.id },
    });
    if (existingCount > 0) continue;

    for (const acc of accounts) {
      await prisma.organizationBankAccount.create({
        data: {
          organizationId: org.id,
          bankName: acc.bankName,
          accountNumber: acc.accountNumber ?? null,
          comment: acc.comment ?? null,
        },
      });
      bankAdded++;
    }
  }
  console.log(`  Добавлено счетов: ${bankAdded}`);

  // 8. Доступы к системам
  console.log("\n── Доступы к системам ──");
  let accessAdded = 0;
  for (const [idxStr, accesses] of Object.entries(SYSTEM_ACCESSES_BY_INDEX)) {
    const idx = Number(idxStr);
    const org = createdOrgs[idx];
    if (!org) continue;

    const existingCount = await prisma.organizationSystemAccess.count({
      where: { organizationId: org.id },
    });
    if (existingCount > 0) continue;

    for (const acc of accesses) {
      await prisma.organizationSystemAccess.create({
        data: {
          organizationId: org.id,
          systemType: acc.systemType,
          name: acc.name ?? null,
          comment: acc.comment ?? null,
        },
      });
      accessAdded++;
    }
  }
  console.log(`  Добавлено доступов: ${accessAdded}`);

  // 9. Членство бухгалтеров и клиента в организациях
  console.log("\n── Члены организаций ──");
  let membersAdded = 0;

  // Карта: sectionId → userId бухгалтера
  const accountantBySectionId: Record<string, string> = {
    [sectionIds[0]]: staffIds["buh1@asbuh.local"],
    [sectionIds[1]]: staffIds["buh2@asbuh.local"],
    [sectionIds[2]]: staffIds["buh3@asbuh.local"],
  };

  for (const org of createdOrgs) {
    if (!org.sectionId) continue;
    const accountantId = accountantBySectionId[org.sectionId];
    if (!accountantId) continue;

    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: accountantId, organizationId: org.id } },
      update: {},
      create: { userId: accountantId, organizationId: org.id, role: "accountant" },
    });
    membersAdded++;
  }

  // Клиент → первая организация (ООО АльфаТрейд)
  const clientId = staffIds["client@asbuh.local"];
  const firstOrg = createdOrgs[0];
  if (clientId && firstOrg) {
    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: clientId, organizationId: firstOrg.id } },
      update: {},
      create: { userId: clientId, organizationId: firstOrg.id, role: "client" },
    });
    membersAdded++;
    console.log(`  ✓ client@asbuh.local → "${firstOrg.name}"`);
  }

  console.log(`  Всего добавлено/проверено: ${membersAdded}`);

  console.log(`
✅ Демо-данные успешно загружены!

Тестовые аккаунты (пароль Demo12345! для всех кроме admin):
  admin@asbuh.local    — Администратор (полный доступ)
  manager@asbuh.local  — Менеджер (участки 1+2)
  manager2@asbuh.local — Менеджер (участки 2+3)
  buh1@asbuh.local     — Бухгалтер (участок 1 «Северный»)
  buh2@asbuh.local     — Бухгалтер (участок 2 «Южный»)
  buh3@asbuh.local     — Бухгалтер (участок 3 «Центральный»)
  client@asbuh.local   — Клиент (ООО «АльфаТрейд»)
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
