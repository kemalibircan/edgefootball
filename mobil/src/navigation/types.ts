import type {FixtureBoardItem} from '../types/api';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  FixtureDetail: {
    fixture: FixtureBoardItem;
  };
  Profile: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  Coupons: undefined;
  MathGuide: undefined;
  SavedCoupons: undefined;
  Chat: undefined;
};
