export type DockState = 'hidden' | 'collapsed' | 'expanded';

export const TAB_BAR_HEIGHT = 72;
export const DOCK_COLLAPSED_HEIGHT = 62;

export function getBottomContentInset(
  _tabBarHeight = TAB_BAR_HEIGHT,
  dockState: DockState = 'collapsed',
  safeAreaBottom = 0,
) {
  const base = safeAreaBottom + 12;

  if (dockState === 'hidden') {
    return base;
  }

  if (dockState === 'expanded') {
    // Expanded dock acts as a bottom-sheet overlay, keep base inset.
    return base;
  }

  return base + DOCK_COLLAPSED_HEIGHT + 12;
}
