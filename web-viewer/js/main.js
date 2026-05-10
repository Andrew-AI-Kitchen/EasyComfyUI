/**
 * EasyComfyUI - Main Entry Point
 *
 * Initializes the canvas, wires up parser/layout/renderer/interactions,
 * exposes window.renderWorkflow(json), and binds the file input.
 */

import { THEME } from './theme.js'
import { normalizeWorkflow, createDemoWorkflow } from './parser.js'
import { precomputeNodeLayouts, precomputeGroupLayouts } from './layout.js'
import { drawGrid, drawGroups, drawLinks, drawNodes, drawInfo, setHitboxState, setSearchState } from './renderer.js'
import { setupInteractions } from './interactions.js'

// ── Shared state ───────────────────────────────────────────────────
const state = {
  canvas: null,
  ctx: null,
  workflowData: null,

  // View transform
  viewX: 0,
  viewY: 0,
  viewScale: 1,

  // Mouse pan state
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartViewX: 0,
  panStartViewY: 0,

  // Touch state
  touches: [],
  lastPinchDist: 0,
  pinchStartScale: 1,

  // Link hitboxes (world coordinates, populated by renderer)
  linkHitboxes: [],

  // Search state
  searchQuery: '',
  searchMatches: [],
  activeMatchIndex: -1,
}

// ── App version constants (single source of truth) ────────────────
const APP_NAME = 'EasyComfyUI'
const APP_VERSION = 'v0.1-alpha'
const APP_REPO_URL = 'https://github.com/Andrew-AI-Kitchen/EasyComfyUI'

// ── High-DPI canvas sizing ────────────────────────────────────────
function resizeCanvas() {
  const canvas = state.canvas
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 800
  const cssH = canvas.clientHeight || 600
  canvas.width = cssW * dpr
  canvas.height = cssH * dpr
  canvas._cssW = cssW
  canvas._cssH = cssH
  canvas._dpr = dpr
}

// ── Coordinate conversion ─────────────────────────────────────────
function screenToWorld(cssX, cssY) {
  const dpr = state.canvas._dpr || 1
  const bx = cssX * dpr
  const by = cssY * dpr
  const wx = (bx - state.viewX) / state.viewScale
  const wy = (by - state.viewY) / state.viewScale
  return [wx, wy]
}

// ── Apply view transform ──────────────────────────────────────────
function applyViewTransform() {
  state.ctx.setTransform(state.viewScale, 0, 0, state.viewScale, state.viewX, state.viewY)
}

// ── Fit-to-view ───────────────────────────────────────────────────
function fitView(nodes, padding) {
  padding = padding || 80
  if (!nodes || nodes.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodes) {
    const [nx, ny] = node.pos
    const [nw, nh] = node.size
    if (nx < minX) minX = nx
    if (ny < minY) minY = ny
    if (nx + nw > maxX) maxX = nx + nw
    if (ny + nh > maxY) maxY = ny + nh
  }

  const contentW = maxX - minX
  const contentH = maxY - minY
  const dpr = state.canvas._dpr || 1
  const cssW = state.canvas._cssW || 800
  const cssH = state.canvas._cssH || 600
  const viewW = (cssW * dpr) - padding * 2 * dpr
  const viewH = (cssH * dpr) - padding * 2 * dpr

  state.viewScale = Math.min(viewW / contentW, viewH / contentH, 1.0)
  state.viewScale = Math.max(state.viewScale, 0.1)
  state.viewX = ((cssW * dpr) - contentW * state.viewScale) / 2 - minX * state.viewScale
  state.viewY = ((cssH * dpr) - contentH * state.viewScale) / 2 - minY * state.viewScale
}

// ── Fit view using current workflow data ──────────────────────────
function fitViewCurrent() {
  if (!state.workflowData) return
  let nodes
  if (state.workflowData.demo === true) {
    nodes = createDemoWorkflow().nodes
  } else {
    nodes = state.workflowData.nodes
  }
  if (nodes) fitView(nodes)
}

