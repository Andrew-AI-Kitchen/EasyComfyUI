/**
 * EasyComfyUI - Mouse & Touch Interactions
 *
 * Handles pan (mouse drag), zoom (mouse wheel), touch pan/pinch,
 * double-click fit-to-view, link click detection, and hover cursor.
 *
 * State is managed via a shared state object passed in by main.js.
 */

// Drag threshold in CSS pixels — movements smaller than this are treated as clicks
const DRAG_THRESHOLD = 5

/**
 * Set up all interaction event listeners on the canvas.
 */
export function setupInteractions(canvas, state, renderCallback, fitViewCallback, openUrlCallback) {
  canvas.style.cursor = 'grab'

  canvas.addEventListener('mousedown', function (e) { onMouseDown(e, canvas, state, renderCallback, openUrlCallback) })
  window.addEventListener('mousemove', function (e) { onMouseMove(e, state, renderCallback) })
  window.addEventListener('mouseup', function (e) { onMouseUp(e, canvas, state) })
  canvas.addEventListener('wheel', function (e) { onWheel(e, state, renderCallback) }, { passive: false })
  canvas.addEventListener('dblclick', function (e) { onDblClick(e, state, fitViewCallback, renderCallback) })

  // Hover cursor — mousemove on canvas checks link hitboxes
  canvas.addEventListener('mousemove', function (e) { onCanvasMouseMove(e, state) })

  canvas.addEventListener('touchstart', function (e) { onTouchStart(e, state, openUrlCallback) }, { passive: false })
  canvas.addEventListener('touchmove', function (e) { onTouchMove(e, state, renderCallback) }, { passive: false })
  canvas.addEventListener('touchend', function (e) { onTouchEnd(e, state) }, { passive: false })
  canvas.addEventListener('touchcancel', function (e) { onTouchEnd(e, state) }, { passive: false })
}

// ── Hit testing ────────────────────────────────────────────────────

/**
 * Convert a CSS client-space point to world coordinates and check
 * if it hits any link hitbox. Returns the matching hitbox or null.
 */
function hitTestLink(cssX, cssY, state) {
  const dpr = state.canvas._dpr || 1
  const rect = state.canvas.getBoundingClientRect()
  const bx = (cssX - rect.left) * dpr
  const by = (cssY - rect.top) * dpr
  const wx = (bx - state.viewX) / state.viewScale
  const wy = (by - state.viewY) / state.viewScale

  const hitboxes = state.linkHitboxes
  if (!hitboxes || hitboxes.length === 0) return null

  for (let i = 0; i < hitboxes.length; i++) {
    const h = hitboxes[i]
    if (wx >= h.x && wx <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) {
      return h
    }
  }
  return null
}

// ── Hover cursor ───────────────────────────────────────────────────

/**
 * Handle mousemove on the canvas to update cursor based on link hitboxes.
 */
function onCanvasMouseMove(e, state) {
  const hit = hitTestLink(e.clientX, e.clientY, state)
  if (hit) {
    state.canvas.style.cursor = 'pointer'
  } else if (state.isPanning) {
    state.canvas.style.cursor = 'grabbing'
  } else {
    state.canvas.style.cursor = 'grab'
  }
}

// ── Mouse ──────────────────────────────────────────────────────────

function onMouseDown(e, canvas, state, renderCallback, openUrlCallback) {
  if (e.button !== 0) return

  // Record start position for drag threshold detection
  state._mouseDownX = e.clientX
  state._mouseDownY = e.clientY
  state._mouseDownTime = Date.now()

  // Check for link hit first — synchronous, within user gesture
  if (openUrlCallback) {
    const hit = hitTestLink(e.clientX, e.clientY, state)
    if (hit) {
      openUrlCallback(hit.url)
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }

  state.isPanning = true
  state.panStartX = e.clientX
  state.panStartY = e.clientY
  state.panStartViewX = state.viewX
  state.panStartViewY = state.viewY
  canvas.style.cursor = 'grabbing'
  e.preventDefault()
}

function onMouseMove(e, state, renderCallback) {
  if (!state.isPanning) return

  // Check drag threshold — if movement is small, treat as click not pan
  const dx = Math.abs(e.clientX - state._mouseDownX)
  const dy = Math.abs(e.clientY - state._mouseDownY)
  if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return

  const dpr = state.canvas._dpr || 1
  const panDx = (e.clientX - state.panStartX) * dpr
  const panDy = (e.clientY - state.panStartY) * dpr
  state.viewX = state.panStartViewX + panDx
  state.viewY = state.panStartViewY + panDy
  renderCallback()
  e.preventDefault()
}

function onMouseUp(e, canvas, state) {
  if (e.button !== 0) return
  state.isPanning = false
  canvas.style.cursor = 'grab'
}

// ── Wheel ──────────────────────────────────────────────────────────

function onWheel(e, state, renderCallback) {
  e.preventDefault()
  const dpr = state.canvas._dpr || 1

  const rect = state.canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left)
  const my = (e.clientY - rect.top)

  const bx = mx * dpr
  const by = my * dpr

  const wx = (bx - state.viewX) / state.viewScale
  const wy = (by - state.viewY) / state.viewScale

  const delta = -e.deltaY
  const factor = delta > 0 ? 1.1 : 1 / 1.1
  const newScale = Math.max(0.1, Math.min(4.0, state.viewScale * factor))

  state.viewX = bx - wx * newScale
  state.viewY = by - wy * newScale
  state.viewScale = newScale

  renderCallback()
}

