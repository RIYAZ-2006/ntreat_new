// driver.js
// ─────────────────────────────────────────────────────────────────────────────
// Playwright-based page crawler with built-in Wappalyzer detection.
// Loads fingerprints directly from the 6.12.2_0 extension folder and runs
// all detectors (headers, cookies, html, scripts, js, url, meta) internally.
//
// Input:  process.argv[2] = target URL
//         process.argv[3] = (optional) path to Wappalyzer extension folder
//                           defaults to "./6.12.2_0"
//
// Output: JSON to stdout with shape:
//   {
//     finalUrl, navigationSuccess,
//     detections: [{ name, categories, version, confidence }],
//     raw: { responseHeaders, cookies, rawHtml, scriptSrcs, jsProperties }
//   }
// ─────────────────────────────────────────────────────────────────────────────

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const TARGET_URL = process.argv[2];
if (!TARGET_URL) {
  console.error("Usage: node driver.js <url> [path/to/6.12.2_0]");
  process.exit(1);
}

const EXT_DIR = process.argv[3] || path.join(__dirname, "6.12.2_0");

// ── Load Wappalyzer technologies from extension ───────────────────────────────
function loadTechnologies() {
  const techDir = path.join(EXT_DIR, "technologies");
  const technologiesPath = path.join(EXT_DIR, "technologies.json");

  let technologies = {};

  // Try single technologies.json first
  if (fs.existsSync(technologiesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(technologiesPath, "utf8"));
      technologies = data.technologies || data;
    } catch (e) {}
  }

  // Try split files (a.json, b.json ... z.json) inside technologies/
  if (fs.existsSync(techDir)) {
    for (const file of fs.readdirSync(techDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const chunk = JSON.parse(fs.readFileSync(path.join(techDir, file), "utf8"));
        Object.assign(technologies, chunk);
      } catch (e) {}
    }
  }

  return technologies;
}

