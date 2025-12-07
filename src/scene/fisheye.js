// Fisheye module removed: provide a harmless stub so imports succeed but no post-processing occurs.
export function createFisheyePass() {
  console.warn('createFisheyePass: fisheye post-process has been removed. This is a no-op stub.');
  const noop = () => {};
  return {
    renderTarget: null,
    render: noop,
    setSize: noop,
    setStrength: noop,
    debugLog: () => console.info('FisheyePass stub: no render target available')
  };
}
