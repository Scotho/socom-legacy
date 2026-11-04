export type E2eRenderer = 'swiftshader' | 'd3d11' | 'vulkan';

/** Browser-test adaptation only. These flags request a backend; they neither
 * prove the actual GPU selected nor establish original-game rendering fidelity:
 * a run's result still records the renderer string the page reports.
 * Keep the existing software renderer unless the test host opts in explicitly:
 * `d3d11` on a Windows host, `vulkan` on a Linux GPU box (WebGL2 through ANGLE on
 * Vulkan, WebGPU on Dawn/Vulkan).
 */
export function e2eRenderer(request: string | undefined, platform: NodeJS.Platform = process.platform): {
  request: E2eRenderer; args: string[];
} {
  const selected = request === undefined ? 'swiftshader' : request;
  if (selected !== 'swiftshader' && selected !== 'd3d11' && selected !== 'vulkan') {
    throw Error('S2U_E2E_RENDERER must be swiftshader, d3d11 or vulkan');
  }
  if (selected === 'd3d11' && platform !== 'win32') {
    throw Error('S2U_E2E_RENDERER=d3d11 is supported only on Windows test hosts');
  }
  if (selected === 'vulkan' && platform !== 'linux') {
    throw Error('S2U_E2E_RENDERER=vulkan is supported only on Linux test hosts');
  }
  return {
    request: selected,
    args: selected === 'swiftshader'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : selected === 'd3d11'
        ? ['--use-gl=angle', '--use-angle=d3d11']
        : ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
          '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  };
}
