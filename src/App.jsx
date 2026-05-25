import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  buildPrompt,
  buildPromptFromPicks,
  parseBulkBindings,
  parseTemplate,
  resolvePlaceholderStyle,
} from './lib/prompt'

const STORAGE_KEY = 'prompt-randomizer-state'

function fallbackCopyText(value) {
  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.top = '0'
  textArea.style.left = '0'
  textArea.style.opacity = '0'

  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  textArea.setSelectionRange(0, textArea.value.length)

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textArea)
  }
}

function readPersistedState() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return {
        bindings: {},
        bulkBindingsText: '',
        placeholderStyleText: '[NAME]',
      }
    }

    const parsedValue = JSON.parse(rawValue)

    return {
      bindings: parsedValue.bindings ?? {},
      bulkBindingsText: parsedValue.bulkBindingsText ?? '',
      placeholderStyleText: parsedValue.placeholderStyleText ?? '[NAME]',
    }
  } catch {
    return {
      bindings: {},
      bulkBindingsText: '',
      placeholderStyleText: '[NAME]',
    }
  }
}

const initialState = readPersistedState()

function PickedLineDropdown({ options, value, onSelect }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openDirection, setOpenDirection] = useState('down')
  const dropdownRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return
    }

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const estimatedMenuHeight = Math.min(options.length * 52 + 12, 288)
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top

    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      setOpenDirection('up')
      return
    }

    setOpenDirection('down')
  }, [isOpen, options.length])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div className="picked-select" ref={dropdownRef}>
      <button
        type="button"
        className={`picked-select-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        ref={triggerRef}
      >
        <span className="picked-select-label">{value || '选择词条'}</span>
        <span className="picked-select-caret" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className={`picked-select-menu is-${openDirection}`} role="listbox">
          {options.map((option) => {
            const isSelected = option === value

            return (
              <button
                key={option}
                type="button"
                className={`picked-select-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  onSelect(option)
                  setIsOpen(false)
                }}
                role="option"
                aria-selected={isSelected}
              >
                {option}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function App() {
  const [template, setTemplate] = useState('')
  const [bulkBindingsText, setBulkBindingsText] = useState(initialState.bulkBindingsText)
  const [placeholderStyleText, setPlaceholderStyleText] = useState(initialState.placeholderStyleText)
  const [placeholders, setPlaceholders] = useState([])
  const [bindings, setBindings] = useState(initialState.bindings)
  const [output, setOutput] = useState('')
  const [copyState, setCopyState] = useState('idle')
  const copyTimeoutRef = useRef(null)
  const placeholderStyle = resolvePlaceholderStyle(placeholderStyleText)

  useEffect(() => {
    const nextPlaceholders = parseTemplate(template, placeholderStyle)
    setPlaceholders(nextPlaceholders)
    setBindings((currentBindings) => {
      const nextBindings = {}

      for (const placeholder of nextPlaceholders) {
        nextBindings[placeholder.normalizedKey] = currentBindings[placeholder.normalizedKey] ?? {
          fileName: '',
          lines: [],
          lastPicked: '',
        }
      }

      return nextBindings
    })
  }, [template, placeholderStyleText])

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bindings,
        bulkBindingsText,
        placeholderStyleText,
      }),
    )
  }, [bindings, bulkBindingsText, placeholderStyleText])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  async function handleFileChange(placeholderKey, event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const text = await file.text()
    const lines = text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)

    setBindings((currentBindings) => ({
      ...currentBindings,
      [placeholderKey]: {
        ...currentBindings[placeholderKey],
        fileName: file.name,
        lines,
        lastPicked: lines[0] ?? currentBindings[placeholderKey]?.lastPicked ?? '',
      },
    }))

    event.target.value = ''
  }

  function handlePickedChange(placeholderKey, value) {
    setBindings((currentBindings) => ({
      ...currentBindings,
      [placeholderKey]: {
        ...currentBindings[placeholderKey],
        lastPicked: value,
      },
    }))
  }

  function handleApplyBulkBindings() {
    const parsedValues = parseBulkBindings(bulkBindingsText, placeholders, placeholderStyle)

    if (Object.keys(parsedValues).length === 0) {
      return
    }

    setBindings((currentBindings) => {
      const nextBindings = { ...currentBindings }

      for (const [placeholderKey, value] of Object.entries(parsedValues)) {
        nextBindings[placeholderKey] = {
          ...(currentBindings[placeholderKey] ?? {
            fileName: '',
            lines: [],
            lastPicked: '',
          }),
          lastPicked: value,
        }
      }

      return nextBindings
    })
  }

  function handleRandomize() {
    const result = buildPrompt(template, placeholders, bindings)

    setOutput(result.output)
    setBindings((currentBindings) => {
      const nextBindings = { ...currentBindings }

      for (const placeholder of placeholders) {
        const currentBinding = nextBindings[placeholder.normalizedKey] ?? {
          fileName: '',
          lines: [],
          lastPicked: '',
        }

        nextBindings[placeholder.normalizedKey] = {
          ...currentBinding,
          lastPicked: result.picks[placeholder.normalizedKey] ?? '',
        }
      }

      return nextBindings
    })
  }

  function handleComposeFromPicked() {
    setOutput(buildPromptFromPicks(template, placeholders, bindings))
  }

  function handleClearCache() {
    window.localStorage.removeItem(STORAGE_KEY)
    setBindings(() => {
      const nextBindings = {}

      for (const placeholder of placeholders) {
        nextBindings[placeholder.normalizedKey] = {
          fileName: '',
          lines: [],
          lastPicked: '',
        }
      }

      return nextBindings
    })
    setBulkBindingsText('')
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output)
      } else if (!fallbackCopyText(output)) {
        throw new Error('Copy fallback failed')
      }

      setCopyState('copied')

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

      copyTimeoutRef.current = window.setTimeout(() => {
        setCopyState('idle')
      }, 1500)
    } catch {
      try {
        if (fallbackCopyText(output)) {
          setCopyState('copied')

          if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current)
          }

          copyTimeoutRef.current = window.setTimeout(() => {
            setCopyState('idle')
          }, 1500)
          return
        }
      } catch {
      }

      setCopyState('error')
    }
  }

  const placeholderCount = placeholders.length

  return (
    <main className="app-shell">
      <header className="workspace-topbar">
        <div className="topbar-copy">
          <h1>提示词随机组合器</h1>
          <p>左侧整理模板与映射，右侧即时生成结果，整个流程尽量保持在一屏内完成。</p>
        </div>
        <div className="topbar-meta">
          <div className="meta-pill">
            <span className="meta-label">占位符</span>
            <strong>{placeholderCount}</strong>
          </div>
          <div className="meta-pill">
            <span className="meta-label">模式</span>
            <strong>本地离线</strong>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="workspace-column">
          <section className="card section-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">模板区</p>
                <h2>输入提示词模板</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setTemplate('')}>
                清空模板
              </button>
            </div>

            <div className="template-toolbar">
              <label className="style-field compact-field">
                <span className="style-label">占位符样式</span>
                <input
                  className="style-input"
                  type="text"
                  value={placeholderStyleText}
                  onChange={(event) => setPlaceholderStyleText(event.target.value)}
                  placeholder="[NAME]"
                />
              </label>
              <div className="template-note">
                <span className="template-note-label">说明</span>
                <p>用 NAME 作为变量位置，例如：{placeholderStyle.preview}</p>
              </div>
            </div>

            <textarea
              className="template-input"
              placeholder={`在这里粘贴提示词模板。例如：一个 ${placeholderStyle.open || '['}角色${placeholderStyle.close || ']'} 的 ${placeholderStyle.open || '['}发型${placeholderStyle.close || ']'} 插画`}
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            />

            <div className="section-footer">
              <p className="summary-text">已识别占位符：{placeholderCount}</p>
            </div>
          </section>

          <section className="card section-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">映射区</p>
                <h2>占位符词库与已选值</h2>
              </div>
              <button type="button" className="ghost-button" onClick={handleClearCache}>
                清除映射缓存
              </button>
            </div>

            <div className="bulk-binding-panel">
              <div className="bulk-binding-header">
                <div>
                  <p className="section-kicker">批量赋值</p>
                  <h3 className="bulk-binding-title">按行写入已选内容</h3>
                </div>
                <button type="button" className="ghost-button" onClick={handleApplyBulkBindings}>
                  应用批量赋值
                </button>
              </div>
              <textarea
                className="bulk-binding-input"
                value={bulkBindingsText}
                onChange={(event) => setBulkBindingsText(event.target.value)}
                placeholder={`例如：\n${placeholderStyle.preview.replace('NAME', '角色')}:大牛\n${placeholderStyle.preview.replace('NAME', '发型')}：平头`}
              />
              <p className="summary-text">
                支持中英文冒号；未匹配到当前模板占位符的行会自动忽略；值里的空格和末尾标点会自动清理。
              </p>
            </div>

            {placeholders.length === 0 ? (
              <div className="empty-state">
                <p>暂未识别到占位符。</p>
                <p>模板中出现例如 `[角色]` 这样的占位符后，这里会自动生成对应的词库映射项。</p>
              </div>
            ) : (
              <div className="mapping-list">
                {placeholders.map((placeholder) => {
                  const binding = bindings[placeholder.normalizedKey] ?? {
                    fileName: '',
                    lines: [],
                    lastPicked: '',
                  }
                  const selectedOption = binding.lines.includes(binding.lastPicked)
                    ? binding.lastPicked
                    : ''

                  return (
                    <article key={placeholder.normalizedKey} className="mapping-card">
                      <div className="mapping-row mapping-row-main">
                        <div className="mapping-main">
                          <div className="mapping-title-group">
                            <p className="token-label">{placeholder.label}</p>
                            <span className="mapping-badge">{binding.lines.length} 条</span>
                          </div>
                          <div className="mapping-inline-text">
                            <p className="token-subtitle">{binding.fileName || '未选择文件'}</p>
                            <p className="mapping-status-text">
                              {binding.fileName ? '将参与随机抽取' : '未绑定文件时按空文本处理'}
                            </p>
                          </div>
                        </div>

                        <label className="file-button">
                          <span>选择文件</span>
                          <input
                            type="file"
                            accept=".txt,text/plain"
                            onChange={(event) => handleFileChange(placeholder.normalizedKey, event)}
                          />
                        </label>
                      </div>

                      <div className="mapping-row picked-preview">
                        <span className="picked-label">已选值</span>
                        <div className="picked-controls">
                          <input
                            className="picked-input"
                            type="text"
                            value={binding.lastPicked}
                            onChange={(event) => handlePickedChange(placeholder.normalizedKey, event.target.value)}
                            placeholder="这里可以手动填写本次组合值"
                          />

                          {binding.lines.length > 0 ? (
                            <PickedLineDropdown
                              options={binding.lines}
                              value={selectedOption}
                              onSelect={(value) => handlePickedChange(placeholder.normalizedKey, value)}
                            />
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <div className="result-column">
          <section className="card output-card">
            <div className="result-shell">
              <div className="card-heading result-heading">
                <div>
                  <p className="section-kicker">结果区</p>
                  <h2>输出提示词</h2>
                </div>
                <p className="result-tip">生成后可以直接复制，适合连续试词和微调。</p>
              </div>

              <textarea
                className="output-view"
                readOnly
                value={output}
                placeholder="组合后的提示词会显示在这里。"
              />

              <div className="action-row">
                <button type="button" className="primary-button" onClick={handleRandomize}>
                  随机生成
                </button>
                <button type="button" className="secondary-button" onClick={handleComposeFromPicked}>
                  按已选组合
                </button>
                <button type="button" className="secondary-button" onClick={handleCopy}>
                  <span className={`copy-indicator ${copyState}`}>✓</span>
                  <span>复制结果</span>
                </button>
              </div>

              <div className="result-status">
                {copyState === 'copied'
                  ? '已复制到剪贴板。'
                  : copyState === 'error'
                    ? '复制失败，请检查浏览器剪贴板权限。'
                    : '未绑定文件的占位符在随机时会按空文本处理。'}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
