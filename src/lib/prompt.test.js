import test from 'node:test'
import assert from 'node:assert/strict'

import { parseBulkBindings } from './prompt.js'

test('parseBulkBindings maps known placeholders, tolerates colon variants, and sanitizes values', () => {
  const placeholders = [
    { normalizedKey: '角色', label: '角色' },
    { normalizedKey: '发型', label: '发型' },
  ]

  const result = parseBulkBindings(
    ` [角色]:大 牛。\n[发型]：平 头。\n[服装]:西装。 `,
    placeholders,
  )

  assert.deepEqual(result, {
    '角色': '大牛',
    '发型': '平头',
  })
})
