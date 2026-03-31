import type { Action } from "../shared/actions.js";

const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular",
  500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

interface CompiledBatch {
  dryRun: boolean;
  stopOnError: boolean;
  rollbackOnError: boolean;
  requiredFonts: Array<{ family: string; style: string }>;
  actions: Array<Record<string, unknown>>;
}

interface CompileOptions {
  dryRun?: boolean;
  stopOnError?: boolean;
  rollbackOnError?: boolean;
}

/** Compile validated actions into an optimized batch with font hoisting and symbolic refs. */
export function compileBatch(actions: Action[], options: CompileOptions = {}): CompiledBatch {
  const fonts = new Map<string, { family: string; style: string }>();
  const compiled: Array<Record<string, unknown>> = [];
  let refCounter = 0;

  // Actions that create nodes get a symbolic ref
  const CREATE_TYPES = new Set([
    "create_frame", "create_component_from_node", "create_component_set",
    "create_instance", "duplicate_node", "create_paint_style", "create_text_style", "create_effect_style",
    "create_page", "create_variable_collection", "create_variable",
  ]);

  for (const action of actions) {
    const entry = { ...action } as Record<string, unknown>;

    // Assign symbolic ref for create-type actions
    if (CREATE_TYPES.has(action.type)) {
      entry._ref = `$ref:node-${refCounter++}`;
    }

    // Hoist font requirements
    if (action.type === "set_text_style") {
      const family = action.fontFamily || "Inter";
      const weight = action.fontWeight || 400;
      const style = WEIGHT_TO_STYLE[Math.round(weight / 100) * 100] || "Regular";
      const key = `${family}|${style}`;
      if (!fonts.has(key)) fonts.set(key, { family, style });
    }
    if (action.type === "set_text_content") {
      // Default font will be loaded by the plugin from the node's existing font
      // No hoisting needed — plugin handles it
    }
    if (action.type === "create_text_style") {
      const family = action.fontFamily as string;
      const weight = (action.fontWeight as number) ?? 400;
      const style = WEIGHT_TO_STYLE[Math.round(weight / 100) * 100] || "Regular";
      const key = `${family}|${style}`;
      if (!fonts.has(key)) fonts.set(key, { family, style });
    }

    compiled.push(entry);
  }

  return {
    dryRun: options.dryRun ?? false,
    stopOnError: options.stopOnError ?? true,
    rollbackOnError: options.rollbackOnError ?? false,
    requiredFonts: Array.from(fonts.values()),
    actions: compiled,
  };
}
