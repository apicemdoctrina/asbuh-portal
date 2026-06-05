import { createNonceStateCodec, type OAuthState } from "./oauth-state.js";

export type TochkaState = OAuthState;

const codec = createNonceStateCodec<TochkaState>();

export const signTochkaState = codec.sign;
export const verifyTochkaState = codec.verify;
