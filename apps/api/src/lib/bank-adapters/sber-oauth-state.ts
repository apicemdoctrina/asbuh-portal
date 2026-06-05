import { createJwtStateCodec, type OAuthState } from "./oauth-state.js";

export type SberState = OAuthState;

const codec = createJwtStateCodec<SberState>("sber-oauth");

export const signSberState = codec.sign;
export const verifySberState = codec.verify;
