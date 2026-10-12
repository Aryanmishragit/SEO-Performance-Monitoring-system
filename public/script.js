"use strict";

const $ = (id) => document.getElementById(id);

function showMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function auditValue(audit, key, fallback = "") {
  const candidate = audit?.[key] ?? audit?.overview?.[key] ?? fallback;
  return candidate ?? fallback;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Server returned an invalid response. Check server.js.");
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

function renderScoreBreakdown(categoryScores) {
  const entries = Object.entries(categoryScores || {});

  if (!entries.length) {
    return "<p class='empty-state'>No category breakdown available.</p>";
  }

  return entries.map(([label, item]) => {
    const score = Number(item?.score ?? item?.value ?? 0);
    const weight = Number(item?.weight ?? 0);
    const safeLabel = label.charAt(0).toUpperCase() + label.slice(1);

    return `
      <div class="category-row">
        <div class="category-meta">
          <span class="category-name">${escapeHTML(safeLabel)}</span>
          <span class="category-weight">${escapeHTML(weight)}%</span>
        </div>
        <div class="progress-track">
          <span class="progress-fill" style="width:${Math.max(0, Math.min(100, score))}%"></span>
        </div>
        <strong>${escapeHTML(score)}%</strong>
      </div>
    `;
  }).join("");
}

function renderFindings(findings) {
  const items = asArray(findings);

  if (!items.length) {
    return "<p class='empty-state'>No evidence-based findings were returned for this page.</p>";
  }

  return items.map((finding) => {
    const title = finding.title || "Finding";
    const status = finding.status || "Warning";
    const severity = finding.severity || "Low";
    const evidence = finding.evidence || "No evidence provided.";
    const why = finding.why || "This issue matters to SEO and user experience.";
    const fix = finding.fix || "Review the page and update the content or technical markup.";
    const priority = finding.priority || "Fix during the next optimisation cycle.";

    return `
      <article class="finding-card">
        <div class="finding-header">
          <h4>${escapeHTML(title)}</h4>
          <div class="finding-badges">
            <span class="badge ${status.toLowerCase()}">${escapeHTML(status)}</span>
            <span class="badge severity-${severity.toLowerCase()}">${escapeHTML(severity)}</span>
          </div>
        </div>
        <p><strong>Evidence:</strong> ${escapeHTML(evidence)}</p>
        <p><strong>Why it matters:</strong> ${escapeHTML(why)}</p>
        <p><strong>Recommended fix:</strong> ${escapeHTML(fix)}</p>
        <p><strong>Priority:</strong> ${escapeHTML(priority)}</p>
      </article>
    `;
  }).join("");
}

function renderAuditReport(audit) {
  const overview = audit?.overview || {};
  const categoryScores = audit?.categoryScores || audit?.scoreBreakdown || {};
  const findings = asArray(audit?.findings || audit?.results || []);
  const recommendations = asArray(audit?.recommendations || []);
  const score = Number(audit?.seo_score ?? audit?.seoScore ?? audit?.score ?? 0);
  const pageTitle = auditValue(audit, "title", overview.pageTitle || "Not found");
  const metaDescription = auditValue(audit, "metaDescription", overview.metaDescription || "Not found");
  const domain = overview.normalizedDomain || audit?.normalizedDomain || "Unknown domain";
  const previewImage = overview.previewImage || overview.ogImage || overview.favicon || "";

  return `
    <div class="audit-report">
      <div class="report-topline">
        <div>
          <p class="eyebrow">AUDIT COMPLETE</p>
          <h2>SEO performance report</h2>
          <p class="muted">${escapeHTML(audit?.url || audit?.website_url || overview.websiteUrl || "Unknown URL")}</p>
        </div>
        <div class="score-shell">
          <div class="score-circle">${escapeHTML(score)}<span>/100</span></div>
          <div class="score-caption">Estimated SEO score</div>
        </div>
      </div>

      <div class="report-grid">
        <div class="detail-panel">
          <h3>Website overview</h3>
          <div class="detail-list">
            <div><span>Domain</span><strong>${escapeHTML(domain)}</strong></div>
            <div><span>Title</span><strong>${escapeHTML(pageTitle)}</strong></div>
            <div><span>Meta description</span><strong>${escapeHTML(metaDescription)}</strong></div>
            <div><span>Final URL</span><strong>${escapeHTML(audit?.url || overview.finalUrl || "Not available")}</strong></div>
            <div><span>H1 headings</span><strong>${escapeHTML(Number(audit?.h1Count ?? audit?.h1_count ?? 0))}</strong></div>
            <div><span>Images missing alt</span><strong>${escapeHTML(Number(audit?.missingAltCount ?? audit?.missing_alt_count ?? 0))}</strong></div>
          </div>
        </div>

        <div class="detail-panel preview-panel">
          <h3>Website preview</h3>
          <div class="preview-card">
            ${previewImage ? `<img src="${escapeHTML(previewImage)}" alt="Website preview" class="preview-image" />` : ""}
            <div class="preview-placeholder ${previewImage ? "hidden" : ""}">No preview image available</div>
          </div>
          <div class="preview-meta">
            <div><span>Canonical</span><strong>${escapeHTML(overview.canonicalUrl || "Not found")}</strong></div>
            <div><span>Viewport</span><strong>${escapeHTML(overview.viewportMeta || "Not checked")}</strong></div>
            <div><span>Robots.txt</span><strong>${escapeHTML(overview.robotsTxtAvailable === true ? "Available" : overview.robotsTxtAvailable === false ? "Not detected" : "Not checked")}</strong></div>
            <div><span>Sitemap</span><strong>${escapeHTML(overview.sitemapAvailable === true ? "Available" : overview.sitemapAvailable === false ? "Not detected" : "Not checked")}</strong></div>
          </div>
        </div>
      </div>

      <div class="report-grid compact-grid">
        <div class="detail-panel">
          <h3>Score breakdown</h3>
          <div class="category-breakdown">
            ${renderScoreBreakdown(categoryScores)}
          </div>
        </div>

        <div class="detail-panel">
          <h3>Action plan</h3>
          <ul class="action-list">
            ${recommendations.length ? recommendations.map((item) => `<li>${escapeHTML(String(item))}</li>`).join("") : "<li>No specific recommendations were generated.</li>"}
          </ul>
        </div>
      </div>

      <div class="detail-panel findings-panel">
        <h3>Findings and recommendations</h3>
        ${renderFindings(findings)}
      </div>
    </div>
  `;
}

$("auditForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = $("websiteUrl").value.trim();
  const button = $("auditButton");
  const results = $("auditResults");

  if (!url) {
    showMessage("auditMessage", "Please enter a website URL.", "error");
    return;
  }

  button.disabled = true;
  button.innerHTML = "Analysing website...";
  results.classList.add("hidden");
  showMessage("auditMessage", "Checking website SEO...");

  try {
    const data = await apiRequest("/api/audit", {
      method: "POST",
      body: JSON.stringify({ url })
    });

    const audit = data.audit || data.result || data;
    results.innerHTML = renderAuditReport(audit);
    results.classList.remove("hidden");
    showMessage(
      "auditMessage",
      data.saved === false ? "Audit completed, but it was not saved to the database." : "Website audit completed successfully.",
      "success"
    );
  } catch (error) {
    showMessage("auditMessage", error.message || "Unable to analyse the website.", "error");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Analyse website <span>→</span>';
  }
});

