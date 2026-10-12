require("dotenv").config();

const express = require("express");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const cheerio = require("cheerio");
const { pool, testConnection } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Backend is running." });
});

app.get("/api/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "Database connected." });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({
      success: false,
      message: "Database connection failed. Check your .env settings."
    });
  }
});

function getSocialApiConfig() {
  return {
    instagram: {
      requiredEnv: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"],
      setupInstructions: "Use a Meta developer app with an Instagram Business or Creator account connected to a Facebook Page. Configure an authorized access token and the Instagram professional account ID.",
      enabled: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID),
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",
      businessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
      endpoint: "https://graph.facebook.com/v20.0"
    },
    youtube: {
      requiredEnv: ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"],
      setupInstructions: "Enable YouTube Data API v3 in a Google Cloud project, create a server-side API key, and provide the public channel ID.",
      enabled: Boolean(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_CHANNEL_ID),
      apiKey: process.env.YOUTUBE_API_KEY || "",
      channelId: process.env.YOUTUBE_CHANNEL_ID || "",
      endpoint: "https://www.googleapis.com/youtube/v3"
    },
    linkedin: {
      requiredEnv: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_ID"],
      setupInstructions: "Use a LinkedIn app approved for the required Marketing API product and an organization administrator-authorized access token. LinkedIn access and follower analytics are permission-restricted.",
      enabled: Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORGANIZATION_ID),
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
      organizationId: process.env.LINKEDIN_ORGANIZATION_ID || "",
      endpoint: "https://api.linkedin.com/v2"
    },
    facebook: {
      requiredEnv: ["FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID"],
      setupInstructions: "Use a Meta developer app and a Page Access Token authorized by a Facebook Page administrator. The app must have the permissions required for the Page fields being requested.",
      enabled: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID),
      accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "",
      pageId: process.env.FACEBOOK_PAGE_ID || "",
      endpoint: "https://graph.facebook.com/v20.0"
    }
  };
}

function buildSocialUnavailable(platform, reason, config) {
  const missingVariables = (config?.requiredEnv || []).filter(name => !process.env[name]);

  return {
    platform,
    status: "setup_required",
    reason,
    metrics: {},
    setup: {
      requiredVariables: config?.requiredEnv || [],
      missingVariables,
      instructions: config?.setupInstructions || ""
    }
  };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    let payload = null;

    if (contentType.includes("application/json") || rawText.trim().startsWith("{")) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { raw: rawText };
      }
    }

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `Request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlatformMetrics(platform) {
  const config = getSocialApiConfig()[platform];

  if (!config?.enabled) {
    return buildSocialUnavailable(
      platform,
      "Metrics are unavailable until this platform's official API access is configured.",
      config
    );
  }

  try {
    if (platform === "youtube") {
      const data = await fetchJson(
        `${config.endpoint}/channels?part=snippet,statistics&id=${encodeURIComponent(config.channelId)}&key=${encodeURIComponent(config.apiKey)}`,
        { Accept: "application/json" }
      );

      const item = data.items?.[0] || {};
      const stats = item.statistics || {};

      return {
        platform,
        status: "available",
        metrics: {
          title: item.snippet?.title || "YouTube channel",
          subscribers: stats.subscriberCount || 0,
          views: stats.viewCount || 0,
          videos: stats.videoCount || 0,
          channelUrl: item.snippet?.customUrl ? `https://youtube.com/@${item.snippet.customUrl}` : `https://youtube.com/channel/${config.channelId}`
        }
      };
    }

    if (platform === "instagram") {
      const data = await fetchJson(
        `${config.endpoint}/${config.businessAccountId}?fields=id,username,followers_count,media_count,profile_picture_url&access_token=${encodeURIComponent(config.accessToken)}`,
        { Accept: "application/json" }
      );

      return {
        platform,
        status: "available",
        metrics: {
          username: data.username || "Instagram account",
          followers: Number(data.followers_count || 0),
          postCount: Number(data.media_count || 0),
          profilePicture: data.profile_picture_url || "",
          accountUrl: data.username ? `https://instagram.com/${data.username}` : ""
        }
      };
    }

    if (platform === "facebook") {
      const data = await fetchJson(
        `${config.endpoint}/${config.pageId}?fields=id,name,fan_count,followers_count,about,link,picture&access_token=${encodeURIComponent(config.accessToken)}`,
        { Accept: "application/json" }
      );

      return {
        platform,
        status: "available",
        metrics: {
          name: data.name || "Facebook page",
          followers: Number(data.fan_count || data.followers_count || 0),
          about: data.about || "",
          pageUrl: data.link || "",
          picture: data.picture?.data?.url || ""
        }
      };
    }

    if (platform === "linkedin") {
      const data = await fetchJson(
        `${config.endpoint}/organizations/${encodeURIComponent(config.organizationId)}?projection=(id,localizedName,vanityName,websiteUrl)`,
        { Authorization: `Bearer ${config.accessToken}`, Accept: "application/json" }
      );

      return {
        platform,
        status: "available",
        metrics: {
          name: data.localizedName || "LinkedIn organization",
          vanityName: data.vanityName || "",
          websiteUrl: data.websiteUrl || "",
          organizationId: data.id || config.organizationId,
          note: "LinkedIn does not expose public follower counts through the standard organization lookup endpoint without additional permissions."
        }
      };
    }

    return buildSocialUnavailable(platform, "This platform is not supported in the current configuration.");
  } catch (error) {
    return {
      platform,
      status: "error",
      reason: error.message || "The configured API could not be queried.",
      metrics: {}
    };
  }
}

