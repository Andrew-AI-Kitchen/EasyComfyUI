/**
 * node-classifier.js
 *
 * Classifies workflow nodes into 4 categories:
 *   1. Built-in Core   — matches the static ComfyUI core node whitelist
 *   2. Subgraph        — node.type matches a subgraph id in workflow.definitions.subgraphs
 *   3. Known Custom    — matches heuristic patterns for known custom node packs
 *   4. Unknown / likely custom — everything else
 *
 * Best-effort classification based on local snapshot.
 * Custom node detection may be incomplete.
 */

import CORE_NODES from '../data/comfyui-core-nodes.json' with { type: 'json' }

// ── Known custom node heuristic patterns ──────────────────────────
// These are checked against node.type (and fallback node.title / node._resolvedTitle).
// Each entry is a regex pattern. Add more patterns as the community grows.
const KNOWN_CUSTOM_PATTERNS = [
  /^rgthree/i,
  /^VHS_/i,
  /^VideoCombine/i,
  /^Power[_\s]?Lora/i,
  /^KJ/i,
  /^SageAttention/i,
  /^TorchSettings/i,
  /pysssss/i,
  /^easy/i,
  /^Impact/i,
  /^WanVideo/i,
  /^Florence/i,
  /^IPAdapter/i,
  /^ControlNetAux/i,
  /^ComfyUI-/i,
  /^CR_/i,
  /^efficiency/i,
  /^was[_\s]/i,
  /^mtb/i,
  /^segs/i,
  /^ultralytics/i,
  /^LayerDiffuse/i,
  /^AnimateDiff/i,
  /^DynamicPrompts/i,
  /^ImageResizePlus/i,
  /^Tiled/i,
  /^Noise/i,
  /^BRIA/i,
  /^BiRefNet/i,
  /^Depth/i,
  /^Canny/i,
  /^SAM/i,
  /^Grounding/i,
  /^Ollama/i,
  /^Gemini/i,
  /^TeaCache/i,
  /^Diffusion/i,
  /^LCM/i,
  /^InstantID/i,
  /^PhotoMaker/i,
  /^PuLID/i,
  /^FaceAnalysis/i,
  /^Remap/i,
  /^ImageSelector/i,
]

// ── Core node set (for fast lookup) ───────────────────────────────
const coreNodeSet = new Set(CORE_NODES.nodes || [])

// ── Classification result types ───────────────────────────────────
/**
 * @typedef {Object} ClassifiedNode
 * @property {string} type       - The node.type value
 * @property {string} displayName - Human-readable name (title or type)
 * @property {string} category   - 'builtin' | 'subgraph' | 'knownCustom' | 'unknown'
 * @property {string} [subgraphName] - Subgraph name if category is 'subgraph'
 */

/**
 * @typedef {Object} ClassificationSummary
 * @property {ClassifiedNode[]} builtin
 * @property {ClassifiedNode[]} subgraph
 * @property {ClassifiedNode[]} knownCustom
 * @property {ClassifiedNode[]} unknown
 */

// ── Heuristic match helper ────────────────────────────────────────
function matchesKnownCustom(nodeType) {
  if (!nodeType) return false
  for (const pattern of KNOWN_CUSTOM_PATTERNS) {
    if (pattern.test(nodeType)) return true
  }
  return false
}

// ── Main classifier ───────────────────────────────────────────────
/**
 * Classify an array of workflow nodes into 4 categories.
 *
 * @param {Array} nodes        - Array of node objects from normalizeWorkflow()
 * @param {Array} subgraphs    - Array of { id, name } from workflow.definitions.subgraphs
 * @returns {ClassificationSummary}
 */
export function classifyNodes(nodes, subgraphs) {
  const result = {
    builtin: [],
    subgraph: [],
    knownCustom: [],
    unknown: [],
  }

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return result
  }

  // Build subgraph lookup map
  const subgraphMap = new Map()
  if (Array.isArray(subgraphs)) {
    for (const sg of subgraphs) {
      if (sg && sg.id != null) {
        subgraphMap.set(String(sg.id), sg.name || sg.id)
      }
    }
  }

  for (const node of nodes) {
    if (!node || !node.type) continue

    const nodeType = String(node.type)
    const displayName = node._resolvedTitle || node.title || nodeType

    // 1. Built-in Core
    if (coreNodeSet.has(nodeType)) {
      result.builtin.push({ type: nodeType, displayName, category: 'builtin' })
      continue
    }

    // 2. Subgraph
    const subgraphName = subgraphMap.get(nodeType)
    if (subgraphName !== undefined) {
      result.subgraph.push({
        type: nodeType,
        displayName: subgraphName || displayName,
        category: 'subgraph',
        subgraphName: subgraphName || undefined,
      })
      continue
    }

    // 3. Known Custom (heuristic)
    if (matchesKnownCustom(nodeType) || matchesKnownCustom(displayName)) {
      result.knownCustom.push({ type: nodeType, displayName, category: 'knownCustom' })
      continue
    }

    // 4. Unknown / likely custom
    result.unknown.push({ type: nodeType, displayName, category: 'unknown' })
  }

  return result
}

/**
 * Get the total node count across all categories.
 */
export function getTotalClassified(summary) {
  if (!summary) return 0
  return (
    (summary.builtin?.length || 0) +
    (summary.subgraph?.length || 0) +
    (summary.knownCustom?.length || 0) +
    (summary.unknown?.length || 0)
  )
}
