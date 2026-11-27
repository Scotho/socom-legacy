import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import viewer from './vite.config';
import { xboxBuildManifest, xboxBuildStamp } from './xboxTestBuild';

/** Local experiment only. Its bundle has a separate output directory and is never
 * an input to npm run build or the release/deployment scripts.
 */
export default defineConfig(async env => {
  const config = await viewer(env);
  const build = xboxBuildStamp(args => execFileSync('git', [...args], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }), undefined, env.command !== 'build' || process.env.XBOX_ALLOW_DIRTY_BUILD === '1');
  const manifest: Plugin = { name: 'xbox-test-build-identity', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'xbox-test-build.json', source: xboxBuildManifest(build) });
  } };
  return {
    ...config,
    define: { ...config.define, __XBOX_TEST_BUILD__: JSON.stringify(build), __VIEWER_COMMIT__: JSON.stringify(build.commit),
      __VIEWER_REV__: JSON.stringify(build.revision), __BUILD_STAMP__: JSON.stringify(build.builtAt.replace('T', ' ').slice(0, 19)) },
    plugins: [...(config.plugins ?? []), manifest],
    build: {
      ...config.build,
      outDir: fileURLToPath(new URL('../../dist/xbox-experiment', import.meta.url)),
      rollupOptions: {
        ...config.build?.rollupOptions,
        input: { xboxPrototype: fileURLToPath(new URL('./xbox-renderer/index.html', import.meta.url)) },
      },
    },
  };
});
