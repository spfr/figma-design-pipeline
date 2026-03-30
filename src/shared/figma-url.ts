/**
 * Parse a Figma URL to extract file key and optional node ID.
 *
 * Supported URL formats:
 *   https://www.figma.com/design/ABC123xyz/File-Name
 *   https://www.figma.com/design/ABC123xyz/File-Name?node-id=1817:2817
 *   https://www.figma.com/file/ABC123xyz/File-Name
 *   https://figma.com/design/ABC123xyz
 *   ABC123xyz  (bare file key)
 */

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
  fileName?: string;
}

const FIGMA_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)(?:\/([^?#]*))?/;

const NODE_ID_RE = /[?&]node-id=([0-9]+(?:[:-][0-9]+)?)/;

export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  const trimmed = input.trim();

  // Try as URL first
  const urlMatch = trimmed.match(FIGMA_URL_RE);
  if (urlMatch) {
    const fileKey = urlMatch[1];
    const fileName = urlMatch[2] ? decodeURIComponent(urlMatch[2].replace(/-/g, " ")) : undefined;

    // Extract node-id from query params
    const nodeMatch = trimmed.match(NODE_ID_RE);
    const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ":") : undefined;

    return { fileKey, nodeId, fileName };
  }

  // Treat as bare file key (alphanumeric, typically 22 chars)
  if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) {
    return { fileKey: trimmed };
  }

  throw new Error(
    `Cannot parse Figma URL: "${trimmed}". Expected a Figma design URL or file key.`
  );
}