// ── Double-click ───────────────────────────────────────────────────

function onDblClick(e, state, fitViewCallback, renderCallback) {
  e.preventDefault()
  if (!state.workflowData) return
  fitViewCallback()
  renderCallback()
}

// ── Touch ──────────────────────────────────────────────────────────

function onTouchStart(e, state, openUrlCallback) {
  e.preventDefault()
  state.touches = Array.from(e.touches)

  if (state.touches.length === 1) {
    const touch = state.touches[0]

    // Record start for drag threshold
    state._touchStartX = touch.clientX
    state._touchStartY = touch.clientY
    state._touchStartTime = Date.now()
    state._touchLinkHandled = false

    // Check for link hit on touch start
    if (openUrlCallback) {
      const hit = hitTestLink(touch.clientX, touch.clientY, state)
      if (hit) {
        openUrlCallback(hit.url)
        state._touchLinkHandled = true
        return
      }
    }

    state.isPanning = true
    state.panStartX = touch.clientX
    state.panStartY = touch.clientY
    state.panStartViewX = state.viewX
    state.panStartViewY = state.viewY
  } else if (state.touches.length === 2) {
    state.isPanning = false
    state.lastPinchDist = getTouchDist(state.touches)
    state.pinchStartScale = state.viewScale
  }
}

function onTouchMove(e, state, renderCallback) {
  e.preventDefault()
  const newTouches = Array.from(e.touches)
  const dpr = state.canvas._dpr || 1

  if (newTouches.length === 1 && state.isPanning) {
    // Check drag threshold
    const dx = Math.abs(newTouches[0].clientX - state._touchStartX)
    const dy = Math.abs(newTouches[0].clientY - state._touchStartY)
    if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return

    const panDx = (newTouches[0].clientX - state.panStartX) * dpr
    const panDy = (newTouches[0].clientY - state.panStartY) * dpr
    state.viewX = state.panStartViewX + panDx
    state.viewY = state.panStartViewY + panDy
    renderCallback()
  } else if (newTouches.length === 2) {
    const dist = getTouchDist(newTouches)
    if (state.lastPinchDist > 0) {
      const scaleRatio = dist / state.lastPinchDist
      const newScale = Math.max(0.1, Math.min(4.0, state.pinchStartScale * scaleRatio))

      const rect = state.canvas.getBoundingClientRect()
      const cx = ((newTouches[0].clientX + newTouches[1].clientX) / 2 - rect.left) * dpr
      const cy = ((newTouches[0].clientY + newTouches[1].clientY) / 2 - rect.top) * dpr
      const wx = (cx - state.viewX) / state.viewScale
      const wy = (cy - state.viewY) / state.viewScale

      state.viewX = cx - wx * newScale
      state.viewY = cy - wy * newScale
      state.viewScale = newScale
      renderCallback()
    }
    state.lastPinchDist = dist
  }
  state.touches = newTouches
}

function onTouchEnd(e, state) {
  e.preventDefault()
  state.isPanning = false
  state.touches = Array.from(e.touches)
  if (state.touches.length < 2) {
    state.lastPinchDist = 0
  }
}

function getTouchDist(touchList) {
  const dx = touchList[0].clientX - touchList[1].clientX
  const dy = touchList[0].clientY - touchList[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}
