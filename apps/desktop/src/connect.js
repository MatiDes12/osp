// Connection screen logic — runs in the Tauri webview before the OSP app is loaded.
// Persists recent server URLs and navigates to the selected server.

const RECENT_KEY = "osp:recent_servers";
const MAX_RECENT = 5;

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(url) {
  const list = [url, ...getRecent().filter((u) => u !== url)].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function removeRecent(url) {
  const list = getRecent().filter((u) => u !== url);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderRecent() {
  const list = getRecent();
  const ul = document.getElementById("recent-list");
  const label = document.getElementById("recent-label");

  if (list.length === 0) {
    ul.innerHTML = "";
    label.style.display = "none";
    return;
  }

  label.style.display = "block";
  ul.innerHTML = list
    .map(
      (url) => `
    <li class="recent-item" data-url="${url}">
      <span class="recent-url">${url}</span>
      <button class="recent-remove" data-remove="${url}" title="Remove">×</button>
    </li>
  `,
    )
    .join("");

  ul.querySelectorAll(".recent-item").forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("recent-remove")) return;
      connect(li.dataset.url);
    });
  });

  ul.querySelectorAll(".recent-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeRecent(btn.dataset.remove);
      renderRecent();
    });
  });
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearError() {
  document.getElementById("error-msg").classList.add("hidden");
}

async function connect(rawUrl) {
  clearError();

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    showError("Invalid URL. Please enter a valid server address.");
    return;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    showError("URL must start with http:// or https://");
    return;
  }

  const btn = document.getElementById("connect-btn");
  btn.disabled = true;
  btn.textContent = "Connecting…";

  // Verify the server is reachable before navigating
  try {
    const res = await fetch(`${url.origin}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Connect";
    showError(
      `Could not reach server at ${url.origin}. Is OSP running?\n${err.message}`,
    );
    return;
  }

  saveRecent(url.origin);
  // Navigate the webview to the OSP server
  window.location.href = url.origin;
}

// Init
const input = document.getElementById("server-url");
const form = document.getElementById("connect-form");

// Pre-fill with last used server
const recent = getRecent();
if (recent.length > 0) {
  input.value = recent[0];
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  connect(input.value);
});

renderRecent();
