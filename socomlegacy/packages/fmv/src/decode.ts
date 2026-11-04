/**
 * PLAT-19b, the MPEG-2 decoder in the page (web research 120): the decoder behind `Mpeg2Engine` (`decodeEngine`), the
 * core that feeds it PLAT-18's packets and answers pictures in display order (`decodeStream`), the worker's protocol
 * (`decodeProtocol`), and the IPU's colour conversion (`ipuCsc`, moved from `tools/fmvPlanes.ts`). One module, so the
 * package index takes one line for the task (W9.R4).
 */
export * from './decodeEngine';
export * from './decodeStream';
export * from './decodeProtocol';
export * from './ipuCsc';
export * from './realtime';
