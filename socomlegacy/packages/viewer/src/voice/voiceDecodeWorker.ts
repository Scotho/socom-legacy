import { serveVoiceDecode, type VoiceDecodeScope } from './voiceCodec';

/**
 * **The listener's decode's worker entry** (VOICE-LATE-4 row 2, web sprint 18; research 226 §3.5;
 * `VOICE_DECODE_WORKER_ADAPTATION`, a labelled browser adaptation): a dedicated module worker the voice client starts with
 * `new Worker(new URL('./voiceDecodeWorker.ts', import.meta.url), { type: 'module' })` (`./voiceClient`
 * `pageDecodeWorker`), as `../worker.ts`, `../movieWorker.ts` and `../discCopyWorker.ts` are started, so a build bundles
 * it. It serves this thread's scope and nothing else: the decoder, its owed matching, the recover flush and the
 * talk's-end drain are `./voiceCodec`'s `serveVoiceDecode`, run here on this worker's loop and clock with this scope's
 * WebCodecs; that module has no side effect on import and makes no worker. Only this file is loaded as the worker: no
 * module imports it.
 */
serveVoiceDecode(self as unknown as VoiceDecodeScope);
