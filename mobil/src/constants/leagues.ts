export type LeagueOption = {
  label: string;
  value: string;
};

export const LEAGUE_OPTIONS: LeagueOption[] = [
  {label: 'Tum Ligler', value: 'all'},
  {label: 'Super Lig', value: '600'},
  {label: 'La Liga', value: '564'},
  {label: 'Premier League', value: '8'},
  {label: 'Serie A', value: '384'},
  {label: 'Champions League', value: '2'},
  {label: 'Europa League', value: '5'},
];

export const GAME_TYPE_OPTIONS: LeagueOption[] = [
  {label: 'Tum Oyun Turleri', value: 'all'},
  {label: 'Mac Sonucu', value: 'match_result'},
  {label: 'Ilk Yari Sonucu', value: 'first_half'},
  {label: 'Handikap', value: 'handicap'},
  {label: 'Alt/Ust 2.5', value: 'over_under_25'},
  {label: 'Karsilikli Gol', value: 'btts'},
];

export const DEFAULT_COUPON_LEAGUES = [600, 564, 8, 384, 2, 5];
