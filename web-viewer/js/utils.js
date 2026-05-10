/**
 * EasyComfyUI - Utility Functions
 *
 * Pure helper functions with no side effects.
 */

/**
 * Clamp a number between min and max.
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

/**
 * Linear interpolation.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Draw a rounded rectangle path on the given context.
 * radii can be a number (all corners) or { tl, tr, br, bl }.
 */
export function roundRect(ctx, x, y, w, h, radii) {
  let tl, tr, br, bl
  if (typeof radii === 'number') {
    tl = tr = br = bl = radii
  } else {
    tl = radii.tl || 0
    tr = radii.tr || 0
    br = radii.br || 0
    bl = radii.bl || 0
  }
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl)
  ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}

/**
 * Truncate text with ellipsis to fit maxWidth using the current ctx font.
 * Returns the truncated string.
 */
export function truncateText(ctx, text, maxWidth) {
  if (!text) return ''
  let display = text
  if (ctx.measureText(display).width > maxWidth) {
    while (display.length > 0 && ctx.measureText(display + '...').width > maxWidth) {
      display = display.slice(0, -1)
    }
    display += '...'
  }
  return display
}

/**
 * Wrap text into an array of lines, each fitting within maxWidth.
 * Uses the current ctx font setting.
 */
export function wrapText(ctx, text, maxWidth, maxLines) {
  if (!text) return []
  const words = text.split(/(\s+)/)
  const lines = []
  let line = ''
  let i = 0

  while (i < words.length && lines.length < maxLines) {
    const word = words[i]
    const testLine = line + word
    const testWidth = ctx.measureText(testLine).width

    if (testWidth > maxWidth && line.length > 0) {
      lines.push(line)
      if (lines.length >= maxLines) {
        // Add ellipsis to last line
        let lastLine = lines[lines.length - 1]
        while (lastLine.length > 0) {
          const trimmed = lastLine.slice(0, -1) + '...'
          if (ctx.measureText(trimmed).width <= maxWidth) {
            lines[lines.length - 1] = trimmed
            break
          }
          lastLine = lastLine.slice(0, -1)
        }
        return lines
      }
      line = word
    } else {
      line = testLine
    }
    i++
  }

  if (lines.length < maxLines) {
    lines.push(line)
  }

  return lines
}

/**
 * Split a segment's text into fragments that each fit within maxWidth.
 *
 * Strategy:
 *   1. Split by word boundaries (spaces) — each word is a fragment.
 *   2. If a single word still exceeds maxWidth, hard-split at character
 *      boundaries (grapheme-aware would be ideal, but char-level is fine
 *      for canvas rendering).
 *   3. Each fragment retains the segment's url and kind metadata.
 *
 * Returns an array of { text, url?, kind } fragments.
 */
function splitSegmentByWidth(ctx, seg, maxWidth) {
  const fragments = []
  const text = seg.text
  if (!text) return fragments

  // Split by spaces to get words (preserve spaces as separate tokens)
  const words = text.split(/(\s+)/)

  for (const word of words) {
    if (!word) continue
    const wordW = ctx.measureText(word).width

    if (wordW <= maxWidth) {
      // Word fits as-is
      fragments.push({ text: word, url: seg.url, kind: seg.kind })
    } else {
      // Word exceeds maxWidth — hard-split at character boundaries
      let start = 0
      while (start < word.length) {
        // Binary search for the longest prefix that fits
        let lo = start + 1
        let hi = word.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          if (ctx.measureText(word.slice(start, mid)).width <= maxWidth) {
            lo = mid
          } else {
            hi = mid - 1
          }
        }
        const chunk = word.slice(start, lo)
        fragments.push({ text: chunk, url: seg.url, kind: seg.kind })
        start = lo
      }
    }
  }

  return fragments
}

/**
 * Wrap segments into lines, preserving segment metadata (url, kind).
 *
 * Each input segment is { text, url?, kind }.
 * Output is an array of line objects:
 *   { text: string, segments: [{ text, url?, kind }] }
 *
 * Long segments are split at word boundaries; single words/URLs that
 * exceed maxWidth are hard-split at character boundaries.
 */
