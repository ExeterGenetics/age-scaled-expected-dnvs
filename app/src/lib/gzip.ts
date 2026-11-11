// Gzip decoding with the browser's DecompressionStream, which reads only the first gzip
// member. bgzip output (.vcf.gz, .tsv.gz from htslib) is many members, so BGZF files are
// split into their blocks using the block size in each header and decoded block by block.

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// [start, end) byte offsets of BGZF blocks, or null when the data is not BGZF
export function bgzfBlocks(b: Uint8Array): [number, number][] | null {
  const blocks: [number, number][] = []
  let off = 0
  while (off < b.length) {
    if (off + 18 > b.length || b[off] !== 0x1f || b[off + 1] !== 0x8b || !(b[off + 3] & 4)) return null
    const xlen = b[off + 10] | (b[off + 11] << 8)
    let bsize = -1
    for (let p = off + 12; p + 4 <= off + 12 + xlen;) {
      const slen = b[p + 2] | (b[p + 3] << 8)
      if (b[p] === 66 && b[p + 1] === 67 && slen === 2) bsize = b[p + 4] | (b[p + 5] << 8)
      p += 4 + slen
    }
    if (bsize < 0) return null
    blocks.push([off, off + bsize + 1])
    off += bsize + 1
  }
  return blocks
}

export async function gunzipText(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const blocks = bgzfBlocks(bytes)
  if (!blocks) return new TextDecoder().decode(await inflate(bytes))
  const parts: Uint8Array[] = []
  for (let i = 0; i < blocks.length; i += 64) {
    parts.push(...await Promise.all(blocks.slice(i, i + 64).map(([s, e]) => inflate(bytes.subarray(s, e)))))
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return new TextDecoder().decode(out)
}

export async function readFileText(file: File): Promise<string> {
  if (/\.b?gz$/i.test(file.name)) return gunzipText(new Uint8Array(await file.arrayBuffer()))
  return file.text()
}
