export {};

declare global {
  interface Window {
    __sailOutputLines?: string[];
    __sailOutputSink?: ((line: string) => void) | null;
    __sailModulePath?: string;
    createSailModule?: (...args: unknown[]) => Promise<unknown> | unknown;
  }
}
