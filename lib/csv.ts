type Cell = string | number | boolean | null | undefined

function formatCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Notes are free text and spreadsheets execute cells that look like formulas.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(formatCell).join(',')).join('\r\n') + '\r\n'
}
