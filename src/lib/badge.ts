const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

/** يقبل رابط البطاقة كاملًا (…/b/CODE) أو الرمز وحده، مع المسافات أو دونها */
export function parseBadgeCode(text: string): string | null {
  const fromUrl = text.match(/\/b\/([A-Za-z0-9]{8})(?:[/?#]|$)/);
  const code = (fromUrl ? fromUrl[1] : text.replace(/[\s-]/g, "")).toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

