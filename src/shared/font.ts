export const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular",
  500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

export function weightToFontStyle(weight: number): string {
  const snapped = Math.round(weight / 100) * 100;
  return WEIGHT_TO_STYLE[snapped] || "Regular";
}
