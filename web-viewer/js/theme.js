/**
 * EasyComfyUI - Theme Constants
 *
 * ComfyUI-aligned color, size, font, and widget constants.
 * Extracted from reference/ComfyUI_frontend/src/lib/litegraph/src/LiteGraphGlobal.ts
 */

export const THEME = {
  // Background
  bg: '#111111',
  gridLine: '#222222',

  // Node body (NODE_DEFAULT_BGCOLOR = '#353535', NODE_DEFAULT_COLOR = '#333')
  nodeBg: '#353535',
  nodeBorder: '#333333',

  // Title bar (NODE_TITLE_HEIGHT = 30)
  titleHeight: 30,
  titleTextY: 20,
  titleBg: '#333333',
  titleText: '#999999',
  titleTextSelected: '#FFFFFF',

  // Node text (NODE_TEXT_SIZE = 14, NODE_TEXT_COLOR = '#AAA')
  nodeText: '#AAAAAA',
  nodeTextDim: '#888888',
  nodeTextSize: 14,
  nodeSubtextSize: 12,

  // Slots (NODE_SLOT_HEIGHT = 20)
  slotHeight: 20,
  slotRadius: 4,
  slotIn: '#4fc3f7',
  slotOut: '#ffb74d',
  slotLabelMaxRatio: 0.45,
  slotLabelGap: 18,

  // Widgets (WIDGET_BGCOLOR = '#222', WIDGET_OUTLINE_COLOR = '#666', WIDGET_TEXT_COLOR = '#DDD')
  widgetBg: '#222222',
  widgetBorder: '#666666',
  widgetText: '#DDDDDD',
  widgetHeight: 22,
  widgetLabelColor: '#AAAAAA',
  widgetToggleOn: '#4caf50',
  widgetToggleOff: '#555555',

  // Links (connections_width = 3, LINK_COLOR = '#9A9')
  linkWidth: 1.25,
  linkColor: 'rgba(130,155,130,0.55)',
  linkColorActive: 'rgba(150,175,150,0.65)',

  // Rounded corners (ROUND_RADIUS = 8)
  roundRadius: 8,

  // Shadow (DEFAULT_SHADOW_COLOR = 'rgba(0,0,0,0.5)')
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 3,
  shadowOffsetY: 2,

  // Groups (GROUP_TEXT_SIZE = 20, GROUP_FONT = 'Inter')
  groupAlpha: 0.25,
  groupTextSize: 20,
  groupFont: 'Inter',

  // Collapsed (NODE_COLLAPSED_WIDTH = 80, NODE_COLLAPSED_RADIUS = 10)
  collapsedWidth: 80,
  collapsedRadius: 10,

  // MarkdownNote
  noteBg: '#2a2a1e',
  noteBorder: '#5a5a3a',
  noteTitleBg: '#3a3a2a',
  noteTitleText: '#d0d090',
  noteText: '#c0c090',
  noteLinkColor: '#4ea1ff',
  notePadding: 12,
  noteLineHeight: 16,
  noteHeadingSizes: { h1: 18, h2: 16, h3: 14 },

  // Clipping margin (pixels inside node rect for safe clip)
  clipMargin: 2,

  // Widget layout
  widgetLabelRatio: 0.5,
  widgetValueBoxMinW: 60,
  widgetGap: 4,

  // Search highlight
  searchHighlightColor: '#FFD700',
  searchActiveColor: '#FFA500',
  searchGlowBlur: 8,
  searchDimOpacity: 0.35,

  // Misc
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  infoBg: 'rgba(255,255,255,0.08)',
  errorText: '#ff6666',
}