app.get("/api/social", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  try {
    const platforms = ["instagram", "youtube", "linkedin", "facebook"];
    const results = await Promise.all(platforms.map(async (platform) => fetchPlatformMetrics(platform)));

    res.json({
      success: true,
      platforms: results,
      note: "Metrics are only shown when a valid platform API key and permissioned account have been configured."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Unable to load social metrics."
    });
  }
});

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(ip) {
  const value = ip.toLowerCase();

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("::ffff:")
  );
}

async function validatePublicUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid website URL, including https://");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS websites are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Please enter a public website URL.");
  }

  if (net.isIP(hostname)) {
    if (
      (net.isIPv4(hostname) && isPrivateIPv4(hostname)) ||
      (net.isIPv6(hostname) && isPrivateIPv6(hostname))
    ) {
      throw new Error("Private or local IP addresses are not allowed.");
    }
  } else {
    let records;

    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error("Website domain could not be resolved.");
    }

    if (
      records.length === 0 ||
      records.some(record =>
        (net.isIPv4(record.address) && isPrivateIPv4(record.address)) ||
        (net.isIPv6(record.address) && isPrivateIPv6(record.address))
      )
    ) {
      throw new Error("Website resolves to an unsupported or private address.");
    }
  }

  return parsed;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  if (!value) return "";
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function toAbsoluteUrl(baseUrl, value) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchHtmlResponse(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "SEO-Monitor/1.0",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      }
    });

    const bodyReader = response.body?.getReader();
    if (!bodyReader) {
      throw new Error("Website returned an empty response.");
    }

    let html = "";
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await bodyReader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > 100 * 1024 * 1024) {
          throw new Error("Website HTML is too large to analyse (100 MB limit).");
        }
        html += new TextDecoder().decode(value, { stream: true });
      }
      html += new TextDecoder().decode();
    } finally {
      bodyReader.releaseLock();
    }

    return {
      response,
      html,
      statusCode: response.status,
      contentType: response.headers.get("content-type") || "",
      durationMs: Date.now() - startedAt,
      bytes: totalBytes
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWebsite(url) {
  let currentUrl = new URL(url);

  for (let hop = 0; hop <= 3; hop++) {
    await validatePublicUrl(currentUrl.href);

    let responseInfo;

    try {
      responseInfo = await fetchHtmlResponse(currentUrl.href, 8000);
    } catch (error) {
      throw new Error(error.message || "Website could not be reached or timed out.");
    }

    const { response, html, statusCode, contentType, durationMs, bytes } = responseInfo;

    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = response.headers.get("location");
      if (!location || hop === 3) {
        throw new Error("Too many or invalid redirects.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Website returned HTTP ${statusCode}.`);
    }

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("The URL did not return an HTML page.");
    }

    return {
      html,
      finalUrl: currentUrl.href,
      statusCode,
      durationMs,
      bytes,
      contentType
    };
  }

  throw new Error("Could not reach the final website URL.");
}

async function fetchAvailability(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "SEO-Monitor/1.0" }
    });
    clearTimeout(timer);
    return { available: response.ok || [301, 302, 303, 307, 308].includes(response.status), status: response.status };
  } catch {
    return { available: false, status: "Unavailable" };
  }
}

