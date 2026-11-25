import { generateWallPixels } from './WallTextureGenerator.js';
self.onmessage = e => {
  const id = e.data?.id;
  try {
    const result = generateWallPixels(id, percent => self.postMessage({ id, percent }));
    const transfers = [result.color.buffer, result.bump.buffer];
    if (result.roughness) transfers.push(result.roughness.buffer);
    self.postMessage({ id, result }, transfers);
  } catch (error) {
    self.postMessage({ id, error: String(error.message || error) });
  }
};