// ── Open URL (browser or Android bridge) ──────────────────────────
function openUrl(url) {
  console.log('openUrl', url)
  console.log('AndroidBridge exists', !!window.AndroidBridge)
  console.log('openExternalUrl type', typeof window.AndroidBridge?.openExternalUrl)

  // Security: only allow http:// and https://
  if (!url || !/^https?:\/\//i.test(url)) {
    console.warn('openUrl: blocked non-http(s) URL:', url)
    return
  }

  if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.openExternalUrl === 'function') {
    // Android WebView bridge
    window.AndroidBridge.openExternalUrl(url)
  } else {
    // Browser fallback — open in new tab with noopener for security
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// ── Search helpers ────────────────────────────────────────────────

/**
 * Safely collect widget values for search indexing.
 * widgets_values can be: undefined, array, object, string, number, boolean.
 * Returns an array of values safe to iterate.
 */
function collectWidgetValuesForSearch(widgetsValues) {
  if (!widgetsValues) return []
  if (Array.isArray(widgetsValues)) return widgetsValues
  if (typeof widgetsValues === 'object') return Object.values(widgetsValues)
  return [widgetsValues]
}

/**
 * Safely stringify a value for search text, handling objects without throwing.
 * For objects, returns a summary of keys/values.
 */
function safeStringifyForSearch(val) {
  try {
    if (val === null || val === undefined) return ''
    if (typeof val === 'object') {
      const keys = Object.keys(val)
      if (keys.length === 0) return '{}'
      return keys.map(k => `${k}:${val[k] != null ? val[k] : ''}`).join(' ')
    }
    return String(val)
  } catch (e) {
    return ''
  }
}

/**
 * Build a single lowercase search text from all searchable node fields.
 * Wrapped in try/catch — any exception sets _searchText to '' and logs a warning.
 */
function buildSearchText(node) {
  try {
    const parts = []
    if (node._displayTitle) parts.push(node._displayTitle)
    if (node._resolvedTitle && node._resolvedTitle !== node._displayTitle) parts.push(node._resolvedTitle)
    if (node.title && node.title !== node._displayTitle) parts.push(node.title)
    if (node.type) parts.push(node.type)
    if (node.inputs) {
      for (const inp of node.inputs) {
        if (inp.name) parts.push(inp.name)
        if (inp.label) parts.push(inp.label)
        if (inp.type) parts.push(inp.type)
      }
    }
    if (node.outputs) {
      for (const out of node.outputs) {
        if (out.name) parts.push(out.name)
        if (out.label) parts.push(out.label)
        if (out.type) parts.push(out.type)
      }
    }
    if (node._widgets) {
      for (const w of node._widgets) {
        if (w.label || w.name) parts.push(w.label || w.name)
        if (w.value != null) parts.push(safeStringifyForSearch(w.value))
      }
    }
    // Safely iterate widgets_values using the helper
    const wv = collectWidgetValuesForSearch(node.widgets_values)
    for (const v of wv) {
      if (v != null) parts.push(safeStringifyForSearch(v))
    }
    // MarkdownNote body text
    if (node._noteLines) {
      for (const line of node._noteLines) {
        if (line.text) parts.push(line.text)
        if (line.segments) {
          for (const seg of line.segments) {
            if (seg.text) parts.push(seg.text)
          }
        }
      }
    }
    return parts.join(' ').toLowerCase()
  } catch (e) {
    console.warn('buildSearchText failed for node', node.id, node.title, e)
    return ''
  }
}

/**
 * Perform search across all nodes, updating searchMatches and activeMatchIndex.
 */
function performSearch(query) {
  state.searchQuery = query
  const trimmed = query.trim().toLowerCase()

  // Clear old flags
  if (state.workflowData) {
    const nodes = state.workflowData.demo ? createDemoWorkflow().nodes : state.workflowData.nodes
    for (const node of nodes) {
      node._searchMatched = false
      node._searchActive = false
    }
  }
  state.searchMatches = []
  state.activeMatchIndex = -1

  if (!trimmed) {
    updateSearchUI()
    render()
    return
  }

  if (!state.workflowData) { updateSearchUI(); render(); return }

  const nodes = state.workflowData.demo ? createDemoWorkflow().nodes : state.workflowData.nodes
  for (const node of nodes) {
    const searchText = node._searchText || ''
    if (searchText.includes(trimmed)) {
      node._searchMatched = true
      state.searchMatches.push(node)
    }
  }

  if (state.searchMatches.length > 0) {
    state.activeMatchIndex = 0
    state.searchMatches[0]._searchActive = true
  }

  updateSearchUI()
  render()
}

// Expose performSearch globally so the Nodes panel can trigger search
window.performSearch = performSearch

/**
 * Cycle to the next search match and focus on it.
 */
function focusNextMatch() {
  if (state.searchMatches.length === 0) return

  // Deactivate current
  if (state.activeMatchIndex >= 0 && state.activeMatchIndex < state.searchMatches.length) {
    state.searchMatches[state.activeMatchIndex]._searchActive = false
  }

  state.activeMatchIndex = (state.activeMatchIndex + 1) % state.searchMatches.length
  const node = state.searchMatches[state.activeMatchIndex]
  node._searchActive = true

  focusOnNode(node)
  updateSearchUI()
}

/**
 * Center the view on a specific node with a reasonable zoom level.
 */
function focusOnNode(node) {
  const canvas = state.canvas
  if (!canvas) return
  const dpr = canvas._dpr || 1
  const cssW = canvas._cssW || 800
  const cssH = canvas._cssH || 600
  const [nx, ny] = node.pos
  const [nw, nh] = node.size
  const padding = 60

  const targetScale = Math.min(
    (cssW * dpr - padding * 2 * dpr) / (nw + padding),
    (cssH * dpr - padding * 2 * dpr) / (nh + padding),
    1.0
  )
  state.viewScale = Math.max(0.8, targetScale)

  const cx = (cssW / 2) * dpr
  const cy = (cssH / 2) * dpr
  state.viewX = cx - (nx + nw / 2) * state.viewScale
  state.viewY = cy - (ny + nh / 2) * state.viewScale

  render()
}

/**
 * Update the search count display in the UI.
 */
function updateSearchUI() {
  const countEl = document.getElementById('search-count')
  if (!countEl) return
  const total = state.searchMatches.length
  const idx = state.activeMatchIndex
  if (total === 0) {
    countEl.textContent = state.searchQuery.trim() ? '0 matches' : ''
  } else {
    countEl.textContent = `${idx + 1}/${total}`
  }
}

// ── Main render ───────────────────────────────────────────────────
function render() {
  const ctx = state.ctx
  const canvas = state.canvas
  if (!ctx || !canvas) return
  const json = state.workflowData
  if (!json) return

  const dpr = canvas._dpr || 1

  // Clear link hitboxes before each render
  state.linkHitboxes = []

  // Clear entire backing store
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = THEME.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Resolve workflow data
  const parsed = normalizeWorkflow(json)
  if (!parsed) {
    ctx.fillStyle = THEME.errorText
    ctx.font = (16 * dpr) + 'px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('Invalid workflow JSON: missing nodes array', canvas.width / 2, canvas.height / 2)
    ctx.textAlign = 'left'
    return
  }

  const { nodes, links, groups, definitions } = parsed

  // Pre-compute search text for each node (after layout, before render)
  // Wrapped in try/catch so search index build failure never crashes workflow rendering
  try {
    for (const node of nodes) {
      node._searchText = buildSearchText(node)
    }
  } catch (e) {
    console.warn('Search text pre-computation failed:', e)
  }

  // Apply view transform
  applyViewTransform()

  // Draw grid
  drawGrid(ctx, state.viewX, state.viewY, state.viewScale, canvas)

  // Draw groups (behind nodes)
  drawGroups(ctx, groups)

  // Draw links (behind nodes)
  drawLinks(ctx, nodes, links)

  // Draw nodes
  drawNodes(ctx, nodes)

  // Info overlay (screen space)
  drawInfo(ctx, nodes, links, groups, state.viewScale, canvas)
}

// ── Zoom control API ──────────────────────────────────────────────
const ZOOM_IN_FACTOR = 1.2
const ZOOM_OUT_FACTOR = 1 / 1.2

window.viewerZoomIn = function () {
  const canvas = state.canvas
  if (!canvas) return
  const dpr = canvas._dpr || 1
  const cssW = canvas._cssW || 800
  const cssH = canvas._cssH || 600
  // Zoom centered on canvas center
  const cx = (cssW / 2) * dpr
  const cy = (cssH / 2) * dpr
  const wx = (cx - state.viewX) / state.viewScale
  const wy = (cy - state.viewY) / state.viewScale
  const newScale = Math.max(0.1, Math.min(4.0, state.viewScale * ZOOM_IN_FACTOR))
  state.viewX = cx - wx * newScale
  state.viewY = cy - wy * newScale
  state.viewScale = newScale
  render()
}

window.viewerZoomOut = function () {
  const canvas = state.canvas
  if (!canvas) return
  const dpr = canvas._dpr || 1
  const cssW = canvas._cssW || 800
  const cssH = canvas._cssH || 600
  const cx = (cssW / 2) * dpr
  const cy = (cssH / 2) * dpr
  const wx = (cx - state.viewX) / state.viewScale
  const wy = (cy - state.viewY) / state.viewScale
  const newScale = Math.max(0.1, Math.min(4.0, state.viewScale * ZOOM_OUT_FACTOR))
  state.viewX = cx - wx * newScale
  state.viewY = cy - wy * newScale
  state.viewScale = newScale
  render()
}

window.viewerFit = function () {
  if (!state.workflowData) return
  fitViewCurrent()
  render()
}

// ── Public API ────────────────────────────────────────────────────
window.renderWorkflow = function (json) {
  console.log('renderWorkflow called', json)

  const canvas = document.getElementById('graph-canvas')
  if (!canvas) {
    console.error('Failed to get canvas element: #graph-canvas')
    return
  }

  state.canvas = canvas
  resizeCanvas()

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Failed to get 2D rendering context')
    return
  }
  state.ctx = ctx

  state.workflowData = json

  // Normalize first to resolve subgraph titles (_resolvedTitle)
  const parsed = normalizeWorkflow(json)
  if (!parsed) {
    console.error('renderWorkflow: invalid workflow JSON')
    return
  }

  const { nodes, groups, definitions } = parsed

  if (nodes && nodes.length > 0) {
    // Pre-compute all text layouts once (never re-wrapped on zoom)
    precomputeNodeLayouts(ctx, nodes)
    // Pre-compute group title layouts
    if (groups && groups.length > 0) {
      precomputeGroupLayouts(ctx, groups)
    }
    fitView(nodes)
  }

  render()

  // Store parsed data for external access (e.g., node classifier)
  state._parsedWorkflow = parsed

  // Notify Android that a workflow was loaded (so it can record history)
  // Only for non-demo workflows
  if (json && json.demo !== true && window.AndroidBridge &&
      typeof window.AndroidBridge.onWorkflowLoaded === 'function') {
    window.AndroidBridge.onWorkflowLoaded()
  }
}

// ── Canvas initialization ─────────────────────────────────────────
function initializeCanvas() {
  const canvas = document.getElementById('graph-canvas')
  if (!canvas) return

  state.canvas = canvas
  resizeCanvas()
  state.ctx = canvas.getContext('2d')

  // Share state with renderer for hitbox recording and search state
  setHitboxState(state)
  setSearchState(state)

  // Set up interactions (pass openUrl for link clicks)
  setupInteractions(canvas, state, render, fitViewCurrent, openUrl)

  // ── Search UI event handlers ──
  const searchInput = document.getElementById('search-input')
  const searchNextBtn = document.getElementById('search-next-btn')
  const searchClearBtn = document.getElementById('search-clear-btn')

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      performSearch(this.value)
    })
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault()
        focusNextMatch()
      }
    })
  }

  if (searchNextBtn) {
    searchNextBtn.addEventListener('click', focusNextMatch)
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', function () {
      if (searchInput) {
        searchInput.value = ''
        performSearch('')
        searchInput.focus()
      }
    })
  }

  // Resize handler
  window.addEventListener('resize', function () {
    if (state.canvas) {
      resizeCanvas()
      if (state.workflowData) render()
    }
  })
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCanvas)
} else {
  initializeCanvas()
}
