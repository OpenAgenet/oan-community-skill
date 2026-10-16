declare module "ed25519-signature-2020-context" {
  export function documentLoader(url: string): Promise<{
    contextUrl: string | null;
    documentUrl: string;
    document: unknown;
  }>;
}