// Load categories
function loadCategories() {
  const catPath = path.join(EXT_DIR, "categories.json");
  if (fs.existsSync(catPath)) {
    try {
      return JSON.parse(fs.readFileSync(catPath, "utf8"));
    } catch (e) {}
  }
  return {};
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

// Wappalyzer pattern format: "regex\\;version:\\1\\;confidence:50"
function parsePattern(raw) {
  const parts = String(raw).split("\\;");
  const pattern = parts[0];
  let version = "";
  let confidence = 100;
  for (let i = 1; i < parts.length; i++) {
    const [key, val] = parts[i].split(":");
    if (key === "version") version = val || "";
    if (key === "confidence") confidence = parseInt(val, 10) || 100;
  }
  let regex = null;
  try {
    regex = new RegExp(pattern, "i");
  } catch (e) {
    regex = null;
  }
  return { regex, version, confidence, raw: pattern };
}

// Extract version string from regex match + version template
function extractVersion(match, versionTemplate) {
  if (!versionTemplate || !match) return "";
  return versionTemplate.replace(/\\(\d)/g, (_, i) => match[parseInt(i)] || "").trim();
}

// ── Main detection logic ──────────────────────────────────────────────────────
function detect(technologies, categories, data) {
  const results = {};

  const ensure = (name) => {
    if (!results[name]) {
      results[name] = { name, confidence: 0, version: "", evidence: [] };
    }
  };

  const hit = (name, confidence, version, source) => {
    ensure(name);
    if (confidence > results[name].confidence) {
      results[name].confidence = confidence;
    }
    if (version) results[name].version = version;
    results[name].evidence.push(source);
  };

  for (const [techName, tech] of Object.entries(technologies)) {
    // ── URL ──
    if (tech.url && data.url) {
      const patterns = [].concat(tech.url);
      for (const raw of patterns) {
        const p = parsePattern(raw);
        if (p.regex && p.regex.test(data.url)) {
          const m = data.url.match(p.regex);
          hit(techName, p.confidence, extractVersion(m, p.version), `url: ${data.url}`);
        }
      }
    }

    // ── Headers ──
    if (tech.headers && data.headers) {
      for (const [hdrName, rawPat] of Object.entries(tech.headers)) {
        const headerVal = data.headers[hdrName.toLowerCase()];
        if (!headerVal) continue;
        const patterns = [].concat(rawPat);
        for (const raw of patterns) {
          const p = parsePattern(raw);
          if (!p.regex || p.regex.test(headerVal)) {
            const m = p.regex ? headerVal.match(p.regex) : null;
            hit(techName, p.confidence, extractVersion(m, p.version), `header: ${hdrName}: ${headerVal.slice(0, 100)}`);
          }
        }
      }
    }

    // ── Cookies ──
    if (tech.cookies && data.cookies) {
      for (const [cookieName, rawPat] of Object.entries(tech.cookies)) {
        const cookie = data.cookies.find(
          (c) => c.name.toLowerCase() === cookieName.toLowerCase()
        );
        if (!cookie) continue;
        const patterns = [].concat(rawPat);
        for (const raw of patterns) {
          const p = parsePattern(raw);
          if (!p.regex || p.regex.test(cookie.value)) {
            const m = p.regex ? cookie.value.match(p.regex) : null;
            hit(techName, p.confidence, extractVersion(m, p.version), `cookie: ${cookieName}`);
          }
        }
      }
    }

    // ── HTML ──
    if (tech.html && data.html) {
      const patterns = [].concat(tech.html);
      for (const raw of patterns) {
        const p = parsePattern(raw);
        if (p.regex && p.regex.test(data.html)) {
          const m = data.html.match(p.regex);
          hit(techName, p.confidence, extractVersion(m, p.version), `html match`);
        }
      }
    }

    // ── Meta tags ──
    if (tech.meta && data.meta) {
      for (const [metaName, rawPat] of Object.entries(tech.meta)) {
        const metaVal = data.meta[metaName.toLowerCase()];
        if (!metaVal) continue;
        const patterns = [].concat(rawPat);
        for (const raw of patterns) {
          const p = parsePattern(raw);
          if (!p.regex || p.regex.test(metaVal)) {
            const m = p.regex ? metaVal.match(p.regex) : null;
            hit(techName, p.confidence, extractVersion(m, p.version), `meta: ${metaName}`);
          }
        }
      }
    }

    // ── Script sources ──
    if (tech.scriptSrc && data.scriptSrcs) {
      const patterns = [].concat(tech.scriptSrc);
      for (const src of data.scriptSrcs) {
        for (const raw of patterns) {
          const p = parsePattern(raw);
          if (p.regex && p.regex.test(src)) {
            const m = src.match(p.regex);
            hit(techName, p.confidence, extractVersion(m, p.version), `script: ${src}`);
          }
        }
      }
    }

    // ── JS properties ──
    if (tech.js && data.jsProperties) {
      for (const [prop, rawPat] of Object.entries(tech.js)) {
        const val = data.jsProperties[prop];
        if (val === undefined || val === null) continue;
        const patterns = [].concat(rawPat);
        for (const raw of patterns) {
          const p = parsePattern(raw);
          if (!p.regex || p.regex.test(String(val))) {
            const m = p.regex ? String(val).match(p.regex) : null;
            hit(techName, p.confidence, extractVersion(m, p.version), `js: ${prop} = ${String(val).slice(0, 80)}`);
          }
        }
      }
    }
  }

  // ── Resolve implies ──
  let changed = true;
  while (changed) {
    changed = false;
    for (const techName of Object.keys(results)) {
      const tech = technologies[techName];
      if (!tech || !tech.implies) continue;
      const implies = [].concat(tech.implies);
      for (const impl of implies) {
        const parts = impl.split("\\;");
        const impliedName = parts[0];
        let confidence = 100;
        for (let i = 1; i < parts.length; i++) {
          const [k, v] = parts[i].split(":");
          if (k === "confidence") confidence = parseInt(v, 10) || 100;
        }
        if (!results[impliedName]) {
          results[impliedName] = {
            name: impliedName,
            confidence,
            version: "",
            evidence: [`implied by ${techName}`],
          };
          changed = true;
        }
      }
    }
  }

  // ── Attach categories ──
  const detections = [];
  for (const [name, result] of Object.entries(results)) {
    const tech = technologies[name];
    const cats = tech
      ? [].concat(tech.cats || []).map((id) => {
          const cat = categories[String(id)];
          return cat ? cat.name : String(id);
        })
      : [];
    detections.push({ ...result, categories: cats });
  }

  return detections.sort((a, b) => b.confidence - a.confidence);
}

// ── Playwright page scraper ───────────────────────────────────────────────────
(async () => {
  let browser;
  try {
    const technologies = loadTechnologies();
    const categories = loadCategories();

    if (Object.keys(technologies).length === 0) {
      console.log(
        JSON.stringify({ error: `No technologies loaded from: ${EXT_DIR}` })
      );
      process.exit(1);
    }

    // Collect all JS property paths needed
    const jsProps = [];
    for (const tech of Object.values(technologies)) {
      if (tech.js) {
        for (const prop of Object.keys(tech.js)) {
          if (!jsProps.includes(prop)) jsProps.push(prop);
        }
      }
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    let responseHeaders = {};
    let navigationSuccess = false;
    const scriptSrcs = [];

    page.on("response", (response) => {
      if (response.request().isNavigationRequest()) {
        try { responseHeaders = response.headers(); } catch (_) {}
      }
    });

    page.on("request", (request) => {
      if (request.resourceType() === "script") {
        const url = request.url();
        if (url && !scriptSrcs.includes(url)) scriptSrcs.push(url);
      }
    });

    try {
      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);
      navigationSuccess = true;
    } catch (e) {
      navigationSuccess = false;
    }

    const finalUrl = page.url();
    let rawHtml = "";
    try { rawHtml = await page.content(); } catch (_) {}

    let cookies = [];
    try { cookies = await context.cookies(); } catch (_) {}

    // Extract meta tags
    let meta = {};
    try {
      meta = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll("meta[name], meta[property]").forEach((el) => {
          const key = (el.getAttribute("name") || el.getAttribute("property") || "").toLowerCase();
          if (key) out[key] = el.getAttribute("content") || "";
        });
        return out;
      });
    } catch (_) {}

    // Evaluate JS properties
    const jsProperties = {};
    if (jsProps.length > 0 && navigationSuccess) {
      try {
        const results = await page.evaluate((props) => {
          const out = {};
          for (const propPath of props) {
            try {
              const parts = propPath.split(".");
              let obj = window;
              for (const part of parts) {
                if (obj == null || (typeof obj !== "object" && typeof obj !== "function")) {
                  obj = undefined; break;
                }
                obj = obj[part];
              }
              if (obj === undefined || obj === null) { out[propPath] = null; }
              else {
                const t = typeof obj;
                if (t === "string") out[propPath] = obj;
                else if (t === "number" || t === "boolean") out[propPath] = String(obj);
                else out[propPath] = "";
              }
            } catch (_) { out[propPath] = null; }
          }
          return out;
        }, jsProps);

        for (const [k, v] of Object.entries(results)) {
          if (v !== null) jsProperties[k] = v;
        }
      } catch (_) {}
    }

    // ── Run detection ──
    const detections = detect(technologies, categories, {
      url: finalUrl,
      headers: responseHeaders,
      cookies,
      html: rawHtml,
      meta,
      scriptSrcs,
      jsProperties,
    });

    console.log(
      JSON.stringify({
        finalUrl,
        navigationSuccess,
        detections,
        raw: { responseHeaders, cookies, scriptSrcs, jsProperties },
      }, null, 2)
    );

  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
  } finally {
    if (browser) await browser.close();
  }
})();