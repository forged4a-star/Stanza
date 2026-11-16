/** Lets an editor deep in the page ask the lyric page to scroll (keyboard avoidance). */
export const scrollBus = {
  /** scroll the page by dy pixels (set by the lyric page) */
  by: (_dy: number) => {},
  /** bottom edge of the area not covered by the keyboard, in window coordinates */
  visibleBottom: () => Number.POSITIVE_INFINITY,
};
