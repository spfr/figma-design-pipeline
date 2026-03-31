export const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular",
  500: "Medium", 600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black",
};

export function weightToFontStyle(weight: number): string {
  const snapped = Math.round(weight / 100) * 100;
  return WEIGHT_TO_STYLE[snapped] || "Regular";
}
