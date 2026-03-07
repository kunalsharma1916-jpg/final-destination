import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const teams = Array.from({ length: 10 }, (_, i) => ({
  team_name: `Team ${String(i + 1).padStart(2, "0")}`,
  team_code: `TEAM${String(i + 1).padStart(2, "0")}`,
  budget: 10000,
  current_stage: 1,
  is_active: true,
}));

const stages = [
  {
    stage_no: 1,
    country: "France",
    location_name: "Eiffel Tower",
    lat: 48.8584,
    lng: 2.2945,
    clue_text: "Iron lattice icon in the City of Light.",
    hint_question: "Which city is this monument in?",
    hint_answers: "paris|city of paris",
    main_question: "Name the monument.",
    main_answers: "eiffel tower|tour eiffel",
  },
  {
    stage_no: 2,
    country: "India",
    location_name: "Taj Mahal",
    lat: 27.1751,
    lng: 78.0421,
    clue_text: "White marble mausoleum by the Yamuna river.",
    hint_question: "Which Indian city hosts this site?",
    hint_answers: "agra",
    main_question: "Name the monument.",
    main_answers: "taj mahal",
  },
  {
    stage_no: 3,
    country: "Brazil",
    location_name: "Christ the Redeemer",
    lat: -22.9519,
    lng: -43.2105,
    clue_text: "Arms wide open over Rio.",
    hint_question: "Which city is this overlooking?",
    hint_answers: "rio|rio de janeiro",
    main_question: "Name the statue.",
    main_answers: "christ the redeemer|cristo redentor",
  },
  {
    stage_no: 4,
    country: "Egypt",
    location_name: "Great Pyramid of Giza",
    lat: 29.9792,
    lng: 31.1342,
    clue_text: "Ancient wonder on the Giza plateau.",
    hint_question: "Near which city are these pyramids?",
    hint_answers: "giza|cairo",
    main_question: "Name this pyramid.",
    main_answers: "great pyramid of giza|pyramid of khufu|khufu pyramid",
  },
  {
    stage_no: 5,
    country: "Australia",
    location_name: "Sydney Opera House",
    lat: -33.8568,
    lng: 151.2153,
    clue_text: "Sails-shaped performing arts center.",
    hint_question: "Which city is this in?",
    hint_answers: "sydney",
    main_question: "Name the building.",
    main_answers: "sydney opera house|opera house sydney",
  },
  {
    stage_no: 6,
    country: "United States",
    location_name: "Statue of Liberty",
    lat: 40.6892,
    lng: -74.0445,
    clue_text: "Gift from France on Liberty Island.",
    hint_question: "Which city is this associated with?",
    hint_answers: "new york|new york city|nyc",
    main_question: "Name the monument.",
    main_answers: "statue of liberty|liberty enlightening the world",
  },
];

async function main() {
  const { error: stateErr } = await db
    .from("event_state")
    .upsert(
      {
        id: 1,
        is_live: false,
        global_stage_unlock: 1,
        hint_unlocked_stage: 0,
        freeze_leaderboard: false,
      },
      { onConflict: "id" },
    );

  if (stateErr) throw stateErr;

  const { error: teamErr } = await db.from("teams").upsert(teams, { onConflict: "team_code" });
  if (teamErr) throw teamErr;

  const { error: stageErr } = await db.from("stages").upsert(stages, { onConflict: "stage_no" });
  if (stageErr) throw stageErr;

  console.log("Seed completed: event_state + 10 teams + 6 stages.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
