const worker = await Bun.build({
  entrypoints: ["./src/tracer/tracer.worker.ts"],
  target: "browser",
  minify: true,
});
if (!worker.success || !worker.outputs[0]) throw new Error("Could not build trace worker");
const workerSource = await worker.outputs[0].text();

const app = await Bun.build({
  entrypoints: ["./src/index.html"],
  target: "browser",
  compile: true,
  minify: true,
  reactCompiler: true,
  conditions: ["production"],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [{
    name: "inline-trace-worker",
    setup(build) {
      build.onLoad({ filter: /worker-source\.ts$/ }, () => ({
        contents: `export const embeddedWorkerSource = ${JSON.stringify(workerSource)};`,
        loader: "ts",
      }));
    },
  }],
});
if (!app.success || !app.outputs[0]) throw new Error("Could not build standalone HTML");
await Bun.write("dist/code-motion.html", app.outputs[0]);
console.log(`Built offline HTML (${(app.outputs[0].size / 1_000_000).toFixed(2)} MB)`);
