/* eslint-disable quote-props */
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

dotenv.config();

// For check flag in main.ts
process.env.VITE = '1';
export default defineConfig({
  server: {
    port: Number(process.env.PORT),
  },
  plugins: [
    ...VitePluginNode({
      adapter: 'nest',
      appPath: './src/main.ts',
      exportName: 'viteNodeApp',
      tsCompiler: 'swc',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      core: path.resolve(__dirname, '../../packages/core'),
      shared: path.resolve(__dirname, '../../packages/shared'),
    },
  },
  optimizeDeps: {
    exclude: [
      'class-transformer/storage',
      '@nestjs/websockets/socket-module',
      'mock-aws-s3',
      'hbs',
      '@nestjs/microservices/microservices-module',
      'aws-sdk',
      'nock',
      './fsevents.node',
      'json2csv',
    ],
  },
});