export function wrapSegments(ctx, segments, maxWidth, maxLines) {
  if (!segments || segments.length === 0) return []
  const lines = []
  let currentLineSegments = []
  let currentLineText = ''
  let segIdx = 0

  while (segIdx < segments.length && lines.length < maxLines) {
    const seg = segments[segIdx]
    const segText = seg.text

    // Try to add this segment to the current line
    const testText = currentLineText.length === 0 ? segText : currentLineText + segText
    const testWidth = ctx.measureText(testText).width

    if (testWidth <= maxWidth) {
      // Fits on current line
      currentLineSegments.push({ text: segText, url: seg.url, kind: seg.kind })
      currentLineText = testText
      segIdx++
    } else if (currentLineText.length === 0) {
      // First segment on a new line but still too wide — split it
      const fragments = splitSegmentByWidth(ctx, seg, maxWidth)
      // Push all fragments that fit on the current line
      let fi = 0
      while (fi < fragments.length) {
        const frag = fragments[fi]
        const fragTest = currentLineText + frag.text
        const fragW = ctx.measureText(fragTest).width
        if (fragW <= maxWidth) {
          currentLineSegments.push(frag)
          currentLineText = fragTest
          fi++
        } else {
          // This fragment doesn't fit — finalize line, start new one
          break
        }
      }
      // Finalize current line if we have content
      if (currentLineSegments.length > 0) {
        lines.push({ text: currentLineText, segments: currentLineSegments })
        if (lines.length >= maxLines) {
          // Add ellipsis to last line
          const last = lines[lines.length - 1]
          if (last.text.length > 3) {
            last.text = last.text.replace(/\.{0,3}$/, '') + '...'
            const lastSeg = last.segments[last.segments.length - 1]
            if (lastSeg) {
              lastSeg.text = lastSeg.text.replace(/\.{0,3}$/, '') + '...'
            }
          }
          return lines
        }
      }
      // Remaining fragments go on a new line
      currentLineSegments = []
      currentLineText = ''
      // Replace current segment with remaining fragments
      if (fi < fragments.length) {
        const remaining = fragments.slice(fi)
        // Splice remaining fragments into the segments array
        segments.splice(segIdx, 1, ...remaining)
        // Don't increment segIdx — retry first remaining fragment
      } else {
        segIdx++
      }
    } else {
      // Doesn't fit on current line with existing content — finalize line
      if (currentLineSegments.length > 0) {
        lines.push({ text: currentLineText, segments: currentLineSegments })
        if (lines.length >= maxLines) {
          // Add ellipsis to last line
          const last = lines[lines.length - 1]
          if (last.text.length > 3) {
            last.text = last.text.replace(/\.{0,3}$/, '') + '...'
            const lastSeg = last.segments[last.segments.length - 1]
            if (lastSeg) {
              lastSeg.text = lastSeg.text.replace(/\.{0,3}$/, '') + '...'
            }
          }
          return lines
        }
      }
      currentLineSegments = []
      currentLineText = ''
      // Don't increment segIdx — retry same segment on new line
    }
  }

  // Finalize remaining line
  if (currentLineSegments.length > 0 && lines.length < maxLines) {
    lines.push({ text: currentLineText, segments: currentLineSegments })
  }

  return lines
}

/**
 * Strip markdown formatting for plain text display.
 */
