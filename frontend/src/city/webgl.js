/** Can this browser draw the 3D city? Without it, home is the plain module menu. */
export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();   // give the probe's context back
    return true;
  } catch {
    return false;
  }
}
