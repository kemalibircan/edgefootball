import {normalizeShowcaseSections, normalizeSliderImages, DEFAULT_SLIDER_IMAGES} from '../src/lib/adapters/homeAdapters';

describe('home adapters', () => {
  test('normalizeSliderImages returns payload images when valid', () => {
    const images = normalizeSliderImages({
      items: [
        {image_url: 'https://a.test/1.jpg'},
        {image_url: 'https://a.test/2.jpg'},
      ],
    });

    expect(images).toEqual(['https://a.test/1.jpg', 'https://a.test/2.jpg']);
  });

  test('normalizeSliderImages falls back to defaults', () => {
    const images = normalizeSliderImages({items: [{image_url: ''}]});
    expect(images).toEqual(DEFAULT_SLIDER_IMAGES);
  });

  test('normalizeShowcaseSections resolves fallback sections', () => {
    const sections = normalizeShowcaseSections({sections: {}});
    expect(sections.popular.items).toEqual([]);
    expect(sections.featured.items).toEqual([]);
  });

  test('normalizeShowcaseSections returns backend sections', () => {
    const sections = normalizeShowcaseSections({
      sections: {
        popular_odds: {
          key: 'popular_odds',
          items: [{section_key: 'popular_odds', home_team_name: 'A', away_team_name: 'B'}],
        },
        featured_match: {
          key: 'featured_match',
          items: [{section_key: 'featured_match', home_team_name: 'C', away_team_name: 'D'}],
        },
      },
    });

    expect(sections.popular.items).toHaveLength(1);
    expect(sections.featured.items).toHaveLength(1);
  });
});
