import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type StageQuestion = {
  stageNo: number;
  country: string;
  location: string;
  roundLabel: string;
  lat: number;
  lng: number;
  hint: string;
  hintOptions: string[];
  hintCorrectIndex: number;
  mainPrompt: string;
  mainOptions: string[];
  mainCorrectIndex: number;
};

const DRY_RUN_TITLE = "Arthvidya Final Destination DRY RUN";
const DRY_RUN_SESSION_NAME = "DRY RUN";
const INITIAL_BUDGET = 10000;
const DEFAULT_PARTICIPANT_PASSWORD = process.env.DEFAULT_PARTICIPANT_PASSWORD?.trim() || "Team@12345";

const STAGES: StageQuestion[] = [
  {
    stageNo: 1,
    country: "India",
    location: "Mumbai BKC",
    roundLabel: "Round 1",
    lat: 28.612916,
    lng: 77.229509,
    hint: "This country has the world's 3rd-largest startup ecosystem and is home to unicorns like Flipkart and BYJU'S. Identify the country:",
    hintOptions: ["Indonesia", "India", "Vietnam", "Philippines"],
    hintCorrectIndex: 1,
    mainPrompt: "India's startup boom is largely driven by:",
    mainOptions: ["Oil exports", "Large domestic market & tech talent", "Coal production", "Fishing industry"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 2,
    country: "UAE",
    location: "Dubai Marina",
    roundLabel: "Round 1",
    lat: 25.197197,
    lng: 55.274376,
    hint: "This desert nation built one of the world's busiest aviation and logistics hubs. Identify the country:",
    hintOptions: ["Saudi Arabia", "Qatar", "UAE", "Oman"],
    hintCorrectIndex: 2,
    mainPrompt: "Dubai's rise as a business hub is mainly due to:",
    mainOptions: ["Agriculture", "Free trade zones & logistics", "Fishing", "Forestry"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 3,
    country: "United Kingdom",
    location: "London Canary Wharf",
    roundLabel: "Round 1",
    lat: 51.500729,
    lng: -0.124625,
    hint: "Home to the Bank of England and one of the oldest stock exchanges. Identify the country:",
    hintOptions: ["France", "Germany", "United Kingdom", "Netherlands"],
    hintCorrectIndex: 2,
    mainPrompt: "London is globally important because of its:",
    mainOptions: ["Mining", "Stock exchange & banking sector", "Tourism only", "Oil reserves"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 4,
    country: "Germany",
    location: "Frankfurt",
    roundLabel: "Round 1",
    lat: 50.110922,
    lng: 8.682127,
    hint: "Europe's largest economy and home to brands like BMW & Siemens. Identify the country:",
    hintOptions: ["Italy", "Germany", "Sweden", "Switzerland"],
    hintCorrectIndex: 1,
    mainPrompt: "Germany's economic strength lies in:",
    mainOptions: ["Fishing", "Manufacturing & engineering", "Oil exports", "Agriculture only"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 5,
    country: "France",
    location: "La Defense",
    roundLabel: "Round 1",
    lat: 48.85837,
    lng: 2.294481,
    hint: "Global capital of haute couture and luxury brands like Louis Vuitton. Identify the country:",
    hintOptions: ["Italy", "Spain", "France", "Belgium"],
    hintCorrectIndex: 2,
    mainPrompt: "France dominates globally in:",
    mainOptions: ["Mining", "Luxury goods & fashion", "Shipbuilding", "Oil drilling"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 6,
    country: "South Africa",
    location: "Johannesburg",
    roundLabel: "Round 1",
    lat: -26.107567,
    lng: 28.056702,
    hint: "City built on one of the richest gold reefs ever discovered. Identify the country:",
    hintOptions: ["Ghana", "South Africa", "Botswana", "Namibia"],
    hintCorrectIndex: 1,
    mainPrompt: "South Africa's economy historically grew due to:",
    mainOptions: ["IT exports", "Gold & mineral mining", "Tourism only", "Space tech"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 7,
    country: "Brazil",
    location: "Sao Paulo",
    roundLabel: "Round 1",
    lat: -23.550307,
    lng: -46.633915,
    hint: "World's largest exporter of coffee and a soybean giant. Identify the country:",
    hintOptions: ["Argentina", "Brazil", "Colombia", "Chile"],
    hintCorrectIndex: 1,
    mainPrompt: "Brazil is best known for exporting:",
    mainOptions: ["Microchips", "Agricultural commodities", "Satellites", "Automobiles only"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 8,
    country: "USA",
    location: "New York - Wall Street",
    roundLabel: "Round 1",
    lat: 40.689247,
    lng: -74.044502,
    hint: "The street that controls trillions of dollars in global finance. Identify the country:",
    hintOptions: ["USA", "Canada", "UK", "Germany"],
    hintCorrectIndex: 0,
    mainPrompt: "Wall Street represents:",
    mainOptions: ["Tourism", "Stock markets & finance", "Agriculture", "Shipping"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 9,
    country: "Canada",
    location: "Toronto",
    roundLabel: "Round 1",
    lat: 43.642566,
    lng: -79.387057,
    hint: "Second-largest country with vast oil sands and forests. Identify the country:",
    hintOptions: ["Russia", "Canada", "USA", "Norway"],
    hintCorrectIndex: 1,
    mainPrompt: "Canada's economy benefits from:",
    mainOptions: ["Desert trade", "Natural resources & energy", "Textile exports", "Fishing only"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 10,
    country: "China",
    location: "Shanghai Pudong",
    roundLabel: "Round 1",
    lat: 31.239693,
    lng: 121.499809,
    hint: "Produces more manufactured goods than any other nation. Identify the country:",
    hintOptions: ["Vietnam", "China", "Japan", "South Korea"],
    hintCorrectIndex: 1,
    mainPrompt: "China is called the factory of the world due to:",
    mainOptions: ["Tourism", "Large-scale manufacturing", "Oil exports", "Banking"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 11,
    country: "Japan",
    location: "Tokyo Shinjuku",
    roundLabel: "Round 1",
    lat: 35.658581,
    lng: 139.745433,
    hint: "Birthplace of Sony, Toyota, and robotics innovation. Identify the country:",
    hintOptions: ["South Korea", "Japan", "Taiwan", "Singapore"],
    hintCorrectIndex: 1,
    mainPrompt: "Japan leads globally in:",
    mainOptions: ["Agriculture", "Technology & electronics", "Mining", "Oil production"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 12,
    country: "Australia",
    location: "Sydney CBD",
    roundLabel: "Round 1",
    lat: -33.856784,
    lng: 151.215297,
    hint: "Major exporter of iron ore and coal to Asia. Identify the country:",
    hintOptions: ["Australia", "New Zealand", "Canada", "South Africa"],
    hintCorrectIndex: 0,
    mainPrompt: "Australia's economy is linked to:",
    mainOptions: ["Fishing", "Mining & natural resources", "Textiles", "IT services"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 13,
    country: "Kazakhstan",
    location: "Astana",
    roundLabel: "Round 1",
    lat: 51.128207,
    lng: 71.43042,
    hint: "Largest landlocked country connecting China to Europe via trade corridors. Identify the country:",
    hintOptions: ["Mongolia", "Kazakhstan", "Uzbekistan", "Turkmenistan"],
    hintCorrectIndex: 1,
    mainPrompt: "Kazakhstan's strategic importance comes from:",
    mainOptions: ["Coffee trade", "Energy & land trade routes", "Tourism", "Fishing"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 14,
    country: "Malaysia",
    location: "Kuala Lumpur / Petronas Towers",
    roundLabel: "Round 1",
    lat: 3.1579,
    lng: 101.712,
    hint: "This Southeast Asian country is a major hub for palm oil exports and hosts one of the world's tallest twin towers. Identify the country:",
    hintOptions: ["Thailand", "Indonesia", "Malaysia", "Philippines"],
    hintCorrectIndex: 2,
    mainPrompt: "Malaysia's economy significantly benefits from:",
    mainOptions: ["Coffee exports", "Palm oil & electronics manufacturing", "Shipbreaking only", "Diamond mining"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 15,
    country: "Singapore",
    location: "Singapore Port",
    roundLabel: "Round 1",
    lat: 1.286789,
    lng: 103.854503,
    hint: "Handles millions of containers annually despite small land size. Identify the country:",
    hintOptions: ["Malaysia", "Singapore", "Indonesia", "Thailand"],
    hintCorrectIndex: 1,
    mainPrompt: "Singapore Port is among the busiest because it:",
    mainOptions: ["Serves local trade only", "Connects global shipping routes", "Exports oil only", "Is largest by land"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 16,
    country: "Chile",
    location: "Moai Statues, Easter Island (Ahu Tongariki)",
    roundLabel: "Round 3",
    lat: -27.1253,
    lng: -109.2767,
    hint: "This South American country holds some of the world's largest lithium reserves used in EV batteries. Identify the country:",
    hintOptions: ["Peru", "Bolivia", "Chile", "Argentina"],
    hintCorrectIndex: 2,
    mainPrompt: "Chile is globally important in renewable energy supply chains because it is a leading producer of:",
    mainOptions: ["Bauxite", "Lithium", "Coal", "Tin"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 17,
    country: "Argentina",
    location: "Iguazu Falls",
    roundLabel: "Round 3",
    lat: -25.6953,
    lng: -54.4367,
    hint: "This country is one of the world's top soybean producers and part of the Mercosur trade bloc. Identify the country:",
    hintOptions: ["Brazil", "Argentina", "Paraguay", "Uruguay"],
    hintCorrectIndex: 1,
    mainPrompt: "Argentina's primary agricultural export sector is dominated by:",
    mainOptions: ["Coffee", "Soybeans", "Tea", "Cocoa"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 18,
    country: "Peru",
    location: "Machu Picchu",
    roundLabel: "Round 3",
    lat: -13.1631,
    lng: -72.545,
    hint: "An Andean nation and one of the largest copper producers globally. Identify the country:",
    hintOptions: ["Chile", "Peru", "Ecuador", "Colombia"],
    hintCorrectIndex: 1,
    mainPrompt: "Peru plays a major role in global metals trade as a top exporter of:",
    mainOptions: ["Copper", "Uranium", "Nickel", "Zinc only"],
    mainCorrectIndex: 0,
  },
  {
    stageNo: 19,
    country: "Nigeria",
    location: "Zuma Rock",
    roundLabel: "Round 3",
    lat: 9.1412,
    lng: 7.2395,
    hint: "Africa's most populous nation and a founding member of OPEC. Identify the country:",
    hintOptions: ["Angola", "Nigeria", "Algeria", "Libya"],
    hintCorrectIndex: 1,
    mainPrompt: "Nigeria is Africa's largest economy primarily due to revenue from:",
    mainOptions: ["Diamonds", "Oil exports", "Tourism", "Automobile manufacturing"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 20,
    country: "Kenya",
    location: "Maasai Mara National Reserve",
    roundLabel: "Round 3",
    lat: -1.4061,
    lng: 35.0081,
    hint: "East African economy famous for safari tourism and high-quality tea exports. Identify the country:",
    hintOptions: ["Tanzania", "Kenya", "Uganda", "Ethiopia"],
    hintCorrectIndex: 1,
    mainPrompt: "Kenya earns major foreign exchange through exports of:",
    mainOptions: ["Tea", "Wheat", "Corn", "Cotton only"],
    mainCorrectIndex: 0,
  },
  {
    stageNo: 21,
    country: "Egypt",
    location: "Great Pyramid of Giza",
    roundLabel: "Round 3",
    lat: 29.9792,
    lng: 31.1342,
    hint: "This country controls one of the world's most critical maritime trade shortcuts. Identify the country:",
    hintOptions: ["Turkey", "Egypt", "Saudi Arabia", "UAE"],
    hintCorrectIndex: 1,
    mainPrompt: "Egypt's geopolitical importance in trade comes from controlling the:",
    mainOptions: ["Panama Canal", "Strait of Hormuz", "Suez Canal", "Bosphorus Strait"],
    mainCorrectIndex: 2,
  },
  {
    stageNo: 22,
    country: "Greece",
    location: "Acropolis of Athens (Parthenon)",
    roundLabel: "Round 3",
    lat: 37.9715,
    lng: 23.7257,
    hint: "A Mediterranean nation that faced a major sovereign debt crisis in the 2010s. Identify the country:",
    hintOptions: ["Italy", "Spain", "Greece", "Portugal"],
    hintCorrectIndex: 2,
    mainPrompt: "Greece adopted which currency after joining the Eurozone?",
    mainOptions: ["Drachma", "Euro", "Lira", "Pound"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 23,
    country: "Romania",
    location: "Bran Castle (Dracula's Castle)",
    roundLabel: "Round 3",
    lat: 45.5156,
    lng: 25.3676,
    hint: "An Eastern European country that joined NATO in 2004. Identify the country:",
    hintOptions: ["Bulgaria", "Hungary", "Romania", "Serbia"],
    hintCorrectIndex: 2,
    mainPrompt: "Romania is part of which military alliance?",
    mainOptions: ["NATO", "ASEAN", "OPEC", "Mercosur"],
    mainCorrectIndex: 0,
  },
  {
    stageNo: 24,
    country: "Poland",
    location: "Auschwitz-Birkenau Memorial & Museum",
    roundLabel: "Round 3",
    lat: 50.0359,
    lng: 19.1783,
    hint: "Central European economy known for strong post-Cold War industrial growth. Identify the country:",
    hintOptions: ["Czech Republic", "Poland", "Slovakia", "Austria"],
    hintCorrectIndex: 1,
    mainPrompt: "Poland's official currency is:",
    mainOptions: ["Euro", "Zloty", "Forint", "Krona"],
    mainCorrectIndex: 1,
  },
  {
    stageNo: 25,
    country: "Qatar",
    location: "The Pearl-Qatar",
    roundLabel: "Round 3",
    lat: 25.3715,
    lng: 51.531,
    hint: "One of the world's richest nations per capita due to LNG exports. Identify the country:",
    hintOptions: ["Kuwait", "Qatar", "Bahrain", "Oman"],
    hintCorrectIndex: 1,
    mainPrompt: "Qatar has one of the highest GDP per capita in the world due to exports of:",
    mainOptions: ["Coal", "Natural gas", "Coffee", "Steel"],
    mainCorrectIndex: 1,
  },
];

async function upsertHintQuestion(stage: StageQuestion) {
  const externalId = `dryrun-q${String(stage.stageNo).padStart(2, "0")}-hint`;
  const question = await prisma.question.upsert({
    where: { externalId },
    create: {
      externalId,
      prompt: stage.hint,
      kind: "HINT",
      answerFormat: "MCQ",
      acceptedAnswers: null,
      stageNo: stage.stageNo,
      roundLabel: stage.roundLabel,
      internalCountry: stage.country,
      internalLocation: stage.location,
      latitude: stage.lat,
      longitude: stage.lng,
      timeLimitSec: 20,
      points: 200,
      explanation: "Hint phase complete.",
    },
    update: {
      prompt: stage.hint,
      kind: "HINT",
      answerFormat: "MCQ",
      acceptedAnswers: null,
      stageNo: stage.stageNo,
      roundLabel: stage.roundLabel,
      internalCountry: stage.country,
      internalLocation: stage.location,
      latitude: stage.lat,
      longitude: stage.lng,
      timeLimitSec: 20,
      points: 200,
      explanation: "Hint phase complete.",
    },
    select: { id: true },
  });

  await prisma.option.deleteMany({ where: { questionId: question.id } });
  await prisma.option.createMany({
    data: stage.hintOptions.map((text, idx) => ({
      questionId: question.id,
      text,
      isCorrect: idx === stage.hintCorrectIndex,
    })),
  });

  return question.id;
}

async function upsertMainQuestion(stage: StageQuestion) {
  const externalId = `dryrun-q${String(stage.stageNo).padStart(2, "0")}-main`;
  const question = await prisma.question.upsert({
    where: { externalId },
    create: {
      externalId,
      prompt: stage.mainPrompt,
      kind: "MAIN",
      answerFormat: "MCQ",
      acceptedAnswers: null,
      stageNo: stage.stageNo,
      roundLabel: stage.roundLabel,
      internalCountry: stage.country,
      internalLocation: stage.location,
      latitude: stage.lat,
      longitude: stage.lng,
      timeLimitSec: 20,
      points: 1000,
      explanation: null,
    },
    update: {
      prompt: stage.mainPrompt,
      kind: "MAIN",
      answerFormat: "MCQ",
      acceptedAnswers: null,
      stageNo: stage.stageNo,
      roundLabel: stage.roundLabel,
      internalCountry: stage.country,
      internalLocation: stage.location,
      latitude: stage.lat,
      longitude: stage.lng,
      timeLimitSec: 20,
      points: 1000,
      explanation: null,
    },
    select: { id: true },
  });

  await prisma.option.deleteMany({ where: { questionId: question.id } });
  await prisma.option.createMany({
    data: stage.mainOptions.map((text, idx) => ({
      questionId: question.id,
      text,
      isCorrect: idx === stage.mainCorrectIndex,
    })),
  });

  return question.id;
}

async function ensureDryRunQuiz(questionIdsInOrder: string[]) {
  const existing = await prisma.quiz.findFirst({ where: { title: DRY_RUN_TITLE }, select: { id: true } });

  const quiz = existing
    ? await prisma.quiz.update({
        where: { id: existing.id },
        data: {
          title: DRY_RUN_TITLE,
          shuffleQuestions: false,
          shuffleOptions: false,
          scoringMode: "BUDGET",
          initialBudget: INITIAL_BUDGET,
        },
        select: { id: true },
      })
    : await prisma.quiz.create({
        data: {
          title: DRY_RUN_TITLE,
          shuffleQuestions: false,
          shuffleOptions: false,
          scoringMode: "BUDGET",
          initialBudget: INITIAL_BUDGET,
        },
        select: { id: true },
      });

  await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
  await prisma.quizQuestion.createMany({
    data: questionIdsInOrder.map((questionId, idx) => ({
      quizId: quiz.id,
      questionId,
      order: idx,
    })),
  });

  return quiz.id;
}

async function ensureDryRunSession(quizId: string) {
  const existing = await prisma.session.findFirst({
    where: { name: DRY_RUN_SESSION_NAME },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.answer.deleteMany({ where: { sessionId: existing.id } });
    await prisma.team.deleteMany({ where: { sessionId: existing.id } });

    const session = await prisma.session.update({
      where: { id: existing.id },
      data: {
        name: DRY_RUN_SESSION_NAME,
        quizId,
        scoringMode: "BUDGET",
        initialBudget: INITIAL_BUDGET,
        status: "LOBBY",
        phase: "DRAFT",
        questionState: "IDLE",
        pausedFromPhase: null,
        currentQuestionIndex: 0,
        questionStartAt: null,
        questionEndAt: null,
        pauseRemainingSec: null,
        destinationIndex: 0,
        destinationCount: STAGES.length,
      },
      select: { id: true },
    });
    return session.id;
  }

  const session = await prisma.session.create({
    data: {
      name: DRY_RUN_SESSION_NAME,
      quizId,
      scoringMode: "BUDGET",
      initialBudget: INITIAL_BUDGET,
      status: "LOBBY",
      phase: "DRAFT",
      questionState: "IDLE",
      pausedFromPhase: null,
      currentQuestionIndex: 0,
      questionStartAt: null,
      questionEndAt: null,
      pauseRemainingSec: null,
      destinationIndex: 0,
      destinationCount: STAGES.length,
    },
    select: { id: true },
  });

  return session.id;
}

async function ensureParticipantAccounts() {
  const hash = await bcrypt.hash(DEFAULT_PARTICIPANT_PASSWORD, 10);
  for (let i = 1; i <= 10; i += 1) {
    const teamCode = `TEAM${String(i).padStart(2, "0")}`;
    const username = teamCode.toLowerCase();
    await prisma.participantAccount.upsert({
      where: { username },
      create: {
        username,
        displayName: teamCode,
        teamCode,
        passwordHash: hash,
        isActive: true,
      },
      update: {
        teamCode,
        isActive: true,
      },
    });
  }
}

async function main() {
  const orderedQuestionIds: string[] = [];

  for (const stage of STAGES) {
    const hintId = await upsertHintQuestion(stage);
    const mainId = await upsertMainQuestion(stage);
    orderedQuestionIds.push(hintId, mainId);
  }

  const quizId = await ensureDryRunQuiz(orderedQuestionIds);
  const sessionId = await ensureDryRunSession(quizId);
  await ensureParticipantAccounts();

  console.log("Dry run seed complete.");
  console.log(`Quiz: ${DRY_RUN_TITLE}`);
  console.log(`Quiz ID: ${quizId}`);
  console.log(`Session Name: ${DRY_RUN_SESSION_NAME}`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Questions: ${orderedQuestionIds.length} (25 hint + 25 main)`);
  console.log(`Participant accounts: TEAM01..TEAM10 (default password: ${DEFAULT_PARTICIPANT_PASSWORD})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
