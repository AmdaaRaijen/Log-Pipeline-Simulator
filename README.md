# SIEM Pipeline Simulator

A web-based tool to simulate, test, and generate SIEM pipeline configurations (Logstash and Vector VRL) without the need to deploy them to a real engine.

## Key Features

1. **Whitelist / Exclude Simulator**
   - Test your Logstash (`.conf`) and Vector (`.toml`/VRL) conditional rules against raw JSON logs.
   - See detailed evaluation traces explaining exactly *why* a rule matched or failed.
   - Supports complex conditions, nested fields, regex matching, and field mutations.

2. **Parser Simulator**
   - Simulate and debug data parsing and transformation rules.

3. **Auto Whitelist Creator**
   - Use AI-assisted tools to automatically generate whitelist rules based on your log samples.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, TailwindCSS
- **Editor**: Monaco Editor (`@monaco-editor/react`) for JSON and configuration syntax highlighting
- **Parsing Engine**: Custom AST parser and condition evaluator for Logstash and Vector VRL

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
