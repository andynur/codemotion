const url = Bun.env.SMOKE_URL ?? "http://localhost:3000/";
const errors: string[] = [];

await using view = new Bun.WebView({
  width: 1440,
  height: 900,
  console: (type, ...args) => {
    if (type === "error") errors.push(args.map(String).join(" "));
  },
});

await view.navigate(url);
const initial = await view.evaluate(`new Promise((resolve) => {
  const started = Date.now();
  const check = () => {
    const preset = document.querySelector('[data-testid="preset-picker"]')?.value;
    if (preset || Date.now() - started > 5000) return resolve({ title: document.title, preset, body: document.body.innerText });
    setTimeout(check, 25);
  };
  check();
})`);
if (initial.title !== "Code Motion Visualizer" || initial.preset !== "bubble") throw new Error(`Unexpected initial state: ${JSON.stringify(initial)}\n${errors.join("\n")}`);

await view.click("#run-button");
const result = await view.evaluate(`new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    const status = document.querySelector('[data-testid="trace-status"]')?.textContent ?? '';
    if (/^\\d+ steps$/.test(status)) return resolve(status);
    if (document.querySelector('[role="alert"]')) return reject(new Error(document.querySelector('[role="alert"]')?.textContent ?? 'Trace failed'));
    if (Date.now() - started > 5000) return reject(new Error('Trace did not finish'));
    setTimeout(check, 25);
  };
  check();
})`);

const middle = await view.evaluate(`(() => {
  const timeline = document.querySelector('#timeline');
  const midpoint = Math.floor(Number(timeline.max) / 2);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(timeline, String(midpoint));
  timeline.dispatchEvent(new Event('input', { bubbles: true }));
  timeline.dispatchEvent(new Event('change', { bubbles: true }));
  return { midpoint, max: Number(timeline.max) };
})()`);
await Bun.sleep(100);
const current = await view.evaluate(`Number(document.querySelector('[data-testid="current-step"]')?.textContent)`);
if (current !== middle.midpoint + 1) throw new Error(`Timeline did not move to the middle: ${current}`);

await view.click('[aria-label="Step forward"]');
const steppedForward = await view.evaluate(`Number(document.querySelector('[data-testid="current-step"]')?.textContent)`);
await view.click('[aria-label="Step back"]');
const steppedBack = await view.evaluate(`Number(document.querySelector('[data-testid="current-step"]')?.textContent)`);
if (steppedForward !== current + 1 || steppedBack !== current) throw new Error("Step controls did not move exactly one step");
await view.click('[aria-label="Play"]');
await Bun.sleep(600);
const played = await view.evaluate(`Number(document.querySelector('[data-testid="current-step"]')?.textContent)`);
if (played <= current) throw new Error("Play did not advance the timeline");
await view.click('[aria-label="Pause"]');

await view.evaluate(`(() => {
  const picker = document.querySelector('[data-testid="preset-picker"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(picker, 'factorial');
  picker.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await view.click("#run-button");
const functionTrace = await view.evaluate(`new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    const status = document.querySelector('[data-testid="trace-status"]')?.textContent ?? '';
    if (/^\\d+ steps$/.test(status)) return resolve(status);
    if (Date.now() - started > 5000) return reject(new Error('Function trace did not finish'));
    setTimeout(check, 25);
  };
  check();
})`);
await view.evaluate(`(() => {
  const timeline = document.querySelector('#timeline');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(timeline, '9');
  timeline.dispatchEvent(new Event('input', { bubbles: true }));
  timeline.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await Bun.sleep(100);
const callStack = await view.evaluate(`({
  frames: document.querySelectorAll('section[aria-label="Call stack"] li').length,
  active: document.querySelector('section[aria-label="Call stack"] li')?.textContent ?? ''
})`);
if (callStack.frames !== 5 || !callStack.active.includes("factorial")) throw new Error(`Call stack did not render recursion: ${JSON.stringify(callStack)}`);

await Bun.write("artifacts/smoke.png", await view.screenshot({ format: "png" }));
await view.resize(390, 820);
await Bun.sleep(100);
const mobile = await view.evaluate(`({ width: document.documentElement.scrollWidth, viewport: innerWidth, status: document.querySelector('[data-testid="trace-status"]')?.textContent })`);
if (mobile.width > mobile.viewport) throw new Error(`Mobile layout overflows: ${JSON.stringify(mobile)}`);
await Bun.write("artifacts/smoke-mobile.png", await view.screenshot({ format: "png" }));

await view.resize(1440, 900);
await view.click(".cm-content");
await view.press("a", { modifiers: ["Meta"] });
await view.type("while (true) {}");
await view.click("#run-button");
const limitMessage = await view.evaluate(`new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    const alert = document.querySelector('[role="alert"]')?.textContent ?? '';
    if (alert) return resolve(alert);
    if (Date.now() - started > 5000) return reject(new Error('Step-limit message did not appear'));
    setTimeout(check, 25);
  };
  check();
})`);
if (!limitMessage.includes("step limit")) throw new Error(`Unexpected infinite-loop result: ${limitMessage}`);

if (errors.length) throw new Error(`Browser console errors:\n${errors.join("\n")}`);
console.log(`Smoke passed: ${result}, midpoint ${current}/${middle.max + 1}, playback advanced to ${played}, ${functionTrace} with ${callStack.frames} call frames, mobile width ${mobile.width}, infinite loop stopped.`);
