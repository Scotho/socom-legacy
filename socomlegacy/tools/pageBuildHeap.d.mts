// The types of `pageBuildHeap.mjs` (LATER 1158, 1210) for the tools' typecheck and tests.
export declare const PAGE_BUILD_HEAP_SHARE: number;
export declare const PAGE_BUILD_HEAP_CAP_MB: number;
export declare const PAGE_BUILD_NATIVE_RESERVE_MB: number;
export declare const PAGE_BUILD_SWAP_MIN_MB: number;
export interface PageBuildMemInfo { availableMb: number; swapFreeMb: number }
export declare function memInfoMb(text: string | undefined): PageBuildMemInfo | null;
export declare function pageBuildHeapMb(nodeOptions: string | undefined, usableMb: number, defaultMb: number, mem?: PageBuildMemInfo | null): number | null;
export declare function buildKilledMessage(signal: string, heapMb: number | null, mem: PageBuildMemInfo | null): string;
export declare function usableMemoryMb(totalBytes: number, constrainedBytes: number | undefined): number;
