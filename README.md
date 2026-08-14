# SIEM Pipeline Simulator

A web-based tool to simulate, test, and generate SIEM pipeline configurations (Logstash and Vector VRL) without the need to deploy them to a real engine.

## Key Features

1. **Whitelist Simulator**
   - Test your Logstash (`.conf`) and Vector VRL conditional rules against raw JSON logs.
   - See detailed evaluation traces explaining exactly *why* a rule matched or failed.
   - Supports multiple rules triggering simultaneously and array-forming for `whitelist` fields.
   - Now powered by **Native VRL WASM (WebAssembly)** for exact parity with Vector engines.

2. **Parser Simulator**
   - Simulate and debug data parsing and transformation rules (WIP).

3. **Auto Whitelist Creator**
   - Use AI-assisted tools (OpenAI GPT-4o) to automatically generate whitelist rules based on your log samples.
   - Features built-in AST code linting and real-time validation to ensure the generated rule is syntactically sound before displaying it.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS 4
- **Editor**: Monaco Editor (`@monaco-editor/react`) for JSON and configuration syntax highlighting
- **Parsing Engine**: 
  - *Logstash*: Custom Javascript AST parser & engine evaluator
  - *Vector*: Rust WebAssembly (WASM) native binding via `vrl-wasm`
- **Docker**: Ready to deploy with full containerization support

## Getting Started

First, install dependencies:

```bash
npm install
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to use the simulator.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
