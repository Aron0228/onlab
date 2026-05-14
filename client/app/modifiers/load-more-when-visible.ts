import { modifier } from 'ember-modifier';

type LoadMoreWhenVisibleNamedArgs = {
  enabled?: boolean;
  rootMargin?: string;
};

const ROOT_MARGIN_PART_PATTERN = /^-?\d*\.?\d+(px|%)$/;
const DEFAULT_ROOT_MARGIN = '0px 0px 288px 0px';

export default modifier(
  (
    element: Element,
    [onLoadMore]: [() => void],
    {
      enabled = true,
      rootMargin = DEFAULT_ROOT_MARGIN,
    }: LoadMoreWhenVisibleNamedArgs
  ) => {
    if (!enabled || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        queueMicrotask(onLoadMore);
      },
      {
        root: element.parentElement,
        rootMargin: normalizeRootMargin(rootMargin),
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }
);

function normalizeRootMargin(rootMargin: string): string {
  const parts = rootMargin.trim().split(/\s+/);

  if (
    parts.length >= 1 &&
    parts.length <= 4 &&
    parts.every((part) => ROOT_MARGIN_PART_PATTERN.test(part))
  ) {
    return rootMargin;
  }

  return DEFAULT_ROOT_MARGIN;
}
