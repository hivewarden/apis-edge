// Mock for qrcode module — Canvas doesn't exist in jsdom
export const toCanvas = () => Promise.resolve();
export const toDataURL = () => Promise.resolve('data:image/png;base64,mock');
export default { toCanvas, toDataURL };
