import { describe, expect, it } from 'vitest';
import { e2eRenderer } from '../e2e/renderer';

describe('explicit browser-test renderer selection', () => {
  it('keeps the existing SwiftShader launch flags when unset', () => {
    expect(e2eRenderer(undefined, 'win32')).toEqual({
      request: 'swiftshader',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
  });
  it.each(['win32', 'darwin', 'linux'] as const)('permits explicit SwiftShader on %s', platform => {
    expect(e2eRenderer('swiftshader', platform)).toEqual(e2eRenderer(undefined, platform));
  });
  it('selects the Windows D3D11 backend only when requested', () => {
    expect(e2eRenderer('d3d11', 'win32')).toEqual({
      request: 'd3d11', args: ['--use-gl=angle', '--use-angle=d3d11'],
    });
  });
  it.each(['darwin', 'linux'] as const)('refuses D3D11 on %s rather than silently falling back', platform => {
    expect(() => e2eRenderer('d3d11', platform)).toThrow(/d3d11.*Windows/);
  });
  it('selects ANGLE on Vulkan (and WebGPU) only on a Linux host, when requested', () => {
    expect(e2eRenderer('vulkan', 'linux')).toEqual({
      request: 'vulkan',
      args: ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
        '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
    });
  });
  it.each(['win32', 'darwin'] as const)('refuses Vulkan on %s rather than silently falling back', platform => {
    expect(() => e2eRenderer('vulkan', platform)).toThrow(/vulkan.*Linux/);
  });
  it.each(['', 'hardware', 'D3D11', 'Vulkan', '--disable-gpu'])('rejects unsupported renderer %j', request => {
    expect(() => e2eRenderer(request, 'win32')).toThrow(/S2U_E2E_RENDERER.*swiftshader.*d3d11.*vulkan/);
  });
});
