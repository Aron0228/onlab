import { modifier } from 'ember-modifier';

type LoadMoreWhenVisibleNamedArgs = {
  enabled?: boolean;
  rootMargin?: string;
};

export default modifier(
  (
    element: Element,
    [onLoadMore]: [() => void],
    {
      enabled = true,
      rootMargin = '0px 0px 18rem 0px',
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
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }
);
