const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const inputPath = path.join(root, 'bare', 'hyperswarm', 'app.js')
const outputPath = path.join(root, 'assets', 'hyperswarm.bundle.mjs')

const src = fs.readFileSync(inputPath, 'utf8')

const out = `export default ${JSON.stringify(src)}\n`

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, out, 'utf8')

process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${src.length} chars)\n`)
