declare global {
  interface Window {
    faviconAnimationState: {
      intervalId: ReturnType<typeof setInterval> | null;
      currentIndex: number;
      direction: number;
    };
  }
}

export {};