export function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')       // [text](url) → text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')       // ![alt](url) → alt
    .replace(/[*_~`#>|]/g, '')                       // remove formatting chars
    .replace(/-{2,}/g, '')                           // remove hr lines
    .replace(/\n{3,}/g, '\n\n')                      // collapse multiple newlines
    .trim()
}

/**
 * Safely convert a widget value to a display string.
 */
export function safeStringify(val) {
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'object') return '[object]'
  let s = String(val)
  if (s.length > 24) s = s.slice(0, 21) + '...'
  return s
}

/**
 * Parse a text string into segments, detecting both Markdown links
 * [label](url) and bare URLs (https://...).
 *
 * Returns an array of segments:
 *   { text: string, url?: string, kind: 'text' | 'link' }
 *
 * - For [label](url): text = label, url = original URL, kind = 'link'
 * - For bare URL:     text = shortenUrl(url), url = original URL, kind = 'link'
 * - For plain text:   text = original, kind = 'text'
 */
export function parseUrls(text) {
  const segments = []
  // Combined regex: match Markdown links [label](url) OR bare URLs
  // Order matters: try Markdown link first, then bare URL
  const combinedRegex = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)|(https?:\/\/[^\s\)]+)/g
  let lastIndex = 0
  let match

  while ((match = combinedRegex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), kind: 'text' })
    }

    if (match[1] !== undefined) {
      // Markdown link: [label](url)
      const label = match[1]
      const fullUrl = match[2]
      // If label is itself a URL, shorten it; otherwise use label as display text
      const displayText = /^https?:\/\//.test(label) ? shortenUrl(fullUrl) : label
      segments.push({ text: displayText, url: fullUrl, kind: 'link' })
    } else {
      // Bare URL
      let fullUrl = match[3]
      // Strip trailing punctuation that isn't part of the URL
      fullUrl = fullUrl.replace(/[.,;:!?)]+$/, '')
      if (fullUrl.length > 0) {
        segments.push({ text: shortenUrl(fullUrl), url: fullUrl, kind: 'link' })
      }
    }

    lastIndex = combinedRegex.lastIndex
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), kind: 'text' })
  }

  // No matches at all → return single text segment
  if (segments.length === 0) {
    segments.push({ text, kind: 'text' })
  }

  return segments
}

/**
 * Shorten a URL to a readable display string.
 *
 * Strips protocol, removes query/hash, truncates to ~50 chars.
 * Keeps domain + first meaningful path segment.
 *
 * Examples:
 *   https://github.com/ltdrdata/ComfyUI-Manager → github.com/ltdrdata/ComfyUI-Manager
 *   https://civitai.com/models/12345 → civitai.com/models/12345
 *   https://huggingface.co/Lightricks/LTX-2.3/... → huggingface.co/Lightricks/...
 *   https://perplexity.ai → perplexity.ai
 */
export function shortenUrl(url) {
  // Strip protocol
  let display = url.replace(/^https?:\/\//, '')
  // Strip query string and hash for display
  display = display.replace(/[?#].*$/, '')
  // Strip trailing slash
  display = display.replace(/\/$/, '')
  // Truncate if too long (max 50 chars)
  if (display.length > 50) {
    const parts = display.split('/')
    if (parts.length > 3) {
      // Keep domain + first two path segments, then truncate
      display = parts.slice(0, 3).join('/') + '/...'
    } else if (parts.length > 2) {
      display = parts.slice(0, 2).join('/') + '/...'
    } else {
      display = display.slice(0, 47) + '...'
    }
  }
  return display
}

/**
 * Parse a single markdown line and return rich metadata.
 *
 * Returns { text, segments, fontSize, fontWeight, xOffset, color, lineHeight, isEmpty, isList }
 *
 * Supports:
 *   - # / ## / ### headings (larger font, bold, extra spacing)
 *   - Empty lines (paragraph spacing)
 *   - - / * lists (indent)
 *   - **bold** (wraps in display markers)
 *   - URL detection via parseUrls()
 */
export function parseMarkdownLine(line, theme) {
  const headingSizes = theme.noteHeadingSizes || { h1: 18, h2: 16, h3: 14 }
  const baseSize = theme.nodeSubtextSize || 12
  const baseLineH = theme.noteLineHeight || 16
  const textColor = theme.noteText || '#c0c090'

  // Empty line → paragraph spacing
  if (!line || line.trim() === '') {
    return {
      text: '',
      segments: [{ text: '' }],
      fontSize: baseSize,
      fontWeight: 'normal',
      xOffset: 0,
      color: textColor,
      lineHeight: baseLineH * 0.5,  // half-height spacer
      isEmpty: true,
      isList: false,
    }
  }

  const trimmed = line.trim()

  // Heading detection
  let hLevel = 0
  if (/^#{1,3}\s/.test(trimmed)) {
    const match = trimmed.match(/^(#{1,3})\s+(.*)/)
    if (match) {
      hLevel = match[1].length
      const headingText = match[2]
      const segments = parseUrls(headingText)
      return {
        text: segments.map(s => s.text).join(''),
        segments: segments,
        fontSize: headingSizes['h' + hLevel] || baseSize + 2,
        fontWeight: 'bold',
        xOffset: 0,
        color: theme.noteTitleText || '#d0d090',
        lineHeight: baseLineH + 4,
        isEmpty: false,
        isList: false,
      }
    }
  }

  // List item detection
  const isList = /^[\-\*]\s/.test(trimmed)
  let displayText = trimmed
  if (isList) {
    displayText = '  ' + trimmed.replace(/^[\-\*]\s/, '• ')
  }

  // Strip bold markers
  displayText = displayText.replace(/\*\*/g, '')

  // Parse URLs into segments
  const segments = parseUrls(displayText)

  return {
    text: segments.map(s => s.text).join(''),
    segments: segments,
    fontSize: baseSize,
    fontWeight: 'normal',
    xOffset: isList ? 8 : 0,
    color: textColor,
    lineHeight: baseLineH,
    isEmpty: false,
    isList: isList,
  }
}

/**
 * Format a widget value for display based on its type.
 * Returns { label, value, displayType } where displayType is one of:
 *   'boolean', 'number', 'string', 'combo', 'object'
 */
export function formatWidgetValue(name, val, type) {
  const label = name || ''
  let displayType = 'string'
  let displayVal = ''

  if (val === null || val === undefined) {
    displayVal = 'null'
    displayType = 'string'
  } else if (typeof val === 'boolean') {
    displayVal = val ? 'ON' : 'OFF'
    displayType = 'boolean'
  } else if (typeof val === 'number') {
    displayVal = String(val)
    displayType = 'number'
  } else if (Array.isArray(val)) {
    // Combo / dropdown
    displayVal = String(val[0] || '')
    displayType = 'combo'
  } else if (typeof val === 'object') {
    // Object summary
    const keys = Object.keys(val)
    if (keys.length === 0) {
      displayVal = '{}'
    } else {
      displayVal = '{' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? ', ...' : '') + '}'
    }
    displayType = 'object'
  } else {
    displayVal = String(val)
  }

  // Truncate long values
  if (displayVal.length > 30) {
    displayVal = displayVal.slice(0, 27) + '...'
  }

  return { label, value: displayVal, displayType }
}
