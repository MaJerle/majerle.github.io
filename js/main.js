"use strict";

/*
 * GitHub stars.
 * Only the repositories listed in the HTML are queried: every .repo-stars
 * element names one with data-repo="owner/name". A single search request
 * ("repo:a/b repo:c/d ...") returns exactly those repos with exact star
 * counts, whatever their owner. Results are cached in localStorage for
 * 6 hours, so a visitor makes at most one request per 6 hours.
 */
const CACHE_KEY = "gh-stars-v4";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const numberFormat = new Intl.NumberFormat("en-US");

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.time > CACHE_TTL_MS) return null;
    return cached.stars;
  } catch {
    return null;
  }
}

function writeCache(stars) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), stars }));
  } catch {
    /* Storage full or disabled: the page still works without the cache. */
  }
}

function listedRepos() {
  return [...new Set([...document.querySelectorAll("[data-repo]")].map((el) => el.dataset.repo))];
}

/* Returns { "owner/name": stars } for every repo listed in the page. */
async function fetchAllStars() {
  const paths = listedRepos();
  const query = paths.map((path) => `repo:${path}`).join(" ");
  const url = `https://api.github.com/search/repositories?per_page=100&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub search returned ${response.status}`);
  const data = await response.json();

  /* GitHub may return different letter case than the HTML; map back to the HTML spelling. */
  const byLower = Object.fromEntries(paths.map((path) => [path.toLowerCase(), path]));
  const stars = {};
  for (const repo of data.items) {
    const path = byLower[repo.full_name.toLowerCase()];
    if (path) stars[path] = repo.stargazers_count;
  }
  return stars;
}

/* Fills every badge, then sets each section's total to the sum of its badges. */
function renderStars(stars) {
  document.querySelectorAll("section").forEach((section) => {
    let total = 0;
    section.querySelectorAll("[data-repo]").forEach((el) => {
      const count = stars[el.dataset.repo];
      if (count === undefined) return;
      total += count;
      const formatted = numberFormat.format(count);
      const icon = document.createElement("span");
      icon.className = "repo-stars-icon";
      icon.textContent = "★";
      const number = document.createElement("span");
      number.textContent = formatted;
      el.replaceChildren(icon, number);
      el.setAttribute("aria-label", `${formatted} stars on GitHub`);
      el.title = "GitHub stars";
    });

    const totalEl = section.querySelector(".stars-total");
    if (totalEl && total > 0) {
      const formatted = numberFormat.format(total);
      totalEl.textContent = `★ ${formatted} in total`;
      totalEl.setAttribute("aria-label", `${formatted} GitHub stars in total`);
      totalEl.hidden = false;
    }
  });
}

async function loadStars() {
  const cached = readCache();
  if (cached) {
    renderStars(cached);
    return;
  }
  try {
    const stars = await fetchAllStars();
    // Don't cache a partial result: retry on next visit.
    if (Object.keys(stars).length === listedRepos().length) writeCache(stars);
    renderStars(stars);
  } catch (error) {
    // Rate-limited or offline: star slots stay empty, links still work.
    console.warn("Could not load GitHub stars:", error);
  }
}

/*
 * Email: the HTML holds an obfuscated address ("tilen [at] majerle.eu") so
 * simple harvesters skip it; real visitors get a clickable mailto link.
 */
function revealEmail() {
  document.querySelectorAll(".js-email").forEach((el) => {
    const address = `${el.dataset.user}@${el.dataset.domain}`;
    const link = document.createElement("a");
    link.href = `mailto:${address}`;
    link.textContent = address;
    el.replaceChildren(link);
  });
}

revealEmail();
loadStars();
