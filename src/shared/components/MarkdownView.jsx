/**
 * Renderizador de Markdown minimalista, sem dependência nova no
 * projeto -- suficiente pro texto simples de um documento legal
 * (títulos, parágrafos, listas, negrito, links). Não cobre a
 * sintaxe completa do Markdown de propósito.
 */
function renderInline(text, keyPrefix) {
  // **negrito** e [texto](url), nessa ordem, sem aninhar um dentro do outro.
  const parts = []
  let rest = text
  let i = 0
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/
  while (rest.length > 0) {
    const m = rest.match(pattern)
    if (!m) { parts.push(rest); break }
    if (m.index > 0) parts.push(rest.slice(0, m.index))
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{m[1]}</strong>)
    } else {
      parts.push(
        <a key={`${keyPrefix}-${i++}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
          {m[2]}
        </a>
      )
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return parts
}

export default function MarkdownView({ markdown }) {
  const lines = (markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\\[/g, '[').replace(/\\\]/g, ']') // \[texto\] -> [texto] (placeholders do rascunho)
    .split('\n')
  const blocks = []
  let listBuffer = []

  function flushList(key) {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 my-2">
          {listBuffer.map((item, idx) => <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>)}
        </ul>
      )
      listBuffer = []
    }
  }

  const isTableRow = (l) => /^\|.*\|$/.test(l.trim())
  const isTableSep = (l) => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(l.trim())
  const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx]
    const trimmed = line.trim()

    if (/^(-|\*)\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^(-|\*)\s+/, ''))
      idx++
      continue
    }
    flushList(idx)

    if (isTableRow(trimmed) && isTableSep(lines[idx + 1] || '')) {
      const header = splitRow(trimmed)
      idx += 2
      const rows = []
      while (idx < lines.length && isTableRow(lines[idx].trim())) {
        rows.push(splitRow(lines[idx]))
        idx++
      }
      blocks.push(
        <div key={`table-${idx}`} className="overflow-x-auto my-3">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-bold text-gray-700">
                    {renderInline(h, `th-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-gray-200 px-3 py-2 align-top text-gray-600">
                      {renderInline(c, `td-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (!trimmed || trimmed === '>') { idx++; continue }
    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote key={idx} className="border-l-4 border-amber-300 bg-amber-50 pl-4 py-2 my-2 text-sm text-amber-800">
          {renderInline(trimmed.slice(2), idx)}
        </blockquote>
      )
    } else if (trimmed.startsWith('### ')) {
      blocks.push(<h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-1.5">{renderInline(trimmed.slice(4), idx)}</h3>)
    } else if (trimmed.startsWith('## ')) {
      blocks.push(<h2 key={idx} className="text-lg font-black text-gray-900 mt-6 mb-2">{renderInline(trimmed.slice(3), idx)}</h2>)
    } else if (trimmed.startsWith('# ')) {
      blocks.push(<h1 key={idx} className="text-2xl font-black text-gray-900 mt-2 mb-3">{renderInline(trimmed.slice(2), idx)}</h1>)
    } else {
      blocks.push(<p key={idx} className="text-sm text-gray-600 leading-relaxed my-2">{renderInline(trimmed, idx)}</p>)
    }
    idx++
  }
  flushList('end')

  return <div>{blocks}</div>
}
