// Vercel serverless function entry.
//
// Plain JS on purpose: this re-exports the tsc-COMPILED Nest handler
// (dist/lambda.js, produced by `nest build` via vercel.json's buildCommand).
// We import the built output rather than the TS source because Vercel bundles
// functions with esbuild, which does NOT emit the `emitDecoratorMetadata` that
// NestJS's DI relies on — tsc does. Keeping this file as .js avoids any
// type-resolution coupling to dist/.
module.exports = require("../dist/lambda.js").default;
