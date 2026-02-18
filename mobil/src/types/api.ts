export type AuthUser = {
  id: number;
  username: string;
  email?: string;
  email_verified?: boolean;
  role: string;
  credits: number;
  is_active: boolean;
  advanced_mode_enabled?: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

export type ForgotPasswordResponse = {
  ok: boolean;
  message: string;
};

export type MarketOneXTwo = {
  line?: string | null;
  '1'?: number | null;
  '0'?: number | null;
  '2'?: number | null;
};

export type MarketOverUnder = {
  line?: string | null;
  under?: number | null;
  over?: number | null;
};

export type MarketBtts = {
  yes?: number | null;
  no?: number | null;
};

export type FixtureMarkets = {
  match_result?: MarketOneXTwo | null;
  first_half?: MarketOneXTwo | null;
  handicap?: MarketOneXTwo | null;
  over_under_25?: MarketOverUnder | null;
  btts?: MarketBtts | null;
};

export type FixtureScore = {
  home_score?: number | null;
  away_score?: number | null;
};

export type FixtureState = {
  state?: string | null;
  minute?: number | null;
  second?: number | null;
  added_time?: number | null;
};

export type FixtureBoardItem = {
  fixture_id: number;
  league_id: number | null;
  league_name: string | null;
  starting_at: string | null;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  match_label: string;
  status?: string;
  is_live?: boolean;
  is_featured?: boolean;
  markets?: FixtureMarkets;
  scores?: FixtureScore;
  state?: FixtureState;
};

export type FixtureBoardResponse = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  sort: string;
  game_type: string;
  featured_only: boolean;
  items: FixtureBoardItem[];
};

export type SliderImageItem = {
  id?: number | null;
  image_url: string;
  display_order?: number | null;
  is_active?: boolean;
};

export type SliderPublicResponse = {
  items: SliderImageItem[];
};

export type ShowcaseItem = {
  id?: number | null;
  section_key: string;
  fixture_id?: number | null;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  kickoff_at?: string | null;
  odd_home?: number | null;
  odd_draw?: number | null;
  odd_away?: number | null;
  model_score_home?: number | null;
  model_score_away?: number | null;
  display_order?: number | null;
  is_active?: boolean;
};

export type ShowcaseSection = {
  key: string;
  items: ShowcaseItem[];
};

export type ShowcasePublicResponse = {
  sections: Record<string, ShowcaseSection>;
};

export type ModelItem = {
  model_id: string;
  model_name?: string;
  model_scope?: 'ready' | 'user' | string;
  is_owned_by_me?: boolean;
  meta?: {
    league_id?: number | string;
    [key: string]: unknown;
  };
};

export type ModelsResponse = {
  active_model_id: string | null;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: ModelItem[];
};

export type SimulationTopScore = {
  score: string;
  probability: number;
};

export type SimulationResponse = {
  outcomes: {
    home_win: number;
    draw: number;
    away_win: number;
  };
  model?: {
    model_id?: string | null;
    model_name?: string | null;
    selection_mode?: string | null;
  };
  lambda_home?: number;
  lambda_away?: number;
  top_scorelines?: SimulationTopScore[];
  credits_remaining?: number;
};

export type AiCommentaryResponse = {
  commentary: string;
  provider?: string;
  provider_error?: string | null;
  credits_remaining?: number;
  simulation?: {
    outcomes?: SimulationResponse['outcomes'];
    top_scorelines?: SimulationTopScore[];
  };
};

export type CouponMatch = {
  fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  starting_at?: string | null;
  selection: string;
  selection_display?: string | null;
  market_key?: string | null;
  market_label?: string | null;
  line?: string | null;
  odd: number;
  league_id?: number | null;
  league_name?: string | null;
  model_id?: string | null;
  source?: string | null;
};

export type RiskCoupon = {
  total_odds?: number;
  unavailable?: boolean;
  warnings?: string[];
  matches: CouponMatch[];
};

export type CouponGenerateResponse = {
  run_id: number;
  task_id: string;
  credit_charged: number;
  expires_at: string | null;
  status: string;
};

