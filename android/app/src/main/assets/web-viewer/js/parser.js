/**
 * EasyComfyUI - Workflow Parser
 *
 * Normalizes raw workflow JSON into a consistent internal format.
 * Handles demo mode, real ComfyUI JSON, and API JSON formats.
 */

/**
 * Create the built-in demo workflow.
 */
export function createDemoWorkflow() {
  return {
    nodes: [
      {
        id: 1,
        type: 'CheckpointLoaderSimple',
        pos: [100, 200],
        size: [240, 100],
        inputs: [],
        outputs: [{ name: 'MODEL', type: 'MODEL' }, { name: 'CLIP', type: 'CLIP' }, { name: 'VAE', type: 'VAE' }],
        widgets_values: ['model.ckpt'],
        title: 'Load Checkpoint',
      },
      {
        id: 2,
        type: 'CLIPTextEncode',
        pos: [450, 80],
        size: [240, 140],
        inputs: [{ name: 'clip', type: 'CLIP' }, { name: 'text', type: 'STRING' }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING' }],
        widgets_values: ['positive prompt'],
        title: 'CLIP Text Encode (Pos)',
      },
      {
        id: 3,
        type: 'CLIPTextEncode',
        pos: [450, 300],
        size: [240, 140],
        inputs: [{ name: 'clip', type: 'CLIP' }, { name: 'text', type: 'STRING' }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING' }],
        widgets_values: ['negative prompt'],
        title: 'CLIP Text Encode (Neg)',
      },
      {
        id: 4,
        type: 'KSampler',
        pos: [800, 180],
        size: [260, 220],
        inputs: [
          { name: 'model', type: 'MODEL' },
          { name: 'positive', type: 'CONDITIONING' },
          { name: 'negative', type: 'CONDITIONING' },
          { name: 'latent_image', type: 'LATENT' },
        ],
        outputs: [{ name: 'LATENT', type: 'LATENT' }],
        widgets_values: [42, 'randomize', 20, 8, 'euler', 'normal'],
        title: 'KSampler',
      },
      {
        id: 5,
        type: 'VAEDecode',
        pos: [1170, 180],
        size: [220, 120],
        inputs: [{ name: 'samples', type: 'LATENT' }, { name: 'vae', type: 'VAE' }],
        outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
        widgets_values: [],
        title: 'VAE Decode',
      },
      {
        id: 6,
        type: 'SaveImage',
        pos: [1490, 180],
        size: [200, 100],
        inputs: [{ name: 'images', type: 'IMAGE' }],
        outputs: [],
        widgets_values: ['ComfyUI'],
        title: 'Save Image',
      },
    ],
    links: [
      [1, 1, 2, 0],
      [1, 2, 5, 1],
      [2, 0, 4, 1],
      [3, 0, 4, 2],
      [1, 0, 4, 0],
      [4, 0, 5, 0],
      [5, 0, 6, 0],
    ],
    groups: [],
  }
}

/**
 * Normalize a workflow JSON into { nodes, links, groups }.
 * Returns null if the JSON is invalid.
 */
function inferStandardWidgetKind(inputType, value) {
  const type = String(inputType || '').toUpperCase()

  if (type === 'BOOLEAN') return 'toggle'
  if (type === 'COMBO' || Array.isArray(value)) return 'dropdown'
  if (type === 'INT' || type === 'FLOAT' || type === 'NUMBER') return 'number'
  if (type === 'STRING') return 'text'
  if (type === 'IMAGEUPLOAD') return 'upload'
  return 'generic'
}

export function normalizeWorkflow(json) {
  if (!json) return null

  // Demo mode
  if (json.demo === true) {
    const demo = createDemoWorkflow()
    return {
      nodes: demo.nodes,
      links: demo.links,
      groups: demo.groups || [],
    }
  }

  // Standard ComfyUI workflow format
  if (json.nodes && Array.isArray(json.nodes)) {
    const nodes = json.nodes
    const subgraphMap = new Map(
      (json.definitions?.subgraphs || []).map(function (sg) {
        return [String(sg.id), sg.name]
      })
    )

    for (const node of nodes) {
      if (!node) continue
      node._resolvedTitle =
        node.title ||
        subgraphMap.get(String(node.type)) ||
        (node.properties && node.properties['Node name for S&R']) ||
        node.type ||
        ''

      const inputs = Array.isArray(node.inputs) ? node.inputs : []
      const widgetValues = node.widgets_values
      const widgetValueMap = widgetValues && typeof widgetValues === 'object' && !Array.isArray(widgetValues)
        ? widgetValues
        : null
      let widgetIndex = 0
      node._widgets = []

      for (const input of inputs) {
        if (!input || !input.widget) continue

        const widget = typeof input.widget === 'object' ? input.widget : {}
        const widgetKey = widget.name || input.widget?.name || input.name || ''
        let value = ''

        if (Array.isArray(widgetValues)) {
          value = widgetIndex < widgetValues.length ? widgetValues[widgetIndex] : ''
        } else if (widgetValueMap) {
          value = widgetValueMap[widgetKey]
          if (value === undefined && input.name) {
            value = widgetValueMap[input.name]
          }
          if (value === undefined) {
            value = ''
          }
        }

        node._widgets.push({
          name: widgetKey,
          label: input.localized_name || input.label || input.name || widget.name || '',
          inputType: input.type || '',
          value: value === undefined ? '' : value,
          kind: inferStandardWidgetKind(input.type, value),
        })
        widgetIndex += 1
      }

      // TODO: properties.proxyWidgets is intentionally not handled yet.
    }

    return {
      nodes: nodes,
      links: json.links || [],
      groups: json.groups || [],
      definitions: json.definitions || null,
    }
  }

  // Invalid
  return null
}

/**
 * Compute slot positions for a node.
 * Returns { inputs: [{name, type, x, y}], outputs: [{name, type, x, y}] }
 */
export function getSlotPositions(node, theme) {
  const [x, y] = node.pos
  const TITLE_H = theme.titleHeight
  const SLOT_H = theme.slotHeight
  const inputs = []
  const outputs = []
  if (node.inputs) {
    node.inputs.forEach(function (input, i) {
      const sy = y + TITLE_H + 6 + i * SLOT_H + SLOT_H / 2
      inputs.push({ name: input.name, type: input.type, x: x, y: sy })
    })
  }
  if (node.outputs) {
    node.outputs.forEach(function (output, i) {
      const sy = y + TITLE_H + 6 + i * SLOT_H + SLOT_H / 2
      outputs.push({ name: output.name, type: output.type, x: x + node.size[0], y: sy })
    })
  }
  return { inputs, outputs }
}

/**
 * Parse a link array into { fromId, fromSlot, toId, toSlot }.
 * Supports both real ComfyUI format [id, from, slot, to, slot, type]
 * and demo format [from, slot, to, slot].
 */
export function parseLink(link) {
  if (link.length >= 6) {
    return {
      fromId: link[1],
      fromSlot: link[2],
      toId: link[3],
      toSlot: link[4],
    }
  }
  return {
    fromId: link[0],
    fromSlot: link[1],
    toId: link[2],
    toSlot: link[3],
  }
}
