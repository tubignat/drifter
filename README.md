# Drifter

A TypeScript library template with strict type checking enabled.

## Features

- ✅ TypeScript with strict mode and null safety
- ✅ ESLint configuration with TypeScript rules
- ✅ Build scripts for compilation
- ✅ Declaration files generation
- ✅ Source maps support

## Installation

```bash
npm install drifter
```

## Usage

```typescript
import { greet, Calculator } from 'drifter';

// Simple greeting function
console.log(greet('Hello')); // "Hello!"
console.log(greet('Hello', 'World')); // "Hello, World!"

// Calculator with strict typing
const calc = new Calculator();
const result = calc.add(5, 3); // 8
console.log(calc.getLastResult()); // 8
```

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run build:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Clean

```bash
npm run clean
```

## TypeScript Configuration

This library uses strict TypeScript configuration with:

- `strict: true` - Enables all strict type checking options
- `strictNullChecks: true` - Ensures null safety
- `noImplicitAny: true` - Requires explicit type annotations
- `exactOptionalPropertyTypes: true` - Strict optional property handling
- `noUncheckedIndexedAccess: true` - Safe array/object access

## License

MIT