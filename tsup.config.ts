import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'protocol-handler': 'src/protocol-handler.ts',
    'react/index': 'src/react/index.ts'
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  external: ['react']
});
