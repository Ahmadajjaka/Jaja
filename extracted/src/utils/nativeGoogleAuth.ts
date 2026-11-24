/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Capacitor bridge + pure error classification & signing diagnostics helpers for
 * Android Native Google Sign-In (Credential Manager + GoogleSignInClient).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeGoogleSignInResult {
  idToken: string;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  provider?: string;
}

export interface NativeSigningDiagnostics {
  packageName?: string;
  serverClientId?: string;
  googleServicesClientId?: string;
  hasGoogleServicesJson?: boolean;
  playServicesStatus?: number;
  runtimeSha1?: string;
  runtimeSha256?: string;
  cmError?: string;
  gmsStatusCode?: number;
  gmsMessage?: string;
}

export interface NativeGoogleAuthPluginInterface {
  signIn(options?: { serverClientId?: string }): Promise<NativeGoogleSignInResult>;
  signOut(options?: { serverClientId?: string }): Promise<void>;
  getSigningDiagnostics?(options?: { serverClientId?: string }): Promise<NativeSigningDiagnostics>;
}

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPluginInterface>('NativeGoogleAuth');

export const CUSTOM_WEB_CLIENT_ID_STORAGE_KEY = 'almamo_custom_oauth_web_client_id';

export function getStoredCustomWebClientId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem(CUSTOM_WEB_CLIENT_ID_STORAGE_KEY) || '').trim();
    }
  } catch {}
  return '';
}

export function setStoredCustomWebClientId(clientId: string): string {
  const clean = (clientId || '').trim();
  try {
    if (typeof localStorage !== 'undefined') {
      if (clean) {
        localStorage.setItem(CUSTOM_WEB_CLIENT_ID_STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(CUSTOM_WEB_CLIENT_ID_STORAGE_KEY);
      }
    }
  } catch {}
  return clean;
}

export function isNativeGoogleAuthAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!Capacitor.isNativePlatform()) return false;
    if (Capacitor.getPlatform() !== 'android') return false;
    if (typeof Capacitor.isPluginAvailable === 'function') {
      return Capacitor.isPluginAvailable('NativeGoogleAuth');
    }
    return true;
  } catch {
    return false;
  }
}

export type NativeGoogleErrorKind =
  | 'cancelled'
  | 'sha_or_config'
  | 'consent_or_gms_12500'
  | 'no_account'
  | 'network'
  | 'other';

export interface GoogleSignInStrategy {
  mode: 'native-android-only' | 'web-popup-redirect';
  allowBrowserFallback: boolean;
}

export function resolveGoogleSignInStrategy(options: {
  isAndroidApk: boolean;
  isNativePluginAvailable: boolean;
}): GoogleSignInStrategy {
  if (options.isAndroidApk || options.isNativePluginAvailable) {
    return {
      mode: 'native-android-only',
      allowBrowserFallback: false,
    };
  }
  return {
    mode: 'web-popup-redirect',
    allowBrowserFallback: true,
  };
}

export function extractNativeDiagnosticsFromError(err: any): NativeSigningDiagnostics | null {
  const raw = String(err?.message || err || '');
  const idx = raw.indexOf('[DIAG:');
  if (idx === -1) return null;
  const endIdx = raw.lastIndexOf(']');
  if (endIdx <= idx + 6) return null;
  const jsonStr = raw.slice(idx + 6, endIdx).trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? (parsed as NativeSigningDiagnostics) : null;
  } catch {
    return null;
  }
}

export function classifyNativeGoogleError(err: any): {
  kind: NativeGoogleErrorKind;
  code: string;
  rawMessage: string;
  diagnostics: NativeSigningDiagnostics | null;
} {
  const code = String(err?.code || '');
  const rawMessage = String(err?.message || err || '');
  const upper = `${code} ${rawMessage}`.toUpperCase();
  const diagnostics = extractNativeDiagnosticsFromError(err);

  if (
    code === 'USER_CANCELED' ||
    upper.includes('USER_CANCELED') ||
    upper.includes('SIGN_IN_CANCELLED') ||
    upper.includes('12501') ||
    upper.includes('CANCELLED') ||
    upper.includes('CANCELED')
  ) {
    return { kind: 'cancelled', code, rawMessage, diagnostics };
  }

  if (
    code === 'NETWORK_ERROR' ||
    upper.includes('NETWORK_ERROR') ||
    upper.includes('NETWORK') ||
    upper.includes('TIMEOUT')
  ) {
    return { kind: 'network', code, rawMessage, diagnostics };
  }

  if (
    code === 'NO_GOOGLE_ACCOUNT' ||
    upper.includes('NO_GOOGLE_ACCOUNT') ||
    upper.includes('NO_CREDENTIAL')
  ) {
    return { kind: 'no_account', code, rawMessage, diagnostics };
  }

  if (
    code === 'GMS_12500' ||
    upper.includes('12500') ||
    upper.includes('SIGN_IN_FAILED')
  ) {
    return { kind: 'consent_or_gms_12500', code, rawMessage, diagnostics };
  }

  if (
    code === 'DEVELOPER_ERROR' ||
    code === 'MISSING_ID_TOKEN' ||
    code === 'MISSING_CLIENT_ID' ||
    upper.includes('DEVELOPER_ERROR') ||
    upper.includes('SHA-1') ||
    upper.includes('SHA1') ||
    upper.includes('APIEXCEPTION: 10') ||
    upper.includes('10:')
  ) {
    return { kind: 'sha_or_config', code, rawMessage, diagnostics };
  }

  return { kind: 'other', code, rawMessage, diagnostics };
}

export async function getNativeApkSigningDiagnostics(
  serverClientId?: string
): Promise<NativeSigningDiagnostics | null> {
  if (!isNativeGoogleAuthAvailable() || typeof NativeGoogleAuth.getSigningDiagnostics !== 'function') {
    return null;
  }
  try {
    return await NativeGoogleAuth.getSigningDiagnostics(
      serverClientId ? { serverClientId } : {}
    );
  } catch {
    return null;
  }
}

export async function signInWithNativeGoogle(
  serverClientId?: string
): Promise<NativeGoogleSignInResult> {
  const customOverride = getStoredCustomWebClientId();
  const effectiveId = customOverride || serverClientId;
  return NativeGoogleAuth.signIn(
    effectiveId ? { serverClientId: effectiveId } : {}
  );
}

export async function signOutNativeGoogle(serverClientId?: string): Promise<void> {
  if (!isNativeGoogleAuthAvailable()) return;
  const customOverride = getStoredCustomWebClientId();
  const effectiveId = customOverride || serverClientId;
  await NativeGoogleAuth.signOut(effectiveId ? { serverClientId: effectiveId } : {});
}
