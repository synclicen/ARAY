import type { Config } from 'tailwindcss'
import resolve from 'path'

const config: Config = {
  content: [
    resolve(__dirname, '../src/renderer/src/**/*.{js,ts,jsx,tsx,html}'),
    resolve(__dirname, '../src/renderer/index.html'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
