/**
 * EasyComfyUI - Text Layout Pre-computation
 *
 * Pre-computes all text layouts once during renderWorkflow.
 * Never re-wraps or re-measures on zoom.
 * All results are stored as _ prefixed properties on nodes/groups.
 */

import { THEME } from './theme.js'
import { truncateText, wrapText, wrapSegments, stripMarkdown, safeStringify, parseMarkdownLine, parseUrls, formatWidgetValue } from './utils.js'

/**
 * Pre-compute text layouts for all nodes.
 * Called once per renderWorkflow call.
 */
export function precomputeNodeLayouts(ctx, nodes) {
  for (const node of nodes) {
    const type = node.type || ''
    const title = node._resolvedTitle || node.title || type || ''
    const isNote = type === 'MarkdownNote'
    const collapsed = node.flags && node.flags.collapsed
    const [w] = node.size

    // ── Pre-compute display title ──
    const titleMaxWidth = collapsed ? THEME.collapsedWidth - 16 : w - 16
    ctx.save()
    ctx.font = 'bold ' + THEME.nodeTextSize + 'px ' + THEME.fontFamily
    node._displayTitle = truncateText(ctx, title, titleMaxWidth)
    ctx.restore()

    // ── Pre-compute MarkdownNote text lines with rich metadata ──
    if (isNote) {
      const rawText = (node.widgets_values && node.widgets_values[0]) || ''
      const lines = rawText.split('\n')
      const textMaxW = w - THEME.notePadding * 2
      const noteBodyTop = THEME.titleHeight + THEME.notePadding
      const noteBodyH = node.size[1] - noteBodyTop - THEME.notePadding
      let availableH = noteBodyH
      let lastLineIndex = -1
      const richLines = []

      for (let li = 0; li < lines.length; li++) {
        lastLineIndex = li
        if (availableH <= 0) break

        const meta = parseMarkdownLine(lines[li], THEME)
        const lh = meta.lineHeight

        if (meta.isEmpty) {
          // Spacer line (half height)
          if (availableH >= lh) {
            richLines.push(meta)
            availableH -= lh
          }
          continue
        }

        // For non-empty lines, we need to wrap text to fit width
        // Use segment-aware wrapping to preserve URL metadata across lines
        ctx.save()
        const fontSize = meta.fontSize
        const fontWeight = meta.fontWeight
        ctx.font = fontWeight + ' ' + fontSize + 'px ' + THEME.fontFamily

        const maxLines = Math.max(1, Math.floor(availableH / lh))
        const wrappedLines = wrapSegments(ctx, meta.segments, textMaxW - meta.xOffset, maxLines)
        for (let wi = 0; wi < wrappedLines.length; wi++) {
          if (availableH < lh) break
          const wl = wrappedLines[wi]
          richLines.push({
            text: wl.text,
            segments: wl.segments,
            fontSize: fontSize,
            fontWeight: fontWeight,
            xOffset: meta.xOffset,
            color: meta.color,
            lineHeight: lh,
            isEmpty: false,
            isList: meta.isList,
          })
          availableH -= lh
        }
        ctx.restore()
      }

      // If we ran out of space and there are more lines, add ellipsis marker
      if (richLines.length > 0 && availableH <= 0 && lastLineIndex < lines.length - 1) {
        // Mark last line with ellipsis if truncated
        const last = richLines[richLines.length - 1]
        if (last.text.length > 3) {
          last.text = last.text.replace(/\.{0,3}$/, '') + '...'
        }
      }

      node._noteLines = richLines
    }

    // ── Pre-compute widget display values ──
    if ((node._widgets && node._widgets.length > 0) || (node.widgets_values && node.widgets_values.length > 0)) {
      const inputCount = (node.inputs && node.inputs.length) || 0
      const outputCount = (node.outputs && node.outputs.length) || 0
      const maxSlots = Math.max(inputCount, outputCount, 1)
      const widgetStartY = THEME.titleHeight + 6 + maxSlots * THEME.slotHeight + 4
      const widgets = node._widgets && node._widgets.length > 0 ? node._widgets : null
      const rowHeight = 22
      const rowGap = 4
      const nodeH = node.size[1] || 0
      const availableH = Math.max(0, nodeH - widgetStartY - 6)
      const maxRowsByHeight = Math.max(0, Math.floor((availableH + rowGap) / (rowHeight + rowGap)))
      const sourceCount = widgets ? widgets.length : node.widgets_values.length
      // Compact mode: trigger when the first widget row would be outside the node bounds
      // (widgetStartY >= nodeH means even 1 row won't fit in the visible area)
      const needsCompact = widgets && sourceCount > 0 && widgetStartY >= nodeH
      const visibleRowCapacity = needsCompact
        ? 0
        : (widgets && sourceCount > 0
          ? Math.max(1, maxRowsByHeight)
          : maxRowsByHeight)
      const maxWidgets = Math.min(sourceCount, visibleRowCapacity)
      const controlW = Math.max(Math.floor(w * 0.45), Math.min(Math.floor(w * 0.52), w - 90))
      const controlX = w - 8 - controlW
      const labelMaxW = Math.max(40, controlX - 18)

      ctx.save()
      ctx.font = THEME.nodeSubtextSize + 'px ' + THEME.fontFamily
      node._widgetDisplays = []

      // ── Compact summary mode ──
      // When node is too short for even one normal widget row (availableH <= 0),
      // generate a single compact summary row at the very bottom of the node.
      if (widgets && sourceCount > 0 && maxWidgets <= 0) {
        // Build a summary string like "mode: always, volume: 0.5, file: notify.mp3"
        const parts = []
        for (let wi = 0; wi < Math.min(sourceCount, 6); wi++) {
          const w = widgets[wi]
          const val = safeStringify(w.value)
          const displayVal = val.length > 15 ? val.slice(0, 12) + '...' : val
          parts.push((w.label || w.name || '?') + ': ' + displayVal)
        }
        if (sourceCount > 6) {
          parts.push('+' + (sourceCount - 6) + ' more')
        }
        let summary = parts.join(', ')

        // Truncate summary to fit node width
        const summaryMaxW = Math.max(40, w - 16)
        const truncatedSummary = truncateText(ctx, summary, summaryMaxW)

        // Place compact row just below the last slot row, within node bounds
        const compactY = Math.min(widgetStartY - rowGap, Math.max(THEME.titleHeight + 4, nodeH - rowHeight - 4))
        const compactH = Math.min(rowHeight, Math.max(14, nodeH - compactY - 2))

        node._widgetDisplays.push({
          label: '',
          value: truncatedSummary,
          kind: 'compact',
          y: compactY,
          h: compactH,
          x: 4,
          w: w - 8,
          controlX: 0,
          controlW: 0,
          labelMaxW: 0,
        })
        node._widgetCount = sourceCount
        node._maxWidgets = 0
        ctx.restore()
        continue
      }

      for (let wi = 0; wi < maxWidgets; wi++) {
        const wh = rowHeight
        const wy = widgetStartY + wi * (wh + rowGap)
        let label = ''
        let value = ''
        let kind = 'generic'

        if (widgets) {
          const widget = widgets[wi]
          label = widget.label || widget.name || ''
          value = widget.value
          kind = widget.kind || 'generic'
        } else {
          const name = ''
          const val = node.widgets_values[wi]
          const formatted = formatWidgetValue(name, val)
          label = formatted.label
          value = formatted.value
          kind = formatted.displayType === 'boolean'
            ? 'toggle'
            : formatted.displayType === 'combo'
              ? 'dropdown'
              : formatted.displayType === 'number'
                ? 'number'
                : formatted.displayType === 'object'
                  ? 'object'
                  : 'generic'
        }

        const valueText = safeStringify(value)
        const truncatedLabel = truncateText(ctx, label, labelMaxW)
        const truncatedValue = truncateText(ctx, valueText, Math.max(30, controlW - 18))

        node._widgetDisplays.push({
          label: truncatedLabel,
          value: truncatedValue,
          kind: kind,
          y: wy,
          h: wh,
          x: 4,
          w: w - 8,
          controlX: controlX,
          controlW: controlW,
          labelMaxW: labelMaxW,
        })
      }

      node._widgetCount = sourceCount
      node._maxWidgets = maxWidgets
      ctx.restore()
    }
  }
}

/**
 * Pre-compute group title layouts.
 */
export function precomputeGroupLayouts(ctx, groups) {
  for (const group of groups) {
    const title = group.title || ''
    const [gx, gy, gw] = group.bounding
    const fontSize = THEME.groupTextSize
    const titleMaxW = gw - fontSize

    ctx.save()
    ctx.font = 'bold ' + fontSize + 'px ' + THEME.groupFont
    group._displayTitle = truncateText(ctx, title, titleMaxW)
    group._titleX = gx + fontSize / 2
    group._titleY = gy + THEME.titleHeight / 2 + 1
    ctx.restore()
  }
}
