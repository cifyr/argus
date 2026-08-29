import { chromium, type BrowserContext, type Page } from "playwright";
import { logger } from "../logger.js";

export const GV_URL = "https://voice.google.com/u/0";

// Replaces the microphone with a Web Audio destination so TTS clips become the call's outgoing audio.
// No virtual audio devices needed. Exposed helpers: __relayPlay(base64Wav) -> seconds, __relayStop(), __relayStatus().
const AUDIO_INJECT_SCRIPT = `(() => {
  const md = navigator.mediaDevices;
  if (!md || md.__relayPatched) return;
  md.__relayPatched = true;
  const origGUM = md.getUserMedia.bind(md);
  const origEnum = md.enumerateDevices.bind(md);
  let ctx, dest, current;
  const state = { gumCalls: 0, plays: 0, lastError: null };
  function ensure() {
    if (!ctx) { ctx = new AudioContext({ sampleRate: 48000 }); dest = ctx.createMediaStreamDestination(); }
    return { ctx, dest };
  }
  md.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) return origGUM(constraints);
    const { ctx, dest } = ensure();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    state.gumCalls++;
    const stream = new MediaStream(dest.stream.getAudioTracks());
    if (constraints.video) {
      try { const v = await origGUM({ video: constraints.video }); v.getVideoTracks().forEach(t => stream.addTrack(t)); } catch (e) {}
    }
    return stream;
  };
  md.enumerateDevices = async () => {
    const list = await origEnum();
    if (list.some(d => d.kind === 'audioinput')) return list;
    return [...list, { deviceId: 'relay-mic', groupId: 'relay', kind: 'audioinput', label: 'Relay TTS Microphone', toJSON() { return this; } }];
  };
  window.__relayPlay = (base64) => new Promise(async (resolve, reject) => {
    try {
      const { ctx, dest } = ensure();
      if (ctx.state === 'suspended') await ctx.resume();
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const audio = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(dest);
      current = src;
      state.plays++;
      src.onended = () => { if (current === src) current = null; resolve(audio.duration); };
      src.start();
    } catch (e) { state.lastError = String(e); reject(e); }
  });
  window.__relayStop = () => { try { if (current) current.stop(); } catch (e) {} current = null; };
  window.__relayStatus = () => ({ ...state, ctxState: ctx ? ctx.state : 'none', playing: Boolean(current) });
})();`;

export interface GvBrowser { context: BrowserContext; page: Page; close(): Promise<void> }

export async function launchGvBrowser(opts: { profileDir: string; headless: boolean }): Promise<GvBrowser> {
  logger.info("browser.launch", opts);
  const context = await chromium.launchPersistentContext(opts.profileDir, {
    channel: "chrome",
    headless: opts.headless,
    viewport: { width: 1280, height: 900 },
    args: [
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  await context.grantPermissions(["microphone"], { origin: "https://voice.google.com" });
  await context.addInitScript(AUDIO_INJECT_SCRIPT);
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (m) => { if (m.type() === "error") logger.warn("browser.console.error", { text: m.text().slice(0, 300) }); });
  return { context, page, close: () => context.close() };
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(`${GV_URL}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const url = page.url();
  const loggedIn = url.startsWith("https://voice.google.com/");
  logger.info("browser.login_check", { url, loggedIn });
  return loggedIn;
}