function getAttribute($, selector, attribute) {
  return cleanText($(selector).first().attr(attribute) || "");
}

function getMetaContent($, name) {
  return cleanText($(`meta[name="${name}"]`).first().attr("content") || "");
}

function getMetaProperty($, property) {
  return cleanText($(`meta[property="${property}"]`).first().attr("content") || "");
}

function rateStatus(score) {
  if (score >= 90) return "Good";
  if (score >= 70) return "Warning";
  if (score >= 40) return "Issue";
  return "Issue";
}

function scoreToStatus(score) {
  if (score >= 80) return "Good";
  if (score >= 60) return "Warning";
  if (score >= 35) return "Issue";
  return "Issue";
}

function getLinkCounts($, baseUrl) {
  const links = safeArray($("a[href]").toArray());
  let internalCount = 0;
  let externalCount = 0;
  const internalUrls = [];
  const externalUrls = [];

  for (const link of links) {
    const href = cleanText($(link).attr("href"));
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    const resolved = toAbsoluteUrl(baseUrl, href);
    if (!resolved) continue;

    try {
      const url = new URL(resolved);
      const sameHost = url.hostname.toLowerCase() === new URL(baseUrl).hostname.toLowerCase();
      if (sameHost) {
        internalCount += 1;
        internalUrls.push(url.href);
      } else {
        externalCount += 1;
        externalUrls.push(url.href);
      }
    } catch {
      // Ignore malformed URLs in the link analysis.
    }
  }

  return { internalCount, externalCount, internalUrls, externalUrls };
}

async function testLinkHealth(urls, limit = 5) {
  const samples = urls.slice(0, limit);
  const results = [];

  for (const item of samples) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(item, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "SEO-Monitor/1.0" }
      });
      clearTimeout(timer);
      results.push({ url: item, ok: response.ok || [301, 302, 303, 307, 308].includes(response.status), status: response.status });
    } catch {
      results.push({ url: item, ok: false, status: "Failed" });
    }
  }

  return results;
}

