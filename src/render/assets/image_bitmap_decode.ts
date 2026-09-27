// Off-main-thread image decode for loadBitmapTexture (loader.ts). An image
// element decodes inside the WebGL upload call, on the main thread; a
// createImageBitmap decode runs off it, so the upload that follows is a copy.
// three never sets the unpack flags for an ImageBitmap source (WebGL ignores
// them there), so the bitmap itself is decoded the way the image path
// uploads: flipped, unpremultiplied, and with no colour conversion, which is
// the unpack three picks for every sRGB or linear texture (their primaries
// match the working space) and for NoColorSpace alike.

export const BITMAP_DECODE_OPTIONS: ImageBitmapOptions = {
  imageOrientation: 'flipY',
  premultiplyAlpha: 'none',
  colorSpaceConversion: 'none',
};

/** Whether createImageBitmap honours those options here: three's own gate for
 *  its GLTFLoader (Safari before 17 and Firefox before 98 do not). */
export function imageBitmapDecodeSupported(
  userAgent: string | undefined,
  hasCreateImageBitmap: boolean,
): boolean {
  if (!hasCreateImageBitmap) return false;
  if (!userAgent) return true;
  if (/^((?!chrome|android).)*safari/i.test(userAgent)) {
    const version = userAgent.match(/Version\/(\d+)/);
    return !!version && Number(version[1]) >= 17;
  }
  const firefox = userAgent.match(/Firefox\/(\d+)/);
  return !firefox || Number(firefox[1]) >= 98;
}

export function browserDecodesImageBitmap(): boolean {
  return imageBitmapDecodeSupported(
    typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    typeof createImageBitmap === 'function',
  );
}

export async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`image fetch failed: ${response.status} ${url}`);
  return response.blob();
}