export type CouponTaskInfo = {
  task_id: string;
  state: string;
  progress: number;
  stage: string;
  result?: {
    coupons?: {
      low?: RiskCoupon;
      medium?: RiskCoupon;
      high?: RiskCoupon;
    };
  };
};

export type SavedCouponItem = {
  fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  starting_at?: string | null;
  selection: string;
  odd: number;
  league_id?: number | null;
  league_name?: string | null;
  market_key?: string | null;
  market_label?: string | null;
  line?: string | null;
  selection_display?: string | null;
};

export type SavedCouponSummary = {
  coupon_count: number;
  stake: number;
  total_odds: number;
  coupon_amount: number;
  max_win: number;
};

export type RenameSavedCouponRequest = {
  name: string;
};

export type SavedCoupon = {
  id: number;
  name: string;
  status: 'active' | 'archived' | string;
  risk_level?: string | null;
  source_task_id?: string | null;
  items: SavedCouponItem[];
  summary: SavedCouponSummary;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

export type SavedCouponsResponse = {
  items: SavedCoupon[];
  total: number;
  status: string;
};

export type ChatThread = {
  id: number;
  user_id?: number;
  fixture_id: number;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  league_id?: number | null;
  league_name?: string | null;
  starting_at?: string | null;
  event_date?: string | null;
  match_label: string;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_role?: 'user' | 'assistant' | string | null;
  last_message_content?: string | null;
};

export type ChatMessageMeta = {
  source?: 'generated' | 'manual' | string;
  fixture_id?: number;
  task_id?: string | null;
  selection?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  model_selection_mode?: string | null;
  provider?: string | null;
  provider_error?: string | null;
  analysis_table?: Array<Record<string, unknown>>;
  odds_summary?: {
    available?: boolean;
    home?: {
      avg_decimal_odds?: number | null;
      implied_probability?: number | null;
    };
    draw?: {
      avg_decimal_odds?: number | null;
      implied_probability?: number | null;
    };
    away?: {
      avg_decimal_odds?: number | null;
      implied_probability?: number | null;
    };
    [key: string]: unknown;
  } | null;
  simulation_summary?: Record<string, unknown> | null;
  cached?: boolean;
  [key: string]: unknown;
};

export type ChatMessage = {
  id: number;
  thread_id: number;
  user_id: number;
  role: 'user' | 'assistant' | string;
  content_markdown: string;
  meta?: ChatMessageMeta | null;
  credit_charged?: number;
  created_at?: string | null;
};

export type ChatThreadsResponse = {
  items: ChatThread[];
  total: number;
};

export type ChatThreadMessagesResponse = {
  thread: ChatThread;
  items: ChatMessage[];
  total: number;
};

export type ChatFixtureSearchItem = {
  fixture_id: number;
  league_id?: number | null;
  league_name?: string | null;
  event_date?: string | null;
  starting_at?: string | null;
  status?: string | null;
  is_live?: boolean;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  match_label: string;
};

export type ChatFixtureSearchResponse = {
  q: string;
  items: ChatFixtureSearchItem[];
  total: number;
};

export type ChatMessageCreateRequest = {
  thread_id?: number;
  fixture_id?: number;
  home_team_name?: string;
  away_team_name?: string;
  match_label?: string;
  source?: 'generated' | 'manual';
  task_id?: string;
  selection?: string;
  model_id?: string;
  question: string;
  language?: string;
  new_session?: boolean;
};

export type ChatMessageCreateResponse = {
  thread: ChatThread;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  insight?: {
    commentary?: string;
    analysis_table?: Array<Record<string, unknown>>;
    odds_summary?: Record<string, unknown> | null;
    provider?: string | null;
    provider_error?: string | null;
    source?: string;
    fixture_id?: number;
    selection?: string | null;
    model_id?: string | null;
    model_name?: string | null;
    model_selection_mode?: string | null;
    simulation_summary?: Record<string, unknown> | null;
    cached?: boolean;
  };
  credits_remaining?: number;
};
