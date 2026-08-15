import { Fragment, createElement, type ReactNode } from 'react'

const SAFE_HREF = /^(https?:|mailto:|\/)/i

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const key = `${keyPrefix}-${index}`
    if (match[1] !== undefined) {
      nodes.push(<strong key={key}>{match[1]}</strong>)
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key}>{match[2]}</em>)
    } else if (match[3] !== undefined) {
      nodes.push(<code key={key}>{match[3]}</code>)
    } else if (SAFE_HREF.test(match[5])) {
      nodes.push(
        <a key={key} href={match[5]} target="_blank" rel="noopener noreferrer">
          {match[4]}
        </a>,
      )
    } else {
      nodes.push(match[4])
    }
    last = pattern.lastIndex
    index += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Multi-line block whose lines join with <br/> (paragraphs, blockquotes). */
function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}
      {renderInline(line, `${keyPrefix}-${lineIndex}`)}
    </Fragment>
  ))
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const HEADING = /^(#{1,6})\s+(.+)$/
const ORDERED_ITEM = /^\s*(\d+)\.\s+(.*)$/
const UNORDERED_ITEM = /^\s*[-*]\s+(.*)$/
const BLOCKQUOTE_ITEM = /^\s*>\s?(.*)$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

/** Renders a safe markdown subset (headings, tables, lists, blockquotes, rules, bold/italic/
 * code/links) as React elements — no HTML injection, hrefs are scheme-checked. */
export function renderMarkdown(content: string): ReactNode {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const fenceLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        fenceLines.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push(
        <pre key={`b${key++}`} className="assistant-md-code">
          <code>{fenceLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (RULE.test(line)) {
      blocks.push(<hr key={`b${key++}`} />)
      i += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const Tag = `h${heading[1].length}`
      blocks.push(
        createElement(
          Tag,
          { key: `b${key++}` },
          renderInline(heading[2], `h${key}`),
        ),
      )
      i += 1
      continue
    }

    if (
      TABLE_ROW.test(line) &&
      i + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[i + 1])
    ) {
      const header = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      const tableKey = key++
      blocks.push(
        <table key={`b${tableKey}`} className="assistant-md-table">
          <thead>
            <tr>
              {header.map((cell, cellIndex) => (
                <th key={cellIndex}>
                  {renderInline(cell, `t${tableKey}h-${cellIndex}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    {renderInline(
                      cell,
                      `t${tableKey}-${rowIndex}-${cellIndex}`,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    if (BLOCKQUOTE_ITEM.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && BLOCKQUOTE_ITEM.test(lines[i])) {
        quoted.push(BLOCKQUOTE_ITEM.exec(lines[i])![1])
        i += 1
      }
      const quoteKey = key++
      blocks.push(
        <blockquote key={`b${quoteKey}`}>
          {renderLines(quoted, `bq${quoteKey}`)}
        </blockquote>,
      )
      continue
    }

    if (ORDERED_ITEM.test(line)) {
      const items: string[] = []
      const start = Number(ORDERED_ITEM.exec(line)![1])
      while (i < lines.length && ORDERED_ITEM.test(lines[i])) {
        items.push(ORDERED_ITEM.exec(lines[i])![2])
        i += 1
      }
      const listKey = key++
      blocks.push(
        <ol key={`b${listKey}`} start={start}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              {renderInline(item, `ol${listKey}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    if (UNORDERED_ITEM.test(line)) {
      const items: string[] = []
      while (i < lines.length && UNORDERED_ITEM.test(lines[i])) {
        items.push(UNORDERED_ITEM.exec(lines[i])![1])
        i += 1
      }
      const listKey = key++
      blocks.push(
        <ul key={`b${listKey}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              {renderInline(item, `ul${listKey}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (line.trim() === '') {
      i += 1
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !RULE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !TABLE_ROW.test(lines[i]) &&
      !BLOCKQUOTE_ITEM.test(lines[i]) &&
      !ORDERED_ITEM.test(lines[i]) &&
      !UNORDERED_ITEM.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i += 1
    }
    blocks.push(<p key={`b${key++}`}>{renderLines(paraLines, `p${key}`)}</p>)
  }

  return blocks
}
