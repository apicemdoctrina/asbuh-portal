/**
 * Демо-данные: 25 организаций с разной степенью заполненности карточек.
 * Запуск: npm run db:seed-demo -w apps/api
 *
 * Скрипт идемпотентен — при повторном запуске пропускает уже существующие
 * организации (проверка по ИНН) и секции (проверка по номеру).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --------------- Секции ---------------

const SECTIONS = [
  { number: 1, name: "Северный" },
  { number: 2, name: "Южный" },
  { number: 3, name: "Центральный" },
];

// --------------- Организации ---------------

type OrgSeed = Parameters<typeof prisma.organization.create>[0]["data"];

function orgs(sectionIds: string[]): OrgSeed[] {
  const [s1, s2, s3] = sectionIds;

  return [
    // ---- Полностью заполненные (100%) ----
    {
      name: 'ООО "АльфаТрейд"',
      form: "OOO",
      inn: "7701234501",
      ogrn: "1027700001001",
      kpp: "770101001",
      sectionId: s1,
      status: "active",
      taxSystems: ["USN6"],
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

    // ---- Хорошо заполненные (70–90%) ----
    {
      name: 'ООО "ДельтаГрупп"',
      form: "OOO",
      inn: "6658901234",
      ogrn: "1046602985001",
      kpp: "665801001",
      sectionId: s3,
      status: "active",
      taxSystems: ["USN6"],
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

    // ---- Средне заполненные (40–65%) ----
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
    },

    // ---- Слабо заполненные (10–35%) ----
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

// --------------- Контакты ---------------

async function seedContacts(
  orgId: string,
  contacts: { contactPerson: string; phone: string; email?: string }[],
) {
  for (const c of contacts) {
    await prisma.organizationContact.create({
      data: { organizationId: orgId, ...c },
    });
  }
}

// --------------- Главная функция ---------------

async function main() {
  console.log("🌱 Начинаем посев демо-данных...\n");

  // 1. Секции
  const sectionIds: string[] = [];
  for (const s of SECTIONS) {
    const section = await prisma.section.upsert({
      where: { number: s.number },
      update: {},
      create: s,
    });
    sectionIds.push(section.id);
    console.log(`Секция #${s.number} "${s.name}" — OK`);
  }

  // 2. Организации
  const orgData = orgs(sectionIds);
  let created = 0;
  let skipped = 0;
  const createdOrgs: { id: string; name: string }[] = [];

  for (const data of orgData) {
    // Проверяем по ИНН (если есть) или по имени
    const existing = data.inn
      ? await prisma.organization.findUnique({ where: { inn: data.inn as string } })
      : await prisma.organization.findFirst({ where: { name: data.name as string } });

    if (existing) {
      skipped++;
      createdOrgs.push(existing);
      continue;
    }

    const org = await prisma.organization.create({ data });
    createdOrgs.push(org);
    created++;
    console.log(`  + ${org.name}`);
  }

  console.log(`\nОрганизации: создано ${created}, пропущено (уже есть) ${skipped}`);

  // 3. Контакты для первых нескольких организаций (если ещё нет)
  const contactsMap: Record<number, { contactPerson: string; phone: string; email?: string }[]> = {
    0: [
      { contactPerson: "Иванов Сергей", phone: "+7 (495) 123-45-67", email: "ivanov@alfatrade.ru" },
    ],
    1: [{ contactPerson: "Петрова Наталья", phone: "+7 (917) 234-56-78" }],
    2: [
      { contactPerson: "Белов Андрей", phone: "+7 (495) 345-67-89", email: "belov@betaservice.ru" },
      { contactPerson: "Ким Юлия (бухгалтер)", phone: "+7 (916) 456-78-90" },
    ],
    3: [
      {
        contactPerson: "Громов Виктор",
        phone: "+7 (495) 567-89-01",
        email: "gromov@gammainvest.ru",
      },
    ],
    5: [{ contactPerson: "Дёмина Анна", phone: "+7 (343) 678-90-12" }],
    7: [{ contactPerson: "Козлова Марина", phone: "+7 (903) 789-01-23" }],
    11: [{ contactPerson: "Поляков Дмитрий", phone: "+7 (342) 890-12-34" }],
  };

  for (const [idxStr, contacts] of Object.entries(contactsMap)) {
    const idx = Number(idxStr);
    const org = createdOrgs[idx];
    if (!org) continue;

    const existingCount = await prisma.organizationContact.count({
      where: { organizationId: org.id },
    });
    if (existingCount === 0) {
      await seedContacts(org.id, contacts);
      console.log(`Контакты для "${org.name}" — добавлено ${contacts.length}`);
    }
  }

  console.log("\n✅ Демо-данные успешно загружены!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
