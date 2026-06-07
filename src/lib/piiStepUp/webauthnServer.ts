import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { getWebAuthnOrigin, getWebAuthnRpId } from './config';
import {
  consumeWebAuthnChallenge,
  getWebAuthnCredentialById,
  listUserWebAuthnCredentials,
  saveWebAuthnChallenge,
  saveWebAuthnCredential,
  updateWebAuthnCounter,
  userHasWebAuthnCredential,
} from './webauthnStore';

export async function buildRegistrationOptions(uid: string, userName: string) {
  const existing = await listUserWebAuthnCredentials(uid);
  const options = await generateRegistrationOptions({
    rpName: 'Pitaya OS',
    rpID: getWebAuthnRpId(),
    userName: uid,
    userDisplayName: userName || uid,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: existing.map(c => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  });

  await saveWebAuthnChallenge(uid, options.challenge, 'registration');
  return options;
}

export async function verifyRegistration(
  uid: string,
  response: RegistrationResponseJSON,
) {
  const expectedChallenge = await consumeWebAuthnChallenge(uid, 'registration');
  if (!expectedChallenge) {
    throw new Error('등록 세션이 만료되었습니다. 다시 시도하세요.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('지문 등록 검증에 실패했습니다.');
  }

  const { credential } = verification.registrationInfo;
  await saveWebAuthnCredential(uid, {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: response.response.transports as string[] | undefined,
    createdAt: Date.now(),
  });

  return true;
}

export async function buildAuthenticationOptions(uid: string) {
  const creds = await listUserWebAuthnCredentials(uid);
  if (creds.length === 0) {
    return { needsRegistration: true as const, options: null };
  }

  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    userVerification: 'required',
    allowCredentials: creds.map(c => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  });

  await saveWebAuthnChallenge(uid, options.challenge, 'authentication');
  return { needsRegistration: false as const, options };
}

export async function verifyAuthentication(
  uid: string,
  response: AuthenticationResponseJSON,
) {
  const expectedChallenge = await consumeWebAuthnChallenge(uid, 'authentication');
  if (!expectedChallenge) {
    throw new Error('인증 세션이 만료되었습니다. 다시 시도하세요.');
  }

  const stored = await getWebAuthnCredentialById(uid, response.id);
  if (!stored) {
    throw new Error('등록된 지문 정보를 찾을 수 없습니다.');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    requireUserVerification: true,
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
      transports: stored.transports as AuthenticatorTransport[] | undefined,
    },
  });

  if (!verification.verified) {
    throw new Error('지문 인증에 실패했습니다.');
  }

  await updateWebAuthnCounter(stored.docId, verification.authenticationInfo.newCounter);
  return true;
}

export { userHasWebAuthnCredential };