function buildFindings($, pageData) {
  const findings = [];

  function addFinding({ title, status, severity, evidence, why, fix, priority }) {
    findings.push({ title, status, severity, evidence, why, fix, priority });
  }

  if (!pageData.title) {
    addFinding({
      title: "Missing page title",
      status: "Issue",
      severity: "Medium",
      evidence: "No <title> tag was found in the retrieved HTML.",
      why: "Search engines rely on the title tag to understand the page topic and to form search-result snippets.",
      fix: "Add a concise, unique title that reflects the page's purpose and includes the brand when relevant.",
      priority: "Fix after critical availability and indexability issues."
    });
  } else if (pageData.title.length > 60 || pageData.title.length < 15) {
    addFinding({
      title: "Page title length is outside the recommended range",
      status: "Warning",
      severity: "Low",
      evidence: `Title length is ${pageData.title.length} characters. Recommended range is about 15–60 characters.`,
      why: "An oversized or very short title can reduce clarity in search results and make the page less compelling to readers.",
      fix: "Tighten the title to a descriptive length that still includes the main keyword and brand.",
      priority: "Fix after high-priority technical issues."
    });
  } else {
    addFinding({
      title: "Page title is present and reasonably sized",
      status: "Good",
      severity: "Low",
      evidence: `Detected title: “${pageData.title}” (${pageData.title.length} characters).`,
      why: "A clear title gives both users and search engines a quick understanding of the page.",
      fix: "Keep it unique and aligned with the page content when updating the site.",
      priority: "Maintain as part of ongoing content quality checks."
    });
  }

  if (!pageData.metaDescription) {
    addFinding({
      title: "Missing meta description",
      status: "Issue",
      severity: "Medium",
      evidence: "No meta description tag was found in the page source.",
      why: "Search engines may generate their own snippet, which can be less relevant or less persuasive than a custom description.",
      fix: "Write a compelling meta description that accurately summarizes the content and includes the primary keyword naturally.",
      priority: "Fix after critical accessibility, indexing, and availability issues."
    });
  } else if (pageData.metaDescription.length < 105 || pageData.metaDescription.length > 160) {
    addFinding({
      title: "Meta description length is not in the preferred range",
      status: "Warning",
      severity: "Low",
      evidence: `Detected length: ${pageData.metaDescription.length} characters. Preferred: about 105–160 characters.`,
      why: "Descriptions outside the range may be truncated or feel less informative in search engine snippets.",
      fix: "Revise the description to a concise, intent-driven summary that matches the page content.",
      priority: "Fix when the page is updated or re-optimized."
    });
  }

  if (pageData.h1Count === 0) {
    addFinding({
      title: "No H1 heading detected",
      status: "Issue",
      severity: "High",
      evidence: "The page source does not contain an H1 element.",
      why: "A clear H1 helps both users and search engines understand the main topic of the page.",
      fix: "Add one clear H1 that explains the main purpose of the page and matches the page topic.",
      priority: "Fix before other secondary content optimizations."
    });
  } else if (pageData.h1Count > 1) {
    addFinding({
      title: "Multiple H1 headings found",
      status: "Warning",
      severity: "Medium",
      evidence: `The page contains ${pageData.h1Count} H1 headings.`,
      why: "Multiple H1 elements can dilute the main page topic and make heading structure harder to interpret.",
      fix: "Keep a single primary H1 and use H2/H3 headings for supporting sections.",
      priority: "Fix during content structure updates."
    });
  }

  if (pageData.missingAltCount > 0) {
    addFinding({
      title: "Images missing alt text",
      status: "Issue",
      severity: "Medium",
      evidence: `${pageData.missingAltCount} image(s) do not include useful alternative text.`,
      why: "Missing alt text can reduce accessibility and limit how search engines interpret the visual content on the page.",
      fix: "Add descriptive alt text to informative images and use empty alt attributes for decorative images only.",
      priority: "Fix before broader content refinements."
    });
  }

  if (!pageData.canonicalUrl) {
    addFinding({
      title: "Canonical tag missing",
      status: "Issue",
      severity: "Medium",
      evidence: "No canonical URL tag was found in the page source.",
      why: "Without a canonical URL, search engines may struggle to choose the preferred version of a page when multiple URLs can reach it.",
      fix: "Specify the canonical URL in the document head to point to the preferred version of the page.",
      priority: "Fix near the top of technical SEO work."
    });
  }

  if (pageData.robotsBlocked) {
    addFinding({
      title: "Search indexing directives may block crawling",
      status: "Issue",
      severity: "High",
      evidence: "The page contains a noindex or other indexing directive that could restrict search visibility.",
      why: "If search engines are instructed not to index a page, it may not appear in organic results.",
      fix: "Review the page-level indexing directives and keep them only when the page is intentionally excluded from search results.",
      priority: "Fix immediately if this page is meant to rank."
    });
  }

  if (!pageData.https) {
    addFinding({
      title: "HTTP is being used instead of HTTPS",
      status: "Issue",
      severity: "High",
      evidence: "The final URL was served over HTTP rather than HTTPS.",
      why: "Secure pages are preferred by browsers and search engines, and HTTPS protects user data and trust.",
      fix: "Redirect all traffic to HTTPS and ensure the site’s internal links and canonical URLs also use the secure scheme.",
      priority: "Fix before broader ranking or trust improvements."
    });
  }

  if (pageData.robotsTxtAvailable === false) {
    addFinding({
      title: "Robots.txt was not detected",
      status: "Warning",
      severity: "Low",
      evidence: "The website root did not return a robots.txt file that could be verified from the server.",
      why: "Robots.txt helps coordinate crawler access, but its absence does not automatically indicate a problem.",
      fix: "Create or review a robots.txt file if the site has crawl-control requirements or special directives.",
      priority: "Address as part of crawl management if needed."
    });
  }

  if (pageData.sitemapAvailable === false) {
    addFinding({
      title: "Sitemap was not detected",
      status: "Warning",
      severity: "Low",
      evidence: "No accessible sitemap was discovered for the site root.",
      why: "Sitemaps help search engines find important pages and understand site structure.",
      fix: "Publish an XML sitemap for the site if the site is large, frequently updated, or has pages that are not easily discoverable.",
      priority: "Fix during crawl and indexing setup."
    });
  }

  if (pageData.structuredDataCount === 0) {
    addFinding({
      title: "Structured data was not detected",
      status: "Warning",
      severity: "Low",
      evidence: "No schema.org JSON-LD structured data was detected in the page source.",
      why: "Structured data can help search engines present richer results and better understand content context.",
      fix: "Add schema markup for the page type when it is relevant, such as article, organization, product, local business, or FAQ data.",
      priority: "Implement with content and markup updates."
    });
  }

  return findings;
}

