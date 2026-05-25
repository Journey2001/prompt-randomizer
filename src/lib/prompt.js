const STYLE_MARKER = 'NAME'

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizePlaceholderKey(value) {
  return value.trim().replace(/[_\s]+/g, ' ').toUpperCase()
}

function sanitizeBulkBindingValue(value) {
  return value
    .replace(/\s+/gu, '')
    .replace(/[。！？!?,，、；;：:…．.]+$/u, '')
}

export function resolvePlaceholderStyle(styleText) {
  const trimmedStyle = styleText.trim() || '[NAME]'
  const markerIndex = trimmedStyle.indexOf(STYLE_MARKER)

  if (markerIndex === -1) {
    return {
      open: '[',
      close: ']',
      preview: '[NAME]',
    }
  }

  const open = trimmedStyle.slice(0, markerIndex)
  const close = trimmedStyle.slice(markerIndex + STYLE_MARKER.length)

  return {
    open,
    close,
    preview: trimmedStyle,
  }
}

function buildPlaceholderPattern(style) {
  const open = escapeForRegex(style.open)
  const close = escapeForRegex(style.close)
  return new RegExp(`${open}\\s*([^\\r\\n]+?)\\s*${close}`, 'g')
}

export function parseTemplate(template, style) {
  const pattern = buildPlaceholderPattern(style)
  const groups = new Map()

  for (const match of template.matchAll(pattern)) {
    const rawToken = match[0]
    const innerValue = (match[1] ?? '').trim()

    if (!innerValue) {
      continue
    }

    const normalizedKey = normalizePlaceholderKey(innerValue)
    const existing = groups.get(normalizedKey)

    if (existing) {
      if (!existing.rawTokens.includes(rawToken)) {
        existing.rawTokens.push(rawToken)
      }
      continue
    }

    groups.set(normalizedKey, {
      normalizedKey,
      label: innerValue,
      rawTokens: [rawToken],
    })
  }

  return Array.from(groups.values())
}

export function pickRandomLine(lines) {
  if (!lines.length) {
    return ''
  }

  const index = Math.floor(Math.random() * lines.length)
  return lines[index]
}

export function buildPrompt(template, placeholders, bindings) {
  let output = template
  const picks = {}

  for (const placeholder of placeholders) {
    const selectedValue = pickRandomLine(bindings[placeholder.normalizedKey]?.lines ?? [])
    picks[placeholder.normalizedKey] = selectedValue

    for (const rawToken of placeholder.rawTokens) {
      output = output.split(rawToken).join(selectedValue)
    }
  }

  return { output, picks }
}

export function buildPromptFromPicks(template, placeholders, bindings) {
  let output = template

  for (const placeholder of placeholders) {
    const selectedValue = bindings[placeholder.normalizedKey]?.lastPicked ?? ''

    for (const rawToken of placeholder.rawTokens) {
      output = output.split(rawToken).join(selectedValue)
    }
  }

  return output
}

export function parseBulkBindings(input, placeholders, style = resolvePlaceholderStyle('[NAME]')) {
  const knownKeys = new Set(placeholders.map((placeholder) => placeholder.normalizedKey))
  const nextValues = {}

  for (const rawLine of input.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    const separatorMatch = line.match(/^(.+?)[：:](.*)$/u)

    if (!separatorMatch) {
      continue
    }

    const rawKey = separatorMatch[1]?.trim() ?? ''
    const rawValue = separatorMatch[2] ?? ''
    const parsedPlaceholders = parseTemplate(rawKey, style)
    const normalizedKey =
      parsedPlaceholders[0]?.normalizedKey ?? normalizePlaceholderKey(rawKey)

    if (!knownKeys.has(normalizedKey)) {
      continue
    }

    nextValues[normalizedKey] = sanitizeBulkBindingValue(rawValue)
  }

  return nextValues
}
