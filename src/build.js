/**
 * Build identity, used to catch a browser running a mixed set of files.
 *
 * The dev server injects this value into index.html as `<meta name="build">` on
 * the way out. If the value here and the value in the HTML disagree, the module
 * graph came from an older load than the document did — the failure that shows
 * up as a missing element and a blank chart. Bump this when the shape of the
 * modules changes; the check is a smoke alarm, not a version number.
 */
export const BUILD = '2026-10-28.1';

/**
 * Does the document's build stamp disagree with the loaded modules? A missing
 * meta tag means the page is served by something that does not inject one (the
 * production host, for instance), in which case there is nothing to compare.
 */
export function buildMismatch(metaContent, moduleBuild) {
  if (!metaContent) return false;
  return metaContent !== moduleBuild;
}
