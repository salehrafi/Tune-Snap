export const VIEWPORT = { width: 1024, height: 768 } as const;

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** jsdom has no layout engine, so tests provide explicit element geometry. */
export function setViewport(width: number = VIEWPORT.width, height: number = VIEWPORT.height): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

export function render(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

export function mockRect(element: Element | null, box: Box): void {
  if (!element) throw new Error('mockRect: element is missing');
  const rect = {
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
    top: box.top,
    left: box.left,
    right: box.left + box.width,
    bottom: box.top + box.height,
    toJSON: () => rect,
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}