function calculateCategoryScores(pageData, findings) {
  const metadataScore = (() => {
    let score = 0;
    const checks = [
      pageData.title ? 1 : 0,
      pageData.title && pageData.title.length >= 15 && pageData.title.length <= 60 ? 1 : 0,
      pageData.metaDescription ? 1 : 0,
      pageData.metaDescription && pageData.metaDescription.length >= 105 && pageData.metaDescription.length <= 160 ? 1 : 0,
      pageData.canonicalUrl ? 1 : 0
    ];
    score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return score;
  })();

  const headingsScore = (() => {
    const checks = [
      pageData.h1Count > 0 ? 1 : 0,
      pageData.h1Count === 1 ? 1 : 0,
      pageData.h2Count > 0 ? 1 : 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const imagesScore = (() => {
    const checks = [
      pageData.imageCount > 0 ? 1 : 0,
      pageData.missingAltCount === 0 ? 1 : 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const technicalScore = (() => {
    const checks = [
      pageData.https ? 1 : 0,
      pageData.viewportMeta ? 1 : 0,
      pageData.robotsBlocked ? 0 : 1,
      pageData.statusCode >= 200 && pageData.statusCode < 400 ? 1 : 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const linksScore = (() => {
    const checks = [
      pageData.internalLinkCount > 0 ? 1 : 0,
      pageData.externalLinkCount > 0 || pageData.externalLinkCount === 0 ? 1 : 0,
      pageData.brokenInternalLinks.length === 0 ? 1 : 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const securityScore = (() => {
    const checks = [
      pageData.https ? 1 : 0,
      pageData.responseSizeKb < 2000 ? 1 : 0,
      !pageData.mixedContentDetected ? 1 : 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const categoryScores = {
    metadata: { score: metadataScore, weight: 25 },
    headings: { score: headingsScore, weight: 20 },
    images: { score: imagesScore, weight: 15 },
    technical: { score: technicalScore, weight: 20 },
    links: { score: linksScore, weight: 10 },
    security: { score: securityScore, weight: 10 }
  };

  let weightedScore = 0;
  let totalWeight = 0;

  for (const category of Object.values(categoryScores)) {
    weightedScore += category.score * category.weight;
    totalWeight += category.weight;
  }

  const seoScore = Math.round(weightedScore / totalWeight);

  return { seoScore, categoryScores, findings };
}

app.post("/api/audit", async (req, res) => {
  const websiteUrl = String(req.body?.url || "").trim();

  if (!websiteUrl || websiteUrl.length > 2048) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid website URL."
    });
  }

  try {
    const parsedUrl = await validatePublicUrl(websiteUrl);
    const resultUrl = parsedUrl.href;
    const websiteResponse = await fetchWebsite(resultUrl);
    const $ = cheerio.load(websiteResponse.html);

    const title = cleanText($("title").first().text());
    const metaDescription = getMetaContent($, "description");
    const canonicalUrl = getAttribute($, 'link[rel="canonical"]', "href");
    const faviconUrl = getAttribute($, 'link[rel="icon"]', "href") || getAttribute($, 'link[rel="shortcut icon"]', "href");
    const viewportMeta = getAttribute($, 'meta[name="viewport"]', "content");
    const lang = cleanText($("html").attr("lang") || $("meta[http-equiv='Content-Language']").attr("content") || "");
    const author = getMetaContent($, "author");
    const keywords = getMetaContent($, "keywords");
    const robotsMeta = getMetaContent($, "robots");
    const ogTitle = getMetaProperty($, "og:title");
    const ogDescription = getMetaProperty($, "og:description");
    const ogImage = getMetaProperty($, "og:image");
    const ogUrl = getMetaProperty($, "og:url");
    const twitterCard = getMetaProperty($, "twitter:card");
    const twitterTitle = getMetaProperty($, "twitter:title");
    const twitterDescription = getMetaProperty($, "twitter:description");
    const twitterImage = getMetaProperty($, "twitter:image");
    const h1Count = $("h1").length;
    const h2Count = $("h2").length;
    const h3Count = $("h3").length;
    const imageCount = $("img").length;
    const structuredDataScripts = $("script[type='application/ld+json']");
    const structuredDataCount = structuredDataScripts.length;
    const schemaSnippets = structuredDataScripts.toArray().map(node => cleanText($(node).text())).filter(Boolean).slice(0, 3);

    let missingAltCount = 0;
    const imageUrls = [];

    $("img").each((_, image) => {
      const alt = cleanText($(image).attr("alt") || "");
      if (!alt) missingAltCount += 1;
      const src = $(image).attr("src");
      if (src) imageUrls.push(src);
    });

    const linkStats = getLinkCounts($, websiteResponse.finalUrl);
    const internalLinkCount = linkStats.internalCount;
    const externalLinkCount = linkStats.externalCount;

    const internalBrokenLinks = await testLinkHealth(linkStats.internalUrls, 5);
    const brokenInternalLinks = internalBrokenLinks.filter(link => !link.ok);

    const domain = new URL(websiteResponse.finalUrl).hostname.replace(/^www\./i, "").toLowerCase();
    const baseUrl = websiteResponse.finalUrl;
    const robotsTxtUrl = `${new URL(baseUrl).origin}/robots.txt`;
    const sitemapXmlUrl = `${new URL(baseUrl).origin}/sitemap.xml`;
    const robotsCheck = await fetchAvailability(robotsTxtUrl);
    const sitemapCheck = await fetchAvailability(sitemapXmlUrl);

    const logoCandidates = [
      $('meta[property="og:image"]').first().attr("content"),
      $('img[src*="logo"]').first().attr("src"),
      $('img').first().attr("src")
    ].filter(Boolean);
    const previewImage = ogImage || twitterImage || imageUrls[0] || faviconUrl || logoCandidates[0] || "";

    let mixedContentDetected = false;
    $("img[src^='http://'],script[src^='http://'],link[href^='http://'],source[src^='http://']").each(() => {
      mixedContentDetected = true;
    });

    const robotsBlocked = /noindex|none|noarchive|nofollow/i.test(robotsMeta || "") || /noindex|nofollow/i.test($('meta[name="robots"]').attr("content") || "");

    const pageData = {
      title,
      titleLength: title.length,
      metaDescription,
      metaDescriptionLength: metaDescription.length,
      canonicalUrl: canonicalUrl || "",
      faviconUrl: faviconUrl ? toAbsoluteUrl(baseUrl, faviconUrl) : "",
      previewImage: previewImage ? toAbsoluteUrl(baseUrl, previewImage) : "",
      h1Count,
      h2Count,
      h3Count,
      imageCount,
      missingAltCount,
      internalLinkCount,
      externalLinkCount,
      brokenInternalLinks,
      https: websiteResponse.finalUrl.startsWith("https://"),
      robotsBlocked,
      robotsTxtAvailable: robotsCheck.available,
      sitemapAvailable: sitemapCheck.available,
      url: websiteResponse.finalUrl,
      normalizedDomain: domain,
      viewportMeta,
      htmlLanguage: lang,
      ogTitle,
      ogDescription,
      ogImage: ogImage ? toAbsoluteUrl(baseUrl, ogImage) : "",
      ogUrl: ogUrl ? toAbsoluteUrl(baseUrl, ogUrl) : "",
      twitterCard,
      twitterTitle,
      twitterDescription,
      twitterImage: twitterImage ? toAbsoluteUrl(baseUrl, twitterImage) : "",
      author,
      keywords,
      robotsMeta,
      structuredDataCount,
      schemaSnippets,
      statusCode: websiteResponse.statusCode,
      responseTimeMs: websiteResponse.durationMs,
      htmlResponseSize: websiteResponse.bytes,
      responseSizeKb: Math.round((websiteResponse.bytes || 0) / 1024),
      mixedContentDetected,
      canonicalResolvedUrl: canonicalUrl ? toAbsoluteUrl(baseUrl, canonicalUrl) : "",
      logoUrl: logoCandidates[0] ? toAbsoluteUrl(baseUrl, logoCandidates[0]) : "",
      finalUrl: websiteResponse.finalUrl
    };

    const findings = buildFindings($, pageData);
    const { seoScore, categoryScores } = calculateCategoryScores(pageData, findings);

    const recommendationList = [
      ...(pageData.https ? [] : ["Redirect the website to HTTPS and update internal references to secure URLs."]),
      ...(pageData.title ? [] : ["Add a unique page title that clearly reflects the page topic." ]),
      ...(pageData.metaDescription ? [] : ["Write a specific meta description using the most relevant keyword phrase for the page."]),
      ...(pageData.h1Count === 0 ? ["Create a single primary H1 heading that summarizes the page purpose." ] : []),
      ...(pageData.missingAltCount > 0 ? [`Add alt text to ${pageData.missingAltCount} missing image(s) to improve accessibility and content understanding.`] : []),
      ...(pageData.canonicalUrl ? [] : ["Add a canonical URL tag to help search engines understand the preferred version of the page."]),
      ...(pageData.robotsBlocked ? ["Review indexing directives and remove any noindex commands if the page should appear in search results."] : []),
      ...(pageData.robotsTxtAvailable === false ? ["Publish a robots.txt file if the site needs crawler guidance or specific rule enforcement."] : []),
      ...(pageData.sitemapAvailable === false ? ["Publish an XML sitemap to help search engines discover content and understand page priorities."] : []),
      ...(pageData.brokenInternalLinks.length > 0 ? ["Review and fix broken internal links to maintain crawlability and user trust."] : [])
    ];

    const summary = {
      goodFindings: findings.filter(item => item.status === "Good").length,
      issueFindings: findings.filter(item => item.status === "Issue").length,
      warningFindings: findings.filter(item => item.status === "Warning").length,
      criticalFindings: findings.filter(item => item.severity === "Critical").length,
      highPriorityFindings: findings.filter(item => item.severity === "High").length
    };

    const result = {
      url: websiteResponse.finalUrl,
      website_url: websiteResponse.finalUrl,
      normalizedDomain: pageData.normalizedDomain,
      title: pageData.title || "Not found",
      metaDescription: pageData.metaDescription || "Not found",
      titleLength: pageData.titleLength,
      metaDescriptionLength: pageData.metaDescriptionLength,
      h1Count,
      h2Count,
      h3Count,
      imageCount,
      missingAltCount,
      https: pageData.https,
      seo_score: seoScore,
      seoScore,
      score: seoScore,
      scoreBreakdown: categoryScores,
      categoryScores,
      recommendations: recommendationList,
      findings,
      overview: {
        websiteUrl: websiteResponse.finalUrl,
        normalizedDomain: pageData.normalizedDomain,
        finalUrl: websiteResponse.finalUrl,
        pageTitle: pageData.title || "Not found",
        metaDescription: pageData.metaDescription || "Not found",
        canonicalUrl: pageData.canonicalUrl || "Not found",
        htmlLanguage: pageData.htmlLanguage || "Not found",
        viewportMeta: pageData.viewportMeta || "Not checked",
        favicon: pageData.faviconUrl || "Not found",
        previewImage: pageData.previewImage || "",
        ogTitle: pageData.ogTitle || "Not found",
        ogDescription: pageData.ogDescription || "Not found",
        ogImage: pageData.ogImage || "",
        twitterCard: pageData.twitterCard || "Not found",
        twitterImage: pageData.twitterImage || "",
        logoUrl: pageData.logoUrl || "",
        robotsTxtUrl,
        sitemapXmlUrl,
        robotsTxtAvailable: pageData.robotsTxtAvailable,
        sitemapAvailable: pageData.sitemapAvailable,
        responseStatusCode: pageData.statusCode,
        responseTimeMs: pageData.responseTimeMs,
        htmlResponseSize: pageData.htmlResponseSize,
        mobileViewport: pageData.viewportMeta || "Not checked",
        structuredDataCount: pageData.structuredDataCount,
        internalLinkCount,
        externalLinkCount,
        links: { internal: internalLinkCount, external: externalLinkCount },
        userAgent: "SEO-Monitor/1.0"
      },
      technicalChecks: {
        https: pageData.https,
        canonicalTag: Boolean(pageData.canonicalUrl),
        metaDescription: Boolean(pageData.metaDescription),
        title: Boolean(pageData.title),
        robotsTxtAvailable: pageData.robotsTxtAvailable,
        sitemapAvailable: pageData.sitemapAvailable,
        viewportMeta: Boolean(pageData.viewportMeta),
        noindex: pageData.robotsBlocked,
        structuredData: pageData.structuredDataCount > 0,
        mixedContentDetected: pageData.mixedContentDetected,
        brokenInternalLinks: pageData.brokenInternalLinks.length
      },
      note: "Estimated SEO score based on the checks implemented in this application. This is not an official Google ranking metric.",
      generatedAt: new Date().toISOString(),
      summary,
      auditTimestamp: new Date().toISOString(),
      auditReport: "Website SEO audit complete."
    };

    try {
      await pool.execute(
        `INSERT INTO audits
        (website_url, title, meta_description, h1_count, image_count,
         missing_alt_count, https, seo_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          websiteResponse.finalUrl,
          pageData.title || null,
          pageData.metaDescription || null,
          h1Count,
          imageCount,
          missingAltCount,
          pageData.https ? 1 : 0,
          seoScore
        ]
      );
      result.saved = true;
    } catch (dbError) {
      console.error("Audit could not be saved:", dbError.message);
      result.saved = false;
      result.saveMessage = "Audit completed, but database saving failed.";
    }

    res.json({
      success: true,
      result,
      audit: result,
      message: "SEO audit completed successfully."
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "The website audit failed."
    });
  }
});

app.post("/api/keywords", (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (!text || text.length > 50000) {
    return res.status(400).json({
      success: false,
      message: "Enter text containing up to 50,000 characters."
    });
  }

  const stopWords = new Set([
    "the", "and", "for", "are", "with", "this", "that", "from",
    "was", "were", "have", "has", "had", "you", "your", "its",
    "but", "not", "can", "will", "our", "their", "they", "them",
    "into", "about", "than", "then", "also", "all", "any", "use",
    "using", "a", "an", "in", "on", "at", "to", "of", "is", "it",
    "as", "by", "be", "or", "if", "we", "he", "she", "i"
  ]);

  const words = text.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
  const frequencies = {};

  for (const word of words) {
    if (word.length < 2 || stopWords.has(word)) continue;
    frequencies[word] = (frequencies[word] || 0) + 1;
  }

  const keywords = Object.entries(frequencies)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 20);

  res.json({
    success: true,
    totalWords: words.length,
    keywords
  });
});

app.get("/api/audits", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, website_url, title, seo_score, created_at
       FROM audits ORDER BY id DESC LIMIT 50`
    );

    res.json({ success: true, audits: rows });
  } catch (error) {
    console.error("Audit history failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not load audit history."
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function startServer() {
  try {
    await testConnection();
    console.log("Database connection verified.");
  } catch (error) {
    console.warn("MySQL is unavailable:", error.message);
    console.warn("Continuing without database connectivity. Check your .env settings and ensure the database exists.");
  }

  app.listen(PORT, () => {
    console.log(`Website running at http://localhost:${PORT}`);
    console.log(`Backend health: http://localhost:${PORT}/api/health`);
    console.log(`Database health: http://localhost:${PORT}/api/health/db`);
  });
}

startServer();
