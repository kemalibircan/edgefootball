import type {ShowcasePublicResponse, ShowcaseSection, SliderPublicResponse} from '../../types/api';

export const DEFAULT_SLIDER_IMAGES = [
  'https://images.unsplash.com/photo-1543357480-c60d400e2ef9?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1600&q=80',
];

export function normalizeSliderImages(payload?: Partial<SliderPublicResponse> | null) {
  const rows = Array.isArray(payload?.items) ? payload?.items : [];
  const images = rows
    .map(item => String(item?.image_url || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  return images.length ? images : DEFAULT_SLIDER_IMAGES;
}

const EMPTY_SECTION: ShowcaseSection = {
  key: 'empty',
  items: [],
};

export function normalizeShowcaseSections(payload?: Partial<ShowcasePublicResponse> | null) {
  const rawSections = payload?.sections;
  if (!rawSections || typeof rawSections !== 'object') {
    return {
      popular: EMPTY_SECTION,
      featured: EMPTY_SECTION,
    };
  }

  const popular = rawSections.popular_odds;
  const featured = rawSections.featured_match;

  return {
    popular: popular && Array.isArray(popular.items) ? popular : EMPTY_SECTION,
    featured: featured && Array.isArray(featured.items) ? featured : EMPTY_SECTION,
  };
}
