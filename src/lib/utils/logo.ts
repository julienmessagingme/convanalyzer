/**
 * Load the Mieux Assure logo as a base64 data URL.
 * Used by PDF generators (dashboard + conversation).
 */
export async function loadLogoAsBase64(): Promise<string | null> {
  try {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(`${basePath}/logo-mieux-assure.png`);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
