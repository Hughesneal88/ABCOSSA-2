// Deno runtime stubs — silences VS Code TS errors for edge functions.
// These types are not used at runtime; Supabase deploys these on Deno.

declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (req: Request) => Promise<Response> | Response): void;
}

// Allow https:// ESM imports (e.g. https://esm.sh/...)
declare module "https://*" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(url: string, key: string, options?: Record<string, unknown>): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _default: any;
  export default _default;
}
