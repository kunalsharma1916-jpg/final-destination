export type EventState = {
  id: number;
  is_live: boolean;
  global_stage_unlock: number;
  hint_unlocked_stage: number;
  freeze_leaderboard: boolean;
  updated_at: string;
};

export type TeamRow = {
  id: string;
  team_name: string;
  budget: number;
  current_stage: number;
  is_active: boolean;
  last_submit_at: string | null;
};

export type StageRow = {
  stage_no: number;
  country: string | null;
  location_name: string | null;
  lat: number;
  lng: number;
  clue_text: string;
  hint_question: string | null;
  main_question: string;
};
