import type { RegistrationFiles } from './types.js';
/** Local-only references, not identity contents. Never send this manifest to a server. */
export interface RuntimeIdentityHandoff {
  version: 1;
  resourceDid: string;
  controllerDid?: string;
  materials: Array<{
    kind: 'did-document' | 'registration-vc' | 'oan-identity';
    path: string;
    sensitivity: 'public' | 'sensitive' | 'secret';
  }>;
  trust: 'requires-runtime-verification';
  instructions: string[];
}
export function createRuntimeIdentityHandoff(resourceDid: string, files: RegistrationFiles, controllerDid?: string): RuntimeIdentityHandoff {
  return {
    version: 1, resourceDid,
    ...(controllerDid ? { controllerDid } : {}),
    materials: [
      { kind: 'did-document', path: files.didDocument, sensitivity: 'public' },
      ...(files.registrationVc ? [{ kind: 'registration-vc' as const, path: files.registrationVc, sensitivity: 'sensitive' as const }] : []),
      ...(files.oanIdentity ? [{ kind: 'oan-identity' as const, path: files.oanIdentity, sensitivity: 'secret' as const }] : []),
    ],
    trust: 'requires-runtime-verification',
    instructions: [
      'Import only through a trusted local Runtime host after checking DID, key and registration evidence bindings.',
      'OAN Identity contains a private key. Keep the identity and registration VC secure; never upload identity files or this local-path manifest.',
      'Registration acceptance does not establish a mutually authenticated session. Runtime import tooling is a separate capability.',
    ],
  };
}
