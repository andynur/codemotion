import index from "./src/index.html";

const workerBuild = await Bun.build({
  entrypoints: ["./src/tracer/tracer.worker.ts"],
  target: "browser",
  minify: false,
});
if (!workerBuild.success || !workerBuild.outputs[0]) throw new Error("Could not build trace worker");
const workerSource = await workerBuild.outputs[0].text();

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  routes: {
    "/tracer.worker.js": () => new Response(workerSource, { headers: { "content-type": "text/javascript; charset=utf-8" } }),
    "/*": index,
  },
  development: { hmr: true, console: true },
});

console.log(`Code Motion Visualizer is running at ${server.url}`);
