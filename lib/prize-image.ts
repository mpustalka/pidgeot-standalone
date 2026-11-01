// Leave headroom for multipart encoding and Netlify's buffered request limit.
export const maxUploadBytes = 3 * 1024 * 1024;

export async function preparePrizeImage(file: File): Promise<File> {
  if (file.size <= maxUploadBytes) return file;
  if (file.type === 'image/gif') {
    throw new Error('Animated GIFs must be 3 MB or smaller. Choose a smaller GIF or a JPG, PNG, or WebP.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable. Choose an image under 3 MB.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.size > maxUploadBytes) throw new Error('This image is too large to upload. Choose a smaller image.');
    return new File([blob], 'prize-image.webp', { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
