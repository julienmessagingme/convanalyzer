/**
 * Load the Mieux Assure logo as a base64 data URL.
 * Used by PDF generators (dashboard + conversation), which run client-side
 * only. The browser-only guard below makes this safe to import (transitively)
 * from server code: if FileReader is unavailable we return null instead of
 * throwing `FileReader is not defined`. Pairs with the jspdf webpack
 * externals in next.config.mjs to keep the PDF code path resilient against
 * accidental server-side imports in the future.
 */
export async function loadLogoAsBase64(): Promise<string | null> {
  if (typeof window === "undefined" || typeof FileReader === "undefined") {
    return null;
  }
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