$("keywordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = $("keywordText").value.trim();
  const results = $("keywordResults");
  const button = event.submitter;

  if (!text) {
    showMessage("keywordMessage", "Please enter some text to analyse.", "error");
    return;
  }

  if (button) button.disabled = true;
  results.classList.add("hidden");
  showMessage("keywordMessage", "Analysing keywords...");

  try {
    const data = await apiRequest("/api/keywords", {
      method: "POST",
      body: JSON.stringify({ text })
    });

    const keywords = Array.isArray(data.keywords) ? data.keywords : [];

    if (!keywords.length) {
      results.innerHTML = "<p class='empty-state'>No keywords found. Try a longer text.</p>";
    } else {
      results.innerHTML = `
        <h3 class="keyword-header">Top keywords</h3>
        ${keywords.map((item) => {
          const word = typeof item === "string" ? item : item.word ?? item.keyword ?? item.term ?? "";
          const count = typeof item === "string" ? 1 : item.count ?? item.frequency ?? item.occurrences ?? 1;

          return `
            <div class="keyword-item">
              <span class="keyword-word">${escapeHTML(word)}</span>
              <span class="keyword-count">${escapeHTML(count)} times</span>
            </div>
          `;
        }).join("")}
      `;
    }

    results.classList.remove("hidden");
    showMessage("keywordMessage", "Keyword analysis completed.", "success");
  } catch (error) {
    showMessage("keywordMessage", error.message || "Keyword analysis failed.", "error");
  } finally {
    if (button) button.disabled = false;
  }
});

$("historyButton")?.addEventListener("click", async () => {
  const button = $("historyButton");
  const results = $("historyResults");

  button.disabled = true;
  showMessage("historyMessage", "Loading audit history...");
  results.innerHTML = "";

  try {
    const data = await apiRequest("/api/audits");
    const audits = Array.isArray(data) ? data : Array.isArray(data.audits) ? data.audits : [];

    if (!audits.length) {
      results.innerHTML = "<p class='empty-state'>No saved audits yet. Run your first website audit.</p>";
    } else {
      results.innerHTML = audits.map((audit) => {
        const url = audit.website_url || audit.url || "Unknown website";
        const score = audit.seo_score ?? audit.score ?? 0;
        const date = audit.created_at ? new Date(audit.created_at).toLocaleDateString() : "";

        return `
          <div class="history-item">
            <div class="history-url">
              ${escapeHTML(url)}
              <div class="muted">${escapeHTML(date)}</div>
            </div>
            <span class="history-score">${escapeHTML(score)}/100</span>
          </div>
        `;
      }).join("");
    }

    showMessage("historyMessage", "Audit history loaded.", "success");
  } catch (error) {
    showMessage("historyMessage", error.message || "Could not load audit history.", "error");
  } finally {
    button.disabled = false;
  }
});

async function checkBackend() {
  try {
    await apiRequest("/api/health");
    console.log("Backend connection successful.");
  } catch (error) {
    console.error("Backend connection failed:", error.message);
  }
}

checkBackend();
