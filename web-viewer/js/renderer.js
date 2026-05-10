/**
 * EasyComfyUI - Canvas Renderer
 *
 * All draw functions. Operates on the current ctx with the world transform
 * already applied. Font sizes, line widths, and shadow values are fixed
 * world-space values (no / viewScale divisions).
 *
 * Link hitboxes are recorded in world coordinates on the shared state
 * object so that click/tap handlers can detect link clicks.
 */

import { THEME } from './theme.js'
import { roundRect, truncateText, parseUrls } from './utils.js'
import { getSlotPositions, parseLink } from './parser.js'

/**
 * Set the shared state reference for hitbox recording.
 * Called by main.js during initialization.
 */
let _hitboxState = null
export function setHitboxState(state) {
  _hitboxState = state
}

/**
 * Set the shared state reference for search state.
 * Called by main.js during initialization.
 */
let _searchState = null
export function setSearchState(state) {
  _searchState = state
}

/**
 * Draw the grid background.
 * ctx must have the world transform applied.
 */
export function drawGrid(ctx, viewX, viewY, viewScale, canvas) {
  const step = 40
  ctx.save()
  ctx.strokeStyle = THEME.gridLine
  ctx.lineWidth = 0.5
  const dpr = canvas._dpr || 1
  const cssW = canvas._cssW || 800
  const cssH = canvas._cssH || 600
  const left = (-viewX) / viewScale
  const top = (-viewY) / viewScale
  const right = (cssW * dpr - viewX) / viewScale
  const bottom = (cssH * dpr - viewY) / viewScale

  const startX = Math.floor(left / step) * step
  const startY = Math.floor(top / step) * step
  for (let x = startX; x <= right; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
  }
  for (let y = startY; y <= bottom; y += step) {
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draw all groups (behind nodes).
 */
export function drawGroups(ctx, groups) {
  for (const group of groups) {
    drawGroup(ctx, group)
  }
}

/**
 * Draw a single group.
 */
function drawGroup(ctx, group) {
  const [gx, gy, gw, gh] = group.bounding
  const color = group.color || '#3f789e'

  // Group background
  ctx.save()
  ctx.globalAlpha = THEME.groupAlpha
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(gx + 0.5, gy + 0.5, gw, gh)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Title bar area
  ctx.save()
  ctx.globalAlpha = THEME.groupAlpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.rect(gx + 0.5, gy + 0.5, gw, THEME.titleHeight)
  ctx.fill()
  ctx.restore()

  // Title text (pre-computed)
  if (group._displayTitle) {
    ctx.save()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold ' + THEME.groupTextSize + 'px ' + THEME.groupFont
    ctx.textBaseline = 'middle'
    ctx.fillText(group._displayTitle, group._titleX, group._titleY)
    ctx.restore()
  }
}

/**
 * Draw all links (behind nodes).
 */
export function drawLinks(ctx, nodes, links) {
  // Build node lookup
  const nodeMap = {}
  for (const node of nodes) {
    nodeMap[node.id] = node
  }

  // Precompute slot positions
  const slotPositions = {}
  for (const node of nodes) {
    slotPositions[node.id] = getSlotPositions(node, THEME)
  }

  // Check if search is active
  const hasSearch = _searchState && _searchState.searchMatches && _searchState.searchMatches.length > 0

  for (const link of links) {
    const parsed = parseLink(link)
    const fromNode = nodeMap[parsed.fromId]
    const toNode = nodeMap[parsed.toId]
    if (!fromNode || !toNode) continue
    const fromPos = slotPositions[parsed.fromId].outputs[parsed.fromSlot]
    const toPos = slotPositions[parsed.toId].inputs[parsed.toSlot]
    if (!fromPos || !toPos) continue

    // Dim links when search is active based on endpoint match status
    if (hasSearch) {
      const fromMatched = fromNode._searchMatched
      const toMatched = toNode._searchMatched
      if (!fromMatched && !toMatched) {
        drawLink(ctx, fromPos.x, fromPos.y, toPos.x, toPos.y, 'rgba(130,155,130,0.12)')
      } else if (!fromMatched || !toMatched) {
        drawLink(ctx, fromPos.x, fromPos.y, toPos.x, toPos.y, 'rgba(130,155,130,0.30)')
      } else {
        drawLink(ctx, fromPos.x, fromPos.y, toPos.x, toPos.y, THEME.linkColor)
      }
    } else {
      drawLink(ctx, fromPos.x, fromPos.y, toPos.x, toPos.y, THEME.linkColor)
    }
  }
}

/**
 * Draw a single bezier link.
 */
function drawLink(ctx, x1, y1, x2, y2, color) {
  ctx.save()
  ctx.strokeStyle = color || THEME.linkColor
  ctx.lineWidth = THEME.linkWidth
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  const dx = Math.abs(x2 - x1) * 0.5
  ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw all nodes.
 */
export function drawNodes(ctx, nodes) {
  for (const node of nodes) {
    drawNode(ctx, node)
  }
}

/**
 * Draw a single node.
 */
function drawNode(ctx, node) {
  const [x, y] = node.pos
  const [w, h] = node.size
  const type = node.type || ''
  const isNote = type === 'MarkdownNote'
  const collapsed = node.flags && node.flags.collapsed
  const inputCount = (node.inputs && node.inputs.length) || 0
  const outputCount = (node.outputs && node.outputs.length) || 0

  // Resolve colors
  const nodeColor = node.color || THEME.titleBg
  const nodeBgColor = node.bgcolor || THEME.nodeBg

  // ── Search highlight (drawn before shadow so glow is visible) ──
  const hasSearch = _searchState && _searchState.searchMatches && _searchState.searchMatches.length > 0
  if (hasSearch) {
    if (node._searchActive) {
      // Current match: bright orange glow + thick border
      ctx.save()
      ctx.shadowColor = THEME.searchActiveColor
      ctx.shadowBlur = THEME.searchGlowBlur * 2
      ctx.strokeStyle = THEME.searchActiveColor
      ctx.lineWidth = 3
      roundRect(ctx, x - 2, y - 2, w + 4, h + 4, THEME.roundRadius + 2)
      ctx.stroke()
      ctx.restore()
    } else if (node._searchMatched) {
      // Matched: yellow glow + border
      ctx.save()
      ctx.shadowColor = THEME.searchHighlightColor
      ctx.shadowBlur = THEME.searchGlowBlur
      ctx.strokeStyle = THEME.searchHighlightColor
      ctx.lineWidth = 2
      roundRect(ctx, x - 1, y - 1, w + 2, h + 2, THEME.roundRadius + 1)
      ctx.stroke()
      ctx.restore()
    }
  }

  // ── Shadow ──
  ctx.save()
  ctx.shadowColor = THEME.shadowColor
  ctx.shadowBlur = THEME.shadowBlur
  ctx.shadowOffsetY = THEME.shadowOffsetY

  if (isNote) {
    drawMarkdownNote(ctx, node, x, y, w, h)
    ctx.restore()
    // Apply dimming for non-matched nodes when search is active
    if (hasSearch && !node._searchMatched) {
      ctx.save()
      ctx.globalAlpha = THEME.searchDimOpacity
      // Redraw the note body with dimming — we need to re-render the note
      // Since we already drew it, we can't easily dim it. Instead, draw a dim overlay.
      ctx.fillStyle = THEME.bg
      ctx.globalAlpha = 1 - THEME.searchDimOpacity
      roundRect(ctx, x, y, w, h, THEME.roundRadius)
      ctx.fill()
      ctx.restore()
    }
    return
  }

  if (collapsed) {
    drawCollapsedNode(ctx, node, x, y, nodeColor, nodeBgColor, inputCount, outputCount)
    ctx.restore()
    return
  }

  // ── Regular node body ──
  ctx.fillStyle = nodeBgColor
  ctx.strokeStyle = nodeColor
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, THEME.roundRadius)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // ── Title bar ──
  ctx.save()
  ctx.fillStyle = nodeColor
  roundRect(ctx, x, y, w, THEME.titleHeight, { tl: THEME.roundRadius, tr: THEME.roundRadius, bl: 0, br: 0 })
  ctx.fill()
  ctx.restore()

  // ── Separator line ──
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(x, y + THEME.titleHeight - 1, w, 2)
  ctx.restore()

  // ── Title text (pre-computed) ──
  ctx.save()
  ctx.fillStyle = THEME.titleText
  ctx.font = 'bold ' + THEME.nodeTextSize + 'px ' + THEME.fontFamily
  ctx.textBaseline = 'middle'
  ctx.fillText(node._displayTitle, x + 8, y + THEME.titleHeight / 2)
  ctx.restore()

  // ── Clip body content to node interior ──
  // Clip covers: widgets, slot labels (text only).
  // Port dots are drawn AFTER clip restore so they are never clipped.
  ctx.save()
  const clipMargin = THEME.clipMargin
  const clipX = x + clipMargin
  const clipY = y + THEME.titleHeight + clipMargin
  const clipW = w - clipMargin * 2
  const clipH = h - THEME.titleHeight - clipMargin * 2
  ctx.beginPath()
  ctx.rect(clipX, clipY, clipW, clipH)
  ctx.clip()

  // ── Slot labels (inside clip, text only) ──
  drawSlotLabels(ctx, node, x, y, w)

  // ── Widget values ──
  drawWidgets(ctx, node, x, y, w)

  ctx.restore() // restore clipping

  // ── Port dots (outside clip, never clipped) ──
  drawPortDots(ctx, node, x, y, w)

  // ── Dim non-matched nodes when search is active ──
  if (hasSearch && !node._searchMatched) {
    ctx.save()
    ctx.globalAlpha = 1 - THEME.searchDimOpacity
    ctx.fillStyle = THEME.bg
    roundRect(ctx, x, y, w, h, THEME.roundRadius)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Draw a MarkdownNote node with rich markdown rendering.
 */
function drawMarkdownNote(ctx, node, x, y, w, h) {
  // Resolve colors from node properties, fall back to theme defaults
  const noteBg = node.bgcolor || THEME.noteBg
  const noteBorder = node.color || THEME.noteBorder
  const noteTitleBg = node.color || THEME.noteTitleBg
  const noteTitleText = THEME.noteTitleText

  // Body
  ctx.fillStyle = noteBg
  ctx.strokeStyle = noteBorder
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, THEME.roundRadius)
  ctx.fill()
  ctx.stroke()
  ctx.restore() // restore from shadow save

  // Title bar
  ctx.save()
  ctx.fillStyle = noteTitleBg
  roundRect(ctx, x, y, w, THEME.titleHeight, { tl: THEME.roundRadius, tr: THEME.roundRadius, bl: 0, br: 0 })
  ctx.fill()
  ctx.restore()

  // Title text
  ctx.save()
  ctx.fillStyle = noteTitleText
  ctx.font = 'bold ' + THEME.nodeTextSize + 'px ' + THEME.fontFamily
  ctx.textBaseline = 'middle'
  ctx.fillText(node._displayTitle, x + 8, y + THEME.titleHeight / 2)
  ctx.restore()

  // ── Clip body content to note interior ──
  ctx.save()
  const clipMargin = THEME.clipMargin
  const clipX = x + clipMargin
  const clipY = y + THEME.titleHeight + clipMargin
  const clipW = w - clipMargin * 2
  const clipH = h - THEME.titleHeight - clipMargin * 2
  ctx.beginPath()
  ctx.rect(clipX, clipY, clipW, clipH)
  ctx.clip()

  // Rich markdown text content (pre-computed lines with metadata)
  if (node._noteLines && node._noteLines.length > 0) {
    const textX = x + THEME.notePadding
    let textY = y + THEME.titleHeight + THEME.notePadding

    for (let li = 0; li < node._noteLines.length; li++) {
      const meta = node._noteLines[li]
      const lh = meta.lineHeight

      // Check if we still have room
      if (textY + lh > y + h - clipMargin) {
        // Draw ellipsis if truncated
        ctx.save()
        ctx.fillStyle = meta.color || THEME.noteText
        ctx.font = meta.fontWeight + ' ' + meta.fontSize + 'px ' + THEME.fontFamily
        ctx.textBaseline = 'top'
        ctx.fillText('\u2026', textX, textY)
        ctx.restore()
        break
      }

      if (meta.isEmpty) {
        textY += lh
        continue
      }

      ctx.save()
      ctx.font = meta.fontWeight + ' ' + meta.fontSize + 'px ' + THEME.fontFamily
      ctx.textBaseline = 'top'

      // Render segments (text with optional URL highlighting)
      const segments = meta.segments
      if (segments && segments.length > 0) {
        let segX = textX + meta.xOffset
        for (let si = 0; si < segments.length; si++) {
          const seg = segments[si]
          const isLink = seg.kind === 'link' || !!seg.url
          ctx.fillStyle = isLink ? THEME.noteLinkColor : (meta.color || THEME.noteText)
          ctx.fillText(seg.text, segX, textY)
          // Underline link segments
          if (isLink) {
            const segW = ctx.measureText(seg.text).width
            const underlineY = textY + meta.fontSize + 1
            ctx.beginPath()
            ctx.moveTo(segX, underlineY)
            ctx.lineTo(segX + segW, underlineY)
            ctx.strokeStyle = THEME.noteLinkColor
            ctx.lineWidth = 1
            ctx.stroke()

            // Record hitbox in world coordinates
            if (_hitboxState && seg.url) {
              _hitboxState.linkHitboxes.push({
                x: segX,
                y: textY,
                w: segW,
                h: meta.fontSize + 2,
                url: seg.url,
              })
            }
          }
          segX += ctx.measureText(seg.text).width
        }
      } else {
        // Fallback for lines without segments (old format)
        ctx.fillStyle = meta.color || THEME.noteText
        ctx.fillText(meta.text, textX + meta.xOffset, textY)
      }
      ctx.restore()

      textY += lh
    }
  }

  ctx.restore() // restore clipping
}

/**
 * Draw a collapsed node.
 */
function drawCollapsedNode(ctx, node, x, y, nodeColor, nodeBgColor, inputCount, outputCount) {
  const cw = THEME.collapsedWidth
  const ch = THEME.titleHeight

  // Body
  ctx.fillStyle = nodeBgColor
  ctx.strokeStyle = nodeColor
  ctx.lineWidth = 1
  roundRect(ctx, x, y, cw, ch, THEME.collapsedRadius)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Title bar fill
  ctx.save()
  ctx.fillStyle = nodeColor
  roundRect(ctx, x, y, cw, ch, THEME.collapsedRadius)
  ctx.fill()
  ctx.restore()

  // Title text
  ctx.save()
  ctx.fillStyle = THEME.titleText
  ctx.font = 'bold ' + THEME.nodeTextSize + 'px ' + THEME.fontFamily
  ctx.textBaseline = 'middle'
  ctx.fillText(node._displayTitle, x + 8, y + ch / 2)
  ctx.restore()

  // Simplified ports
  if (inputCount > 0) {
    ctx.save()
    ctx.fillStyle = THEME.slotIn
    ctx.beginPath()
    ctx.arc(x, y + ch / 2, THEME.slotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (outputCount > 0) {
    ctx.save()
    ctx.fillStyle = THEME.slotOut
    ctx.beginPath()
    ctx.arc(x + cw, y + ch / 2, THEME.slotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Draw slot labels (text only) inside the clip region.
 * Input labels at x + slotLabelGap, truncated to slotLabelMaxRatio of node width.
 * Output labels right-aligned at x + w - slotLabelGap, similarly truncated.
 */
function drawSlotLabels(ctx, node, x, y, w) {
  const maxLabelW = w * THEME.slotLabelMaxRatio

  // Input labels
  if (node.inputs) {
    ctx.save()
    ctx.fillStyle = THEME.nodeText
    ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (let i = 0; i < node.inputs.length; i++) {
      const slot = node.inputs[i]
      const sy = y + THEME.titleHeight + 6 + i * THEME.slotHeight
      const label = slot.name || 'input_' + i
      const truncated = truncateText(ctx, label, maxLabelW)
      ctx.fillText(truncated, x + THEME.slotLabelGap, sy + THEME.slotHeight / 2)
    }
    ctx.restore()
  }

  // Output labels
  if (node.outputs) {
    ctx.save()
    ctx.fillStyle = THEME.nodeText
    ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    for (let i = 0; i < node.outputs.length; i++) {
      const slot = node.outputs[i]
      const sy = y + THEME.titleHeight + 6 + i * THEME.slotHeight
      const label = slot.name || 'output_' + i
      const truncated = truncateText(ctx, label, maxLabelW)
      ctx.fillText(truncated, x + w - THEME.slotLabelGap, sy + THEME.slotHeight / 2)
    }
    ctx.restore()
  }
}

/**
 * Draw port dots outside the clip region.
 * Input dots at x + 1, output dots at x + w - 1, radius 4px.
 */
function drawPortDots(ctx, node, x, y, w) {
  // Input dots
  if (node.inputs) {
    ctx.save()
    ctx.fillStyle = THEME.slotIn
    for (let i = 0; i < node.inputs.length; i++) {
      const sy = y + THEME.titleHeight + 6 + i * THEME.slotHeight
      ctx.beginPath()
      ctx.arc(x + 1, sy + THEME.slotHeight / 2, THEME.slotRadius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // Output dots
  if (node.outputs) {
    ctx.save()
    ctx.fillStyle = THEME.slotOut
    for (let i = 0; i < node.outputs.length; i++) {
      const sy = y + THEME.titleHeight + 6 + i * THEME.slotHeight
      ctx.beginPath()
      ctx.arc(x + w - 1, sy + THEME.slotHeight / 2, THEME.slotRadius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/**
 * Draw widget value bars with label:value layout and type-specific styling.
 */
function drawWidgets(ctx, node, x, y, w) {
  if (!node._widgetDisplays || node._widgetDisplays.length === 0) return

  ctx.save()
  for (let wi = 0; wi < node._widgetDisplays.length; wi++) {
    const wd = node._widgetDisplays[wi]
    const wy = y + wd.y
    const wh = wd.h
    const rowX = x + (wd.x || 4)
    const rowW = wd.w || (w - 8)
    const controlX = x + (wd.controlX || Math.max(0, w - 100))
    const controlW = wd.controlW || Math.max(60, w - (controlX - x) - 8)
    const controlY = wy + 1
    const controlH = wh - 2
    const labelX = rowX + 6
    const labelY = wy + wh / 2
    const controlTextX = controlX + 8
    const controlTextY = wy + wh / 2
    const controlTextW = Math.max(16, controlW - 20)

    // Widget row background
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 0.5
    roundRect(ctx, rowX, wy, rowW, wh, 3)
    ctx.fill()
    ctx.stroke()

    // ── Label (left side) ──
    ctx.save()
    ctx.fillStyle = THEME.widgetLabelColor
    ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(wd.label, labelX, labelY, wd.labelMaxW || Math.max(40, controlX - rowX - 14))
    ctx.restore()

    // ── Right-side control box ──
    ctx.save()
    ctx.fillStyle = THEME.widgetBg
    ctx.strokeStyle = THEME.widgetBorder
    ctx.lineWidth = 0.5
    roundRect(ctx, controlX, controlY, controlW, controlH, 4)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // ── Value/control contents ──
    ctx.save()
    ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
    ctx.textBaseline = 'middle'

    switch (wd.kind) {
      case 'toggle': {
        const isOn = wd.value === 'true' || wd.value === 'ON' || wd.value === '1'
        const pillW = Math.min(28, controlW - 10)
        const pillH = Math.max(12, controlH - 6)
        const pillX = controlX + controlW - pillW - 5
        const pillY = controlY + (controlH - pillH) / 2
        const knobR = Math.max(4, Math.floor((pillH - 4) / 2))
        const knobX = isOn ? (pillX + pillW - knobR - 3) : (pillX + knobR + 3)
        const knobY = pillY + pillH / 2
        ctx.fillStyle = isOn ? THEME.widgetToggleOn : THEME.widgetToggleOff
        roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2)
        ctx.fill()
        break
      }

      case 'dropdown':
        ctx.fillStyle = THEME.widgetText
        ctx.textAlign = 'left'
        ctx.fillText(wd.value, controlTextX, controlTextY, Math.max(12, controlTextW - 10))
        ctx.fillStyle = THEME.nodeTextDim
        ctx.beginPath()
        ctx.moveTo(controlX + controlW - 10, controlTextY - 3)
        ctx.lineTo(controlX + controlW - 6, controlTextY)
        ctx.lineTo(controlX + controlW - 10, controlTextY + 3)
        ctx.fill()
        break

      case 'number':
        ctx.fillStyle = THEME.widgetText
        ctx.textAlign = 'right'
        ctx.fillText(wd.value, controlX + controlW - 8, controlTextY, controlTextW)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(controlTextX, controlY + controlH - 4)
        ctx.lineTo(controlX + controlW - 8, controlY + controlH - 4)
        ctx.stroke()
        break

      case 'text':
        ctx.fillStyle = THEME.widgetText
        ctx.textAlign = 'left'
        ctx.fillText(wd.value, controlTextX, controlTextY, controlTextW)
        break

      case 'upload':
        ctx.fillStyle = THEME.widgetText
        ctx.textAlign = 'left'
        ctx.fillText(wd.value || wd.label, controlTextX, controlTextY, controlTextW)
        break

      case 'compact':
        // Compact summary row: single dark bar with truncated summary text
        ctx.fillStyle = THEME.widgetBg
        ctx.strokeStyle = THEME.widgetBorder
        ctx.lineWidth = 0.5
        roundRect(ctx, rowX, wy, rowW, wh, 3)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = THEME.nodeTextDim
        ctx.textAlign = 'left'
        ctx.font = (THEME.nodeSubtextSize - 1) + 'px ' + THEME.fontFamily
        ctx.fillText(wd.value, labelX, labelY, rowW - 12)
        break

      case 'object':
      case 'generic':
        ctx.fillStyle = THEME.nodeTextDim
        ctx.textAlign = 'left'
        ctx.fillText(wd.value, controlTextX, controlTextY, controlTextW)
        break

      default:
        ctx.fillStyle = THEME.widgetText
        ctx.textAlign = 'left'
        ctx.fillText(wd.value, controlTextX, controlTextY, controlTextW)
        break
    }

    ctx.restore()
  }

  // If more widgets than shown, add ellipsis indicator
  // Skip for compact mode (summary already includes "+N more")
  if (node._widgetCount > node._maxWidgets && node._widgetDisplays.length > 0) {
    const lastWd = node._widgetDisplays[node._widgetDisplays.length - 1]
    if (lastWd.kind === 'compact') {
      ctx.restore()
      return
    }
    const wy = y + lastWd.y + lastWd.h + 3
    ctx.fillStyle = THEME.nodeTextDim
    ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
    ctx.textBaseline = 'top'
    ctx.fillText('\u2026', x + 8, wy)
  }
  ctx.restore()
}

/**
 * Draw the info overlay in screen space.
 */
export function drawInfo(ctx, nodes, links, groups, viewScale, canvas) {
  const dpr = canvas._dpr || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = THEME.infoBg
  ctx.font = (11 * dpr) + 'px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(
    nodes.length + ' nodes, ' + links.length + ' links' + (groups.length ? ', ' + groups.length + ' groups' : '') + '  |  zoom: ' + (viewScale * dpr).toFixed(2) + 'x',
    10 * dpr, 10 * dpr
  )
}
