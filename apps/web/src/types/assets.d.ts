// Type declarations for CSS side-effect imports, e.g.
//   import "../globals.css";
//   import "maplibre-gl/dist/maplibre-gl.css";
// Next.js compiles these at build time; this satisfies the TypeScript
// checker (otherwise TS2882: "Cannot find module ... for side-effect import").
declare module "*.css";
