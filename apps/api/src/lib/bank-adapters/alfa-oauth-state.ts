import { createJwtStateCodec, type OAuthState } from "./oauth-state.js";

export type AlfaState = OAuthState;

const codec = createJwtStateCodec<AlfaState>("alfa-oauth");

export const signAlfaState = codec.sign;
export const verifyAlfaState = codec.verify;
