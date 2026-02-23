const STORAGE_KEY = "beusharebox.products.v1";
const PROFILE_STORAGE_KEY = "beusharebox.profile.v1";
const THEME_STORAGE_KEY = "beusharebox.theme.v1";
const EXPORT_SCHEMA_VERSION = 1;
const MAX_IMAGE_BYTES = 250 * 1024;
const CARD_EXIT_ANIMATION_MS = 240;

const appState = {
  products: loadProductsFromStorage(),
  profile: loadProfileFromStorage(),
  searchQuery: "",
  categoryFilter: "all",
  sortBy: "newest",
  myProductsOnly: false,
  draggedProductId: null,
  isDragging: false
};

const productForm = document.getElementById("product-form");
const formErrorMessage = document.getElementById("form-error");
const productLinkInput = document.getElementById("product-link");
const productTitleInput = document.getElementById("product-title");
const productDescriptionInput = document.getElementById("product-description");
const productPriceInput = document.getElementById("product-price");
const productCategoryInput = document.getElementById("product-category");
const productImageUrlInput = document.getElementById("product-image-url");
const autofillImagePreview = document.getElementById("autofill-image-preview");
const profileForm = document.getElementById("profile-form");
const profileErrorMessage = document.getElementById("profile-error");
const usernameInput = document.getElementById("username-input");
const avatarUrlInput = document.getElementById("avatar-url-input");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const myProductsToggleButton = document.getElementById("my-products-toggle");
const exportDataButton = document.getElementById("export-data");
const importDataButton = document.getElementById("import-data-btn");
const importDataInput = document.getElementById("import-data-input");
const dataErrorMessage = document.getElementById("data-error");
const categoryFilterSelect = document.getElementById("category-filter");
const searchInput = document.getElementById("search-input");
const sortBySelect = document.getElementById("sort-by");
const productListSection = document.getElementById("product-list");
const totalProductsElement = document.getElementById("total-products");
const totalLikesElement = document.getElementById("total-likes");
const mostLikedProductElement = document.getElementById("most-liked-product");
const categoryDistributionElement = document.getElementById("category-distribution");
const themeToggleButton = document.getElementById("theme-toggle");
const productModal = document.getElementById("product-modal");
const modalContent = document.getElementById("modal-content");
const modalCloseButton = document.getElementById("modal-close");
const toastElement = document.getElementById("toast");

let autofillAbortController = null;
let autofillDebounceTimerId = null;
let pendingAutofillImageBase64 = "";

// Create an SVG avatar placeholder data URL from username initial.
function createAvatarPlaceholderDataUrl(username) {
  const initial = String(username || "G").trim().charAt(0).toUpperCase() || "G";
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"100%\" height=\"100%\" rx=\"32\" fill=\"#4f6dff\"/><text x=\"50%\" y=\"54%\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Segoe UI, Arial\" font-size=\"30\" fill=\"white\">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Load profile from localStorage.
function loadProfileFromStorage() {
  try {
    const rawValue = localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    return {
      username: String(parsedValue?.username || "Guest").trim() || "Guest",
      avatarBase64: typeof parsedValue?.avatarBase64 === "string" ? parsedValue.avatarBase64 : ""
    };
  } catch {
    return {
      username: "Guest",
      avatarBase64: ""
    };
  }
}

// Save current profile to localStorage.
function saveProfileToStorage() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(appState.profile));
}

// Update header/profile form UI from current profile state.
function updateProfileUI() {
  profileName.textContent = appState.profile.username;
  usernameInput.value = appState.profile.username === "Guest" ? "" : appState.profile.username;
  avatarUrlInput.value = appState.profile.avatarBase64 || "";
  profileAvatar.src = appState.profile.avatarBase64 || createAvatarPlaceholderDataUrl(appState.profile.username);
}

// Validate profile form input.
function validateProfileForm(formData) {
  const username = String(formData.get("username") || "").trim();
  const avatarUrl = String(formData.get("avatar-url") || "").trim();

  if (!username) return "Username is required.";

  if (avatarUrl) {
    const parsedAvatarUrl = parseUrl(avatarUrl);
    const isDataImage = avatarUrl.startsWith("data:image/");
    if (!parsedAvatarUrl && !isDataImage) return "Please provide a valid avatar image URL.";
  }

  return "";
}

// Get theme preference from localStorage. Defaults to light mode.
function loadStoredTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === "dark" ? "dark" : "light";
}

// Apply current theme with CSS custom properties via a data attribute.
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleButton.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  themeToggleButton.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

// Persist and switch between dark and light themes.
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

// Normalize one stored product so every item matches the required data shape.
function normalizeStoredProduct(product) {
  if (!product || typeof product !== "object") return null;

  return {
    id: String(product.id || crypto.randomUUID()),
    title: String(product.title || "").trim(),
    description: String(product.description || "").trim(),
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
    category: String(product.category || "other").trim() || "other",
    likes: Number.isFinite(Number(product.likes)) ? Number(product.likes) : 0,
    ownerUsername: String(product.ownerUsername || "Guest").trim() || "Guest",
    sourceUrl: normalizeSourceUrl(product.sourceUrl || product.productLink || product.link || ""),
    imageBase64: typeof product.imageBase64 === "string" ? product.imageBase64 : "",
    comments: Array.isArray(product.comments)
      ? product.comments
          .map((comment) => ({
            id: String(comment?.id || crypto.randomUUID()),
            text: String(comment?.text || "").trim(),
            createdAt: Number.isFinite(Number(comment?.createdAt))
              ? Number(comment.createdAt)
              : Date.now()
          }))
          .filter((comment) => comment.text.length > 0)
      : [],
    createdAt: Number.isFinite(Number(product.createdAt))
      ? Number(product.createdAt)
      : Date.now()
  };
}

// Load products from localStorage and return an array fallback on invalid data.
function loadProductsFromStorage() {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map((product) => normalizeStoredProduct(product))
      .filter((product) => product && product.title && product.description);
  } catch {
    return [];
  }
}

// Save current products array into localStorage.
function saveProductsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.products));
}

// Build export payload object.
function buildExportPayload() {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: appState.profile,
    products: appState.products
  };
}

// Parse imported JSON into profile/products candidate fields.
function parseImportedPayload(rawData) {
  if (Array.isArray(rawData)) {
    return { profile: null, products: rawData };
  }

  if (!rawData || typeof rawData !== "object") {
    return { profile: null, products: [] };
  }

  const products = Array.isArray(rawData.products) ? rawData.products : [];
  const profile = rawData.profile && typeof rawData.profile === "object" ? rawData.profile : null;

  return { profile, products };
}

// Merge imported products with existing products safely (dedupe by id).
function mergeProductsSafely(importedProductsRaw) {
  const normalizedImported = importedProductsRaw
    .map((item) => normalizeStoredProduct(item))
    .filter((item) => item && item.title && item.description);

  const mergedById = new Map();

  appState.products.forEach((item) => {
    mergedById.set(item.id, item);
  });

  normalizedImported.forEach((item) => {
    const existingItem = mergedById.get(item.id);
    if (!existingItem) {
      mergedById.set(item.id, item);
      return;
    }

    mergedById.set(item.id, {
      ...existingItem,
      ...item,
      comments: Array.isArray(item.comments) ? item.comments : existingItem.comments
    });
  });

  appState.products = Array.from(mergedById.values());
}

// Merge imported profile with existing profile without dropping existing valid values.
function mergeProfileSafely(importedProfileRaw) {
  if (!importedProfileRaw || typeof importedProfileRaw !== "object") return;

  const incomingUsername = String(importedProfileRaw.username || "").trim();
  const incomingAvatar =
    typeof importedProfileRaw.avatarBase64 === "string" ? importedProfileRaw.avatarBase64 : "";

  appState.profile = {
    username: incomingUsername || appState.profile.username || "Guest",
    avatarBase64: incomingAvatar || appState.profile.avatarBase64 || ""
  };
}

// Update summary stats for total products and total likes.
function updateSummaryStats() {
  const summary = appState.products.reduce(
    (accumulator, product) => {
      accumulator.totalProducts += 1;
      accumulator.totalLikes += product.likes;
      accumulator.categoryCounts[product.category] =
        (accumulator.categoryCounts[product.category] || 0) + 1;

      if (!accumulator.mostLiked || product.likes > accumulator.mostLiked.likes) {
        accumulator.mostLiked = product;
      }

      return accumulator;
    },
    {
      totalProducts: 0,
      totalLikes: 0,
      mostLiked: null,
      categoryCounts: {}
    }
  );

  const categoryDistributionText = Object.entries(summary.categoryCounts)
    .map(([category, count]) => `${category}: ${count}`)
    .join(" | ");

  totalProductsElement.textContent = String(summary.totalProducts);
  totalLikesElement.textContent = String(summary.totalLikes);
  mostLikedProductElement.textContent = summary.mostLiked
    ? `${summary.mostLiked.title} (${summary.mostLiked.likes})`
    : "-";
  categoryDistributionElement.textContent = categoryDistributionText || "-";
}

// Format number into a readable USD price string.
function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(price);
}

// Show animated toast and auto-close after 3 seconds.
function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.remove("show");
  void toastElement.offsetWidth;
  toastElement.classList.add("show");

  window.clearTimeout(showToast.hideTimerId);
  showToast.hideTimerId = window.setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3000);
}

// Toggle loading visual state for product link autofill input.
function setAutofillLoading(isLoading) {
  productLinkInput.classList.toggle("is-loading", isLoading);
  productLinkInput.setAttribute("aria-busy", isLoading ? "true" : "false");
}

// Normalize and validate a URL string.
function parseUrl(value) {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
}

// Normalize a source URL string so stored product links are always safe/openable.
function normalizeSourceUrl(value) {
  const parsed = parseUrl(value);
  return parsed ? parsed.href : "";
}

// Build a short host label from URL (for UI link text).
function getSourceHostLabel(urlValue) {
  const parsed = parseUrl(urlValue);
  if (!parsed) return "";
  return parsed.hostname.replace(/^www\./, "");
}

// Read meta tag content from parsed HTML document.
function readMetaContent(documentNode, selectors) {
  for (const selector of selectors) {
    const node = documentNode.querySelector(selector);
    const content = node?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return "";
}

// Read text content from first matching selector.
function readTextContent(documentNode, selectors) {
  for (const selector of selectors) {
    const node = documentNode.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

// Read a useful text snippet from the first visible paragraph.
function readFirstMeaningfulParagraph(documentNode) {
  const paragraphs = [...documentNode.querySelectorAll("p")];
  const match = paragraphs.find((node) => {
    const text = node.textContent?.trim() || "";
    return text.length >= 20 && text.length <= 420;
  });
  return match?.textContent?.trim() || "";
}

// Read breadcrumb trail text from common ecommerce markup patterns.
function readBreadcrumbText(documentNode) {
  const selectors = [
    'nav[aria-label*="breadcrumb" i] a',
    'nav[aria-label*="breadcrumb" i] span',
    ".breadcrumb a",
    ".breadcrumb span",
    ".breadcrumbs a",
    ".breadcrumbs span",
    '[itemtype*="BreadcrumbList" i] [itemprop="name"]',
    '[data-test-id*="breadcrumb" i] a',
    '[class*="breadcrumb" i] a',
    '[class*="breadcrumb" i] span'
  ];

  const nodes = [...documentNode.querySelectorAll(selectors.join(","))].slice(0, 28);
  return nodes
    .map((node) => node.textContent?.trim() || "")
    .filter((text) => text.length > 1)
    .join(" ");
}

// Build a safe fallback description if metadata is missing.
function buildFallbackDescription(sourceUrl, title) {
  const host = sourceUrl.hostname.replace(/^www\./, "");
  const trimmedTitle = String(title || "").trim();
  if (trimmedTitle) {
    return `${trimmedTitle} - imported from ${host}. Please review source details before sharing.`;
  }
  return `Imported product details from ${host}. Please update this description with full product information.`;
}

// Attempt to parse product-like JSON-LD blocks.
function parseProductJsonLd(documentNode) {
  const scripts = [...documentNode.querySelectorAll('script[type="application/ld+json"]')];
  let bestMatch = null;
  let bestScore = -1;

  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const typeValue = String(node["@type"] || "").toLowerCase();
        if (!/(product|itempage|webpage|article)/.test(typeValue)) continue;

        const image = readJsonLdImageUrl(node.image);
        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = offers && typeof offers === "object" ? String(offers.price || "") : "";
        const category = Array.isArray(node.category)
          ? node.category.join(" ")
          : String(node.category || "");
        const keywords = Array.isArray(node.keywords)
          ? node.keywords.join(" ")
          : String(node.keywords || "");
        const candidate = {
          title: String(node.name || "").trim(),
          description: String(node.description || "").trim(),
          imageUrl: image.trim(),
          price: price.trim(),
          category: category.trim(),
          keywords: keywords.trim()
        };
        let candidateScore = 0;
        if (/product/.test(typeValue)) candidateScore += 10;
        if (candidate.title) candidateScore += 3;
        if (candidate.description) candidateScore += 2;
        if (candidate.imageUrl) candidateScore += 3;
        if (candidate.price) candidateScore += 3;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestMatch = candidate;
        }
      }
    } catch {
      // Ignore malformed JSON-LD entries.
    }
  }

  if (bestMatch) return bestMatch;

  return {
    title: "",
    description: "",
    imageUrl: "",
    price: "",
    category: "",
    keywords: ""
  };
}

// Read image URL from JSON-LD image value (string, object, or nested array).
function readJsonLdImageUrl(imageValue) {
  if (!imageValue) return "";

  if (typeof imageValue === "string") {
    return imageValue.trim();
  }

  if (Array.isArray(imageValue)) {
    for (const entry of imageValue) {
      const url = readJsonLdImageUrl(entry);
      if (url) return url;
    }
    return "";
  }

  if (typeof imageValue === "object") {
    const directUrl =
      (typeof imageValue.url === "string" && imageValue.url) ||
      (typeof imageValue["@id"] === "string" && imageValue["@id"]) ||
      "";

    if (directUrl) return directUrl.trim();

    if (Array.isArray(imageValue.url)) {
      for (const urlEntry of imageValue.url) {
        const url = readJsonLdImageUrl(urlEntry);
        if (url) return url;
      }
    }
  }

  return "";
}

// Resolve a potentially relative URL against a base URL.
function resolveUrlMaybeRelative(urlValue, baseUrl) {
  const normalizedInput = String(urlValue || "").trim().replace(/^['"]|['"]$/g, "");
  if (!normalizedInput) return "";
  if (/^(javascript:|mailto:|tel:)/i.test(normalizedInput)) return "";
  if (/^data:image\//i.test(normalizedInput)) return normalizedInput;

  try {
    return new URL(normalizedInput, baseUrl).href;
  } catch {
    return "";
  }
}

// Normalize possibly noisy image URL values (quotes, srcset descriptors, etc.).
function normalizeImageUrlValue(rawValue) {
  let value = String(rawValue || "").trim().replace(/^['"]|['"]$/g, "");
  if (!value) return "";

  // Handle CSS url(...) wrappers.
  const cssUrlMatch = value.match(/^url\((.*)\)$/i);
  if (cssUrlMatch && cssUrlMatch[1]) {
    value = cssUrlMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  // Handle srcset-like values only when width/density descriptors are present.
  if (value.includes(",") && /\s\d+(w|x)\b/i.test(value)) {
    value = value.split(",")[0].trim();
  }

  if (/\s\d+(w|x)\b/i.test(value)) {
    value = value.split(/\s+/)[0] || "";
  }

  return value;
}

// Parse all URL entries from a srcset-like value.
function parseSrcsetUrls(srcsetValue) {
  const srcset = String(srcsetValue || "").trim();
  if (!srcset) return [];

  return srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0] || "")
    .filter(Boolean);
}

// Collect many possible product image URLs from DOM image attributes.
function collectDomImageCandidates(documentNode) {
  const candidates = [];
  const seen = new Set();
  const nodes = [...documentNode.querySelectorAll("img, source")].slice(0, 180);

  const addCandidate = (value) => {
    const normalized = normalizeImageUrlValue(value);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const imageAttributes = [
    "src",
    "data-src",
    "data-original",
    "data-image",
    "data-image-src",
    "data-lazy-src",
    "data-zoom-image",
    "data-large-image",
    "data-thumb"
  ];

  for (const node of nodes) {
    for (const attributeName of imageAttributes) {
      addCandidate(node.getAttribute(attributeName));
    }

    const srcsetValue = node.getAttribute("srcset") || node.getAttribute("data-srcset");
    parseSrcsetUrls(srcsetValue).forEach(addCandidate);
  }

  return candidates;
}

// Build an image proxy URL fallback when direct hotlinking fails.
function buildImageProxyUrl(imageUrl) {
  const normalized = normalizeImageUrlValue(imageUrl);
  if (!normalized) return "";
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`;
}

// Set image source with one retry through proxy if the original source fails.
function applyImageSourceWithFallback(imageElement, rawImageUrl) {
  const normalized = normalizeImageUrlValue(rawImageUrl);
  if (!normalized) return;

  const isDataImage = /^data:image\//i.test(normalized);
  const fallbackChain = isDataImage
    ? [normalized]
    : [
        normalized,
        buildImageProxyUrl(normalized),
        `https://images.weserv.nl/?url=${encodeURIComponent(normalized.replace(/^https?:\/\//i, ""))}`
      ].filter(Boolean);

  let fallbackIndex = 0;
  imageElement.src = fallbackChain[fallbackIndex];
  imageElement.referrerPolicy = "no-referrer";

  imageElement.onerror = () => {
    fallbackIndex += 1;
    if (fallbackIndex >= fallbackChain.length) {
      imageElement.remove();
      return;
    }
    imageElement.src = fallbackChain[fallbackIndex];
  };
}

// Heuristic: reject URLs that look like site branding assets.
function isLikelyBrandAssetImage(imageUrl) {
  const value = String(imageUrl || "").toLowerCase();
  if (!value) return true;

  const hasBrandKeyword = /(logo|favicon|apple-touch-icon|site-icon|manifest|brandmark|sprite)/.test(value);
  const hasLikelyIconPath = /(^|\/)(icon|icons|logo|logos)(\/|$)/.test(value);
  const hasSmallDimensionHint = /(?:^|[^0-9])(16x16|24x24|32x32|48x48|64x64|96x96|128x128)(?:[^0-9]|$)/.test(
    value
  );
  const hasIconExtension = /(\.svg|\.ico)(\?|$)/.test(value);

  return hasBrandKeyword || hasLikelyIconPath || hasSmallDimensionHint || hasIconExtension;
}

// Pick best candidate image URL, prioritizing product-looking images over brand assets.
function pickBestProductImageUrl(candidates, baseUrl, title, description) {
  const resolved = candidates
    .map((candidate) => {
      const rawCandidateUrl =
        typeof candidate === "object" && candidate
          ? String(candidate.url || "").trim()
          : String(candidate || "").trim();
      const normalizedCandidateUrl = normalizeImageUrlValue(rawCandidateUrl);
      if (!normalizedCandidateUrl) return null;

      return {
        url: resolveUrlMaybeRelative(normalizedCandidateUrl, baseUrl),
        source: typeof candidate === "object" && candidate ? candidate.source || "unknown" : "unknown"
      };
    })
    .filter((item) => item && item.url);

  if (!resolved.length) return "";

  const titleTokens = String(title || description || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .slice(0, 8);

  let bestUrl = "";
  let bestScore = -999;

  for (const entry of resolved) {
    const url = entry.url;
    const parsedUrl = parseUrl(url);
    if (parsedUrl && parsedUrl.pathname && !/\.(jpg|jpeg|png|webp|avif|gif|bmp|svg)(\?|$)/i.test(parsedUrl.pathname)) {
      const pageUrl = parseUrl(baseUrl);
      if (pageUrl && parsedUrl.origin === pageUrl.origin && parsedUrl.pathname === pageUrl.pathname) {
        continue;
      }
    }

    let score = 0;
    const lower = url.toLowerCase();

    if (isLikelyBrandAssetImage(lower)) {
      score -= 6;
    } else {
      score += 4;
    }

    if (/(product|item|media|gallery|images|img|pdp|catalog|sku)/.test(lower)) {
      score += 2;
    }

    if (/(badge|banner|sticker|campaign|promo|sponsor|hepsipara|avantaj)/.test(lower)) {
      score -= 4;
    }

    if (/(productimages|urun|products)/.test(lower)) {
      score += 3;
    }

    if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/.test(lower)) {
      score += 1;
    }

    for (const token of titleTokens) {
      if (lower.includes(token)) {
        score += 1;
      }
    }

    if (entry.source === "jsonld") {
      score += 5;
    } else if (entry.source === "product_meta") {
      score += 3;
    } else if (entry.source === "open_graph") {
      score += 1;
    } else if (entry.source === "img_dom") {
      score += 1;
    } else if (entry.source === "jina_markdown") {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  // Always return the best available candidate so autofill does not lose images.
  return bestUrl || "";
}

// Try to infer category from title/description/keywords text.
function inferCategoryFromText(text) {
  return detectCategoryFromSignals({ title: String(text || "") });
}

const CATEGORY_KEYWORDS = {
  electronics: [
    "electronics",
    "electronic",
    "tech",
    "technology",
    "telefon",
    "phone",
    "smartphone",
    "tablet",
    "laptop",
    "dizustu",
    "dizüstü",
    "notebook",
    "bilgisayar",
    "monitor",
    "kamera",
    "camera",
    "kulaklik",
    "kulaklık",
    "headphone",
    "sarj",
    "şarj",
    "charger",
    "usb",
    "gaming",
    "konsol",
    "console",
    "tv",
    "televizyon"
  ],
  books: [
    "book",
    "books",
    "kitap",
    "roman",
    "novel",
    "author",
    "yazar",
    "paperback",
    "hardcover",
    "dergi",
    "magazine",
    "ebook",
    "e-kitap"
  ],
  fashion: [
    "fashion",
    "moda",
    "clothing",
    "giyim",
    "shirt",
    "tişört",
    "tisort",
    "shoe",
    "ayakkabi",
    "ayakkabı",
    "dress",
    "elbise",
    "jacket",
    "ceket",
    "pantolon",
    "pants",
    "bag",
    "çanta",
    "canta",
    "watch",
    "saat",
    "accessory",
    "aksesuar"
  ],
  home: [
    "home",
    "ev",
    "household",
    "furniture",
    "mobilya",
    "kitchen",
    "mutfak",
    "decor",
    "dekor",
    "dekorasyon",
    "appliance",
    "beyaz esya",
    "beyaz eşya",
    "cleaning",
    "temizlik",
    "bathroom",
    "banyo",
    "market",
    "süpermarket",
    "supermarket",
    "gida",
    "gıda",
    "kahvalti",
    "kahvaltı",
    "food",
    "yiyecek",
    "icecek",
    "içecek",
    "chocolate",
    "çikolata",
    "cikolata",
    "kremasi",
    "kreması",
    "findik",
    "fındık",
    "bakim",
    "bakım",
    "kozmetik"
  ]
};

// Detect app category from weighted signals like title, breadcrumb, description, keywords, and URL path.
function detectCategoryFromSignals(signals) {
  const scoreMap = {
    electronics: 0,
    books: 0,
    fashion: 0,
    home: 0
  };

  const weightedInputs = [
    { text: signals?.jsonLdCategory, weight: 4 },
    { text: signals?.metaCategory, weight: 4 },
    { text: signals?.breadcrumb, weight: 3 },
    { text: signals?.title, weight: 3 },
    { text: signals?.keywords, weight: 2 },
    { text: signals?.urlPath, weight: 2 },
    { text: signals?.description, weight: 1 },
    { text: signals?.host, weight: 1 }
  ];

  weightedInputs.forEach((entry) => {
    const normalizedText = String(entry.text || "").toLowerCase();
    if (!normalizedText) return;

    Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
      let matchedCount = 0;
      keywords.forEach((keyword) => {
        if (normalizedText.includes(keyword)) {
          matchedCount += 1;
        }
      });

      if (matchedCount > 0) {
        scoreMap[category] += entry.weight * matchedCount;
      }
    });
  });

  const ranked = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  const [bestCategory, bestScore] = ranked[0] || ["other", 0];

  return bestScore >= 2 ? bestCategory : "other";
}

// Parse numeric price from metadata string.
function parsePrice(rawPrice) {
  if (!rawPrice) return "";
  const textValue = String(rawPrice).replace(/[^\d,.-]/g, "");
  if (!textValue) return "";

  const hasComma = textValue.includes(",");
  const hasDot = textValue.includes(".");
  let normalized = textValue;

  if (hasComma && hasDot) {
    if (textValue.lastIndexOf(",") > textValue.lastIndexOf(".")) {
      normalized = textValue.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = textValue.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = textValue.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = textValue.replace(/,/g, "");
  }

  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return "";
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value < 0) return "";
  return String(Number(value.toFixed(2)));
}

// Fetch metadata from Microlink API (often richer than direct HTML meta tags).
async function fetchMetadataFromMicrolink(url, abortSignal) {
  const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=true`;
  const response = await fetch(endpoint, {
    method: "GET",
    signal: abortSignal
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const data = payload && payload.data ? payload.data : null;
  if (!data || typeof data !== "object") return null;

  const rawImageUrl =
    (typeof data.image === "string" && data.image) ||
    (data.image && typeof data.image === "object" && typeof data.image.url === "string"
      ? data.image.url
      : "");
  const imageUrl = normalizeImageUrlValue(rawImageUrl);
  const inferredCategory = detectCategoryFromSignals({
    title: data.title,
    description: data.description,
    keywords: Array.isArray(data.keywords) ? data.keywords.join(" ") : String(data.keywords || ""),
    metaCategory: data.category,
    host: parseUrl(url)?.hostname || ""
  });

  return {
    title: String(data.title || "").trim(),
    description: String(data.description || "").trim(),
    imageUrl: String(imageUrl || "").trim(),
    price: parsePrice(data.price || ""),
    category: inferredCategory,
    sourceUrl: normalizeSourceUrl(data.url || url)
  };
}

// Prefer concrete categories over "other" while merging metadata sources.
function pickPreferredCategory(currentCategory, nextCategory) {
  const currentValue = String(currentCategory || "").trim();
  const nextValue = String(nextCategory || "").trim();

  if (!currentValue) return nextValue;
  if (currentValue === "other" && nextValue && nextValue !== "other") return nextValue;
  return currentValue;
}

// Merge autofill candidates by preferring non-empty values.
function mergeAutofillCandidates(...candidates) {
  return candidates.reduce(
    (acc, current) => ({
      title: acc.title || current?.title || "",
      description: acc.description || current?.description || "",
      price: acc.price || current?.price || "",
      category: pickPreferredCategory(acc.category, current?.category),
      sourceUrl: acc.sourceUrl || current?.sourceUrl || "",
      imageUrl: acc.imageUrl || current?.imageUrl || ""
    }),
    {
      title: "",
      description: "",
      price: "",
      category: "",
      sourceUrl: "",
      imageUrl: ""
    }
  );
}

// Fetch a lightweight markdown snapshot via r.jina.ai for sites that block direct/proxy HTML requests.
async function fetchJinaMarkdown(url, abortSignal) {
  const normalized = String(url || "").trim().replace(/^https?:\/\//i, "");
  if (!normalized) return "";

  const endpoints = [`https://r.jina.ai/http://${normalized}`, `https://r.jina.ai/https://${normalized}`];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: abortSignal
    }).catch(() => null);

    if (!response || !response.ok) continue;
    const text = await response.text().catch(() => "");
    if (text && text.length > 40) return text;
  }

  return "";
}

// Extract image URLs from markdown/plain text payload.
function extractImageUrlsFromText(rawText) {
  const text = String(rawText || "");
  if (!text) return [];

  const urls = [];
  const seen = new Set();

  const addUrl = (value) => {
    const normalized = normalizeImageUrlValue(value);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  };

  const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
  let match = null;
  while ((match = markdownImageRegex.exec(text))) {
    addUrl(match[1]);
  }

  const looseImageRegex = /(https?:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp|avif|gif|bmp)(?:[^\s)"']*)?)/gi;
  while ((match = looseImageRegex.exec(text))) {
    addUrl(match[1]);
  }

  return urls;
}

// Extract product metadata from a jina markdown snapshot.
function extractProductDataFromJinaMarkdown(markdownText, sourceUrl) {
  const normalizedText = String(markdownText || "");
  if (!normalizedText) return null;

  const titleMatch = normalizedText.match(/^Title:\s*(.+)$/im);
  const headingMatch = normalizedText.match(/^(.+)\n=+$/m);
  const descriptionMatch = normalizedText.match(/Markdown Content:\s*[\r\n]+([\s\S]{40,600}?)(?:\n-{2,}|\n\*|\n!\[|$)/i);

  const priceMatch =
    normalizedText.match(/([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?\s?(?:TL|TRY|₺))/i) ||
    normalizedText.match(/((?:TL|TRY|₺)\s?[0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?)/i) ||
    normalizedText.match(/(\$[0-9]+(?:\.[0-9]{2})?)/);

  const imageCandidates = extractImageUrlsFromText(normalizedText).map((url) => ({
    url,
    source: "jina_markdown"
  }));

  const title = String(titleMatch?.[1] || headingMatch?.[1] || "").trim();
  const description = String(descriptionMatch?.[1] || "").replace(/\s+/g, " ").trim();
  const price = parsePrice(priceMatch?.[1] || "");
  const category = detectCategoryFromSignals({
    title,
    description,
    urlPath: sourceUrl.pathname,
    host: sourceUrl.hostname
  });
  const imageUrl = pickBestProductImageUrl(imageCandidates, sourceUrl.href, title, description);

  return {
    title,
    description,
    price,
    category,
    imageUrl,
    sourceUrl: sourceUrl.href
  };
}

// Extract product-like metadata from fetched HTML.
function extractProductDataFromHtml(html, sourceUrl) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, "text/html");
  const jsonLd = parseProductJsonLd(documentNode);
  const canonicalHref =
    documentNode.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
    readMetaContent(documentNode, ['meta[property="og:url"]']);
  const resolvedSourceUrl = normalizeSourceUrl(
    resolveUrlMaybeRelative(canonicalHref || sourceUrl.href, sourceUrl.href)
  );

  const title =
    jsonLd.title ||
    readMetaContent(documentNode, [
      'meta[property="og:title"]',
      'meta[property="twitter:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]'
    ]) ||
    documentNode.querySelector("h1")?.textContent?.trim() ||
    documentNode.querySelector("title")?.textContent?.trim() ||
    "";

  const description =
    jsonLd.description ||
    readMetaContent(documentNode, [
      'meta[property="og:description"]',
      'meta[property="twitter:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]'
    ]) ||
    documentNode.querySelector('[itemprop="description"]')?.textContent?.trim() ||
    documentNode.querySelector(".product-description, .description, #description")?.textContent?.trim() ||
    readFirstMeaningfulParagraph(documentNode);

  const rawPrice =
    jsonLd.price ||
    readMetaContent(documentNode, [
      'meta[property="product:price:amount"]',
      'meta[itemprop="price"]',
      'meta[name="price"]'
    ]) ||
    readTextContent(documentNode, [
      '[itemprop="price"]',
      '[data-test-id*="price"]',
      '[data-testid*="price"]',
      ".price",
      ".product-price",
      '[class*="price"]'
    ]);
  const imageCandidates = [
    { url: jsonLd.imageUrl, source: "jsonld" },
    {
      url: readMetaContent(documentNode, ['meta[itemprop="image"]', 'meta[property="product:image"]']),
      source: "product_meta"
    },
    {
      url: readMetaContent(documentNode, [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:secure_url"]',
        'meta[property="twitter:image"]',
        'meta[name="twitter:image"]'
      ]),
      source: "open_graph"
    },
    { url: documentNode.querySelector('[itemprop="image"]')?.getAttribute("src") || "", source: "product_dom" },
    { url: documentNode.querySelector('[itemprop="image"]')?.getAttribute("data-src") || "", source: "product_dom" },
    { url: documentNode.querySelector("img[data-zoom-image]")?.getAttribute("data-zoom-image") || "", source: "zoom_dom" },
    { url: documentNode.querySelector("img[data-src]")?.getAttribute("data-src") || "", source: "lazy_dom" },
    { url: documentNode.querySelector("img[srcset]")?.getAttribute("srcset")?.split(",")[0]?.trim()?.split(" ")[0] || "", source: "srcset_dom" },
    {
      url: documentNode.querySelector("main img[src], article img[src], .product img[src]")?.getAttribute("src") || "",
      source: "main_dom"
    },
    { url: documentNode.querySelector("img[src]")?.getAttribute("src") || "", source: "fallback_dom" },
    ...collectDomImageCandidates(documentNode).map((url) => ({ url, source: "img_dom" }))
  ];

  const keywords = readMetaContent(documentNode, ['meta[name="keywords"]']);
  const metaCategory = readMetaContent(documentNode, [
    'meta[property="product:category"]',
    'meta[name="product:category"]',
    'meta[property="og:product:category"]',
    'meta[property="article:section"]',
    'meta[name="category"]'
  ]);
  const breadcrumb = readBreadcrumbText(documentNode);
  const price = parsePrice(rawPrice);
  const category = detectCategoryFromSignals({
    title,
    description,
    keywords: `${keywords} ${jsonLd.keywords || ""}`,
    breadcrumb,
    urlPath: sourceUrl.pathname,
    jsonLdCategory: jsonLd.category,
    metaCategory,
    host: sourceUrl.hostname
  });
  const imageUrl = pickBestProductImageUrl(
    imageCandidates,
    sourceUrl.href,
    title,
    description
  );

  return { title, description, price, category, imageUrl, sourceUrl: resolvedSourceUrl };
}

// Apply autofilled values into product form inputs.
function applyAutofillValues(values) {
  if (values.sourceUrl) {
    productLinkInput.value = values.sourceUrl;
  }
  if (values.title) productTitleInput.value = values.title.slice(0, 80);
  if (values.description) productDescriptionInput.value = values.description.slice(0, 300);
  if (values.price) productPriceInput.value = values.price;
  if (values.category && [...productCategoryInput.options].some((option) => option.value === values.category)) {
    productCategoryInput.value = values.category;
  }
  if (values.imageUrl) {
    productImageUrlInput.value = normalizeImageUrlValue(values.imageUrl);
  }
}

// Convert a Blob to Base64 data URL.
function convertBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(new Error("Failed to process image blob."));
    reader.readAsDataURL(blob);
  });
}

// Fetch remote image URL and convert to Base64.
async function convertImageUrlToBase64(imageUrl, abortSignal) {
  if (!imageUrl) return "";

  const directResponse = await fetch(imageUrl, {
    method: "GET",
    signal: abortSignal
  }).catch(() => null);

  if (directResponse && directResponse.ok) {
    const blob = await directResponse.blob();
    if (blob.type.startsWith("image/") && blob.size <= MAX_IMAGE_BYTES) {
      return convertBlobToBase64(blob);
    }
  }

  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
  const proxyResponse = await fetch(proxyUrl, {
    method: "GET",
    signal: abortSignal
  });

  if (!proxyResponse.ok) return "";

  const proxyBlob = await proxyResponse.blob();
  if (!proxyBlob.type.startsWith("image/")) return "";
  if (proxyBlob.size > MAX_IMAGE_BYTES) return "";
  return convertBlobToBase64(proxyBlob);
}

// Store and preview auto-filled product image.
function setAutofillImagePreview(base64Image) {
  pendingAutofillImageBase64 = base64Image || "";
  if (pendingAutofillImageBase64) {
    autofillImagePreview.src = pendingAutofillImageBase64;
    autofillImagePreview.hidden = false;
    return;
  }

  autofillImagePreview.src = "";
  autofillImagePreview.hidden = true;
}

// Fetch URL metadata and autofill product form fields.
async function autofillProductFromUrl(rawUrl) {
  const parsedUrl = parseUrl(rawUrl);
  if (!parsedUrl) return;

  if (autofillAbortController) {
    autofillAbortController.abort();
  }

  autofillAbortController = new AbortController();
  formErrorMessage.textContent = "";
  setAutofillLoading(true);

  try {
    const apiMetadata = await fetchMetadataFromMicrolink(
      parsedUrl.href,
      autofillAbortController.signal
    ).catch(() => null);

    let htmlMetadata = null;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(parsedUrl.href)}`;
    const response = await fetch(proxyUrl, {
      method: "GET",
      signal: autofillAbortController.signal
    }).catch(() => null);

    if (response && response.ok) {
      const html = await response.text();
      htmlMetadata = extractProductDataFromHtml(html, parsedUrl);
    }

    let jinaMetadata = null;
    if (!htmlMetadata || !htmlMetadata.imageUrl) {
      const jinaMarkdown = await fetchJinaMarkdown(parsedUrl.href, autofillAbortController.signal).catch(() => "");
      if (jinaMarkdown) {
        jinaMetadata = extractProductDataFromJinaMarkdown(jinaMarkdown, parsedUrl);
      }
    }

    const extracted = mergeAutofillCandidates(htmlMetadata, jinaMetadata, apiMetadata, {
      sourceUrl: parsedUrl.href
    });

    if (!extracted.title && !extracted.description && !extracted.imageUrl) {
      throw new Error("No metadata extracted.");
    }

    if (!extracted.description) {
      extracted.description = buildFallbackDescription(parsedUrl, extracted.title);
    }

    if (!extracted.category) {
      extracted.category = detectCategoryFromSignals({
        title: extracted.title,
        description: extracted.description,
        urlPath: parsedUrl.pathname,
        host: parsedUrl.hostname
      });
    }
    extracted.sourceUrl = normalizeSourceUrl(extracted.sourceUrl || parsedUrl.href);

    applyAutofillValues(extracted);

    if (extracted.imageUrl) {
      try {
        const imageBase64 = await convertImageUrlToBase64(
          extracted.imageUrl,
          autofillAbortController.signal
        );
        setAutofillImagePreview(imageBase64);
      } catch {
        // Keep image URL field filled even if preview conversion fails.
        setAutofillImagePreview("");
      }
    } else {
      setAutofillImagePreview("");
    }

    showToast("Fields auto-filled from link.");
  } catch {
    // Fallback: use URL slug when metadata fetching fails.
    const slugGuess = parsedUrl.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]+/g, " ")
      ?.trim();

    if (slugGuess) {
      if (!productTitleInput.value.trim()) {
        productTitleInput.value = slugGuess.slice(0, 80);
      }
      if (!productCategoryInput.value) {
        productCategoryInput.value = detectCategoryFromSignals({
          title: slugGuess,
          urlPath: parsedUrl.pathname,
          host: parsedUrl.hostname
        });
      }
      setAutofillImagePreview("");
      showToast("Basic auto-fill applied from URL.");
    } else {
      setAutofillImagePreview("");
      formErrorMessage.textContent = "Could not auto-fill from this link. You can fill fields manually.";
    }
  } finally {
    setAutofillLoading(false);
    autofillAbortController = null;
  }
}

// Render full product details and all comments inside the modal.
function renderProductModalContent(product) {
  modalContent.innerHTML = "";

  if (product.imageBase64) {
    const modalImage = document.createElement("img");
    modalImage.className = "modal-image";
    applyImageSourceWithFallback(modalImage, product.imageBase64);
    modalImage.alt = `${product.title} full preview`;
    modalContent.appendChild(modalImage);
  }

  const title = document.createElement("h3");
  title.textContent = product.title;

  const meta = document.createElement("div");
  meta.className = "modal-meta";

  const priceChip = document.createElement("span");
  priceChip.className = "modal-chip";
  priceChip.textContent = `Price: ${formatPrice(product.price)}`;

  const categoryChip = document.createElement("span");
  categoryChip.className = "modal-chip";
  categoryChip.textContent = `Category: ${product.category}`;

  const likesChip = document.createElement("span");
  likesChip.className = "modal-chip";
  likesChip.textContent = `Likes: ${product.likes}`;

  const ownerChip = document.createElement("span");
  ownerChip.className = "modal-chip";
  ownerChip.textContent = `By: ${product.ownerUsername}`;

  meta.append(priceChip, categoryChip, likesChip, ownerChip);

  const descriptionTitle = document.createElement("p");
  descriptionTitle.textContent = "Full Description";

  const fullDescription = document.createElement("p");
  fullDescription.textContent = product.description;

  const commentsTitle = document.createElement("p");
  commentsTitle.textContent = "All Comments";

  const commentsList = document.createElement("div");
  commentsList.className = "modal-comments";

  if (!product.comments.length) {
    const emptyComment = document.createElement("p");
    emptyComment.className = "modal-comment";
    emptyComment.textContent = "No comments yet.";
    commentsList.appendChild(emptyComment);
  } else {
    product.comments.forEach((comment) => {
      const item = document.createElement("p");
      item.className = "modal-comment";
      item.textContent = comment.text;
      commentsList.appendChild(item);
    });
  }

  if (product.sourceUrl) {
    const sourceLink = document.createElement("a");
    sourceLink.className = "source-link";
    sourceLink.href = product.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    const hostLabel = getSourceHostLabel(product.sourceUrl);
    sourceLink.textContent = hostLabel ? `Open Original (${hostLabel})` : "Open Original Product";
    modalContent.append(sourceLink);
  }

  modalContent.append(title, meta, descriptionTitle, fullDescription, commentsTitle, commentsList);
}

// Open modal for a selected product id.
function openProductModalById(productId) {
  const product = appState.products.find((item) => item.id === productId);
  if (!product) return;

  renderProductModalContent(product);
  productModal.classList.add("open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

// Close product detail modal.
function closeProductModal() {
  productModal.classList.remove("open");
  productModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

// Update My Products toggle UI label/state.
function updateMyProductsToggleUI() {
  myProductsToggleButton.setAttribute("aria-pressed", appState.myProductsOnly ? "true" : "false");
  myProductsToggleButton.textContent = appState.myProductsOnly
    ? "Show Only Mine: On"
    : "Show Only Mine: Off";
}

// Remove rendered product cards while preserving the section heading.
function clearRenderedProductCards() {
  const cards = productListSection.querySelectorAll("article");
  cards.forEach((card) => card.remove());
}

// Build a comment list node for a single product.
function createCommentListElement(comments) {
  const listContainer = document.createElement("div");
  listContainer.className = "comment-list";

  if (!comments.length) {
    const emptyText = document.createElement("p");
    emptyText.className = "comment-empty";
    emptyText.textContent = "No comments yet.";
    listContainer.appendChild(emptyText);
    return listContainer;
  }

  comments.forEach((commentItem) => {
    const commentText = document.createElement("p");
    commentText.className = "comment-item";
    commentText.textContent = commentItem.text;
    listContainer.appendChild(commentText);
  });

  return listContainer;
}

// Build one product card as an <article> element.
function createProductCardElement(product, animationType = "default") {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.productId = product.id;
  card.draggable = true;

  if (animationType === "add") {
    card.classList.add("card-enter");
  } else if (animationType === "filter") {
    card.classList.add("filter-enter");
  }

  if (product.imageBase64) {
    const previewImage = document.createElement("img");
    previewImage.className = "product-image";
    applyImageSourceWithFallback(previewImage, product.imageBase64);
    previewImage.alt = `${product.title} preview`;
    previewImage.loading = "lazy";
    card.appendChild(previewImage);
  }

  const title = document.createElement("h3");
  title.textContent = product.title;

  const description = document.createElement("p");
  description.textContent = product.description;

  const price = document.createElement("p");
  price.textContent = `Price: ${formatPrice(product.price)}`;

  const category = document.createElement("p");
  category.textContent = `Category: ${product.category}`;

  const owner = document.createElement("p");
  owner.textContent = `By: ${product.ownerUsername}`;

  let sourceLink = null;
  if (product.sourceUrl) {
    sourceLink = document.createElement("a");
    sourceLink.className = "source-link";
    sourceLink.href = product.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    const hostLabel = getSourceHostLabel(product.sourceUrl);
    sourceLink.textContent = hostLabel ? `Open Original (${hostLabel})` : "Open Original Product";
  }

  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = "like-btn";
  likeButton.dataset.action = "like";
  likeButton.dataset.id = product.id;
  likeButton.textContent = `Like (${product.likes})`;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "ghost";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = product.id;
  deleteButton.textContent = "Delete";

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(likeButton, deleteButton);

  const commentsTitle = document.createElement("p");
  commentsTitle.textContent = "Comments";

  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";
  commentForm.dataset.id = product.id;

  const commentInput = document.createElement("input");
  commentInput.type = "text";
  commentInput.name = "comment";
  commentInput.placeholder = "Write a comment";
  commentInput.maxLength = 140;
  commentInput.required = true;

  const addCommentButton = document.createElement("button");
  addCommentButton.type = "submit";
  addCommentButton.textContent = "Add Comment";

  commentForm.append(commentInput, addCommentButton);

  const commentListElement = createCommentListElement(product.comments);

  card.append(
    title,
    description,
    price,
    category,
    owner,
    ...(sourceLink ? [sourceLink] : []),
    actions,
    commentsTitle,
    commentListElement,
    commentForm
  );

  return card;
}

// Filter products by category and text search using Array.filter().
function getFilteredProducts() {
  const normalizedSearch = appState.searchQuery.trim().toLowerCase();

  let visibleProducts = appState.products;

  visibleProducts = visibleProducts.filter((product) => {
    return appState.categoryFilter === "all" || product.category === appState.categoryFilter;
  });

  visibleProducts = visibleProducts.filter((product) => {
    if (!normalizedSearch) return true;

    return (
      product.title.toLowerCase().includes(normalizedSearch) ||
      product.description.toLowerCase().includes(normalizedSearch)
    );
  });

  if (appState.myProductsOnly) {
    visibleProducts = visibleProducts.filter((product) => {
      return product.ownerUsername === appState.profile.username;
    });
  }

  const sortedProducts = [...visibleProducts].sort((a, b) => {
    if (appState.sortBy === "price") {
      return a.price - b.price;
    }

    if (appState.sortBy === "likes") {
      return b.likes - a.likes;
    }

    return b.createdAt - a.createdAt;
  });

  return sortedProducts;
}

// Render visible products into the DOM.
function renderProducts(animationType = "default") {
  clearRenderedProductCards();

  const visibleProducts = getFilteredProducts();

  if (!visibleProducts.length) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "product-card";

    if (animationType === "filter") {
      emptyCard.classList.add("filter-enter");
    }

    const emptyTitle = document.createElement("h3");
    emptyTitle.textContent = "No products found";

    const emptyDescription = document.createElement("p");
    emptyDescription.textContent = "Try adding a product or changing your search/filter.";

    emptyCard.append(emptyTitle, emptyDescription);
    productListSection.appendChild(emptyCard);
    return;
  }

  visibleProducts.forEach((product) => {
    const card = createProductCardElement(product, animationType);
    productListSection.appendChild(card);
  });
}

// Validate product form before creating a product object.
function validateProductForm(formData) {
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const priceValue = Number(formData.get("price"));
  const category = String(formData.get("category") || "").trim();
  const sourceUrl = normalizeSourceUrl(formData.get("product-link"));
  const imageUrl = normalizeImageUrlValue(formData.get("image-url"));

  if (!title) return "Title is required.";
  if (!description) return "Description is required.";
  if (!category) return "Category is required.";
  if (!Number.isFinite(priceValue) || priceValue < 0) return "Price must be 0 or greater.";
  if (String(formData.get("product-link") || "").trim() && !sourceUrl) {
    return "Please provide a valid product source link.";
  }

  if (imageUrl) {
    const parsedImageUrl = parseUrl(imageUrl);
    const isDataImage = imageUrl.startsWith("data:image/");
    if (!parsedImageUrl && !isDataImage) return "Please provide a valid image URL.";
  }

  return "";
}

// Convert an image file to Base64 using the FileReader API.
function convertImageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image file."));
    };

    reader.readAsDataURL(file);
  });
}

// Build a product object using the required data model.
async function createProductFromForm(formData) {
  const sourceUrl = normalizeSourceUrl(formData.get("product-link"));
  const imageUrl = normalizeImageUrlValue(formData.get("image-url"));
  let imageBase64 = "";

  if (pendingAutofillImageBase64) {
    imageBase64 = pendingAutofillImageBase64;
  } else if (imageUrl) {
    if (/^data:image\//i.test(imageUrl)) {
      imageBase64 = imageUrl;
    } else {
      const convertedImage = await convertImageUrlToBase64(imageUrl).catch(() => "");
      imageBase64 = convertedImage || imageUrl;
    }
  }

  return {
    id: crypto.randomUUID(),
    title: String(formData.get("title")).trim(),
    description: String(formData.get("description")).trim(),
    price: Number(formData.get("price")),
    category: String(formData.get("category")).trim(),
    likes: 0,
    ownerUsername: appState.profile.username || "Guest",
    sourceUrl,
    imageBase64,
    comments: [],
    createdAt: Date.now()
  };
}

// Move one product before another in the backing array.
function moveProductBeforeProduct(draggedProductId, targetProductId) {
  if (!draggedProductId || !targetProductId || draggedProductId === targetProductId) return;

  const draggedIndex = appState.products.findIndex((product) => product.id === draggedProductId);
  const targetIndex = appState.products.findIndex((product) => product.id === targetProductId);

  if (draggedIndex < 0 || targetIndex < 0) return;

  const [draggedProduct] = appState.products.splice(draggedIndex, 1);
  const nextTargetIndex = appState.products.findIndex((product) => product.id === targetProductId);
  appState.products.splice(nextTargetIndex, 0, draggedProduct);
}

// Reset temporary drag styles/markers.
function clearDragUIState() {
  productListSection.querySelectorAll(".drag-over").forEach((element) => {
    element.classList.remove("drag-over");
  });

  productListSection.querySelectorAll(".dragging").forEach((element) => {
    element.classList.remove("dragging");
  });

  appState.draggedProductId = null;
  appState.isDragging = false;
}

// Start dragging a product card.
function handleDragStart(event) {
  const card = event.target.closest("article.product-card[data-product-id]");
  if (!card) return;

  appState.draggedProductId = card.dataset.productId;
  appState.isDragging = true;
  card.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", appState.draggedProductId);
  }
}

// Allow drop over valid product cards.
function handleDragOver(event) {
  const overCard = event.target.closest("article.product-card[data-product-id]");
  if (!overCard) return;

  event.preventDefault();

  productListSection.querySelectorAll(".drag-over").forEach((card) => {
    card.classList.remove("drag-over");
  });

  if (overCard.dataset.productId !== appState.draggedProductId) {
    overCard.classList.add("drag-over");
  }
}

// Reorder products when dropped on another card.
function handleDrop(event) {
  const dropCard = event.target.closest("article.product-card[data-product-id]");
  if (!dropCard) return;

  event.preventDefault();

  const targetProductId = dropCard.dataset.productId;
  moveProductBeforeProduct(appState.draggedProductId, targetProductId);

  saveProductsToStorage();
  renderProducts("filter");
  clearDragUIState();
}

// Finalize drag interaction state.
function handleDragEnd() {
  clearDragUIState();
  window.setTimeout(() => {
    appState.isDragging = false;
  }, 0);
}

// Prevent modal opening when user interacts with controls inside a card.
function shouldIgnoreCardOpen(target) {
  return Boolean(
    target.closest("button, input, textarea, select, form, label, a, [data-action]")
  );
}

// Open the detail modal when clicking on non-interactive card content.
function handleProductCardOpen(event) {
  const card = event.target.closest("article.product-card[data-product-id]");
  if (!card) return;
  if (appState.isDragging) return;
  if (shouldIgnoreCardOpen(event.target)) return;

  const product = appState.products.find((item) => item.id === card.dataset.productId);
  if (product?.sourceUrl) {
    window.open(product.sourceUrl, "_blank", "noopener,noreferrer");
    return;
  }

  openProductModalById(card.dataset.productId);
}

// Close detail modal with Escape key.
function handleModalEscapeClose(event) {
  if (event.key === "Escape" && productModal.classList.contains("open")) {
    closeProductModal();
  }
}

// Close modal when user clicks backdrop or the close button.
function handleModalClickClose(event) {
  const closeTarget = event.target.closest("[data-close-modal=\"true\"], #modal-close");
  if (closeTarget) {
    closeProductModal();
  }
}

// Export current app data as downloadable JSON (Blob API).
function handleExportData() {
  dataErrorMessage.textContent = "";

  const payload = buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `beusharebox-export-${Date.now()}.json`;
  link.click();

  URL.revokeObjectURL(objectUrl);
}

// Handle imported JSON file and merge safely with existing data.
async function handleImportDataFile(event) {
  dataErrorMessage.textContent = "";

  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const fileText = await file.text();
    const parsedJson = JSON.parse(fileText);
    const parsedPayload = parseImportedPayload(parsedJson);

    mergeProductsSafely(parsedPayload.products);
    mergeProfileSafely(parsedPayload.profile);

    saveProductsToStorage();
    saveProfileToStorage();
    updateProfileUI();
    updateSummaryStats();
    renderProducts("filter");
  } catch {
    dataErrorMessage.textContent = "Invalid JSON file. Please import a valid BEUShareBox export.";
  } finally {
    importDataInput.value = "";
  }
}

// Handle profile form submission.
async function handleProfileFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(profileForm);
  const validationError = validateProfileForm(formData);

  if (validationError) {
    profileErrorMessage.textContent = validationError;
    return;
  }

  const username = String(formData.get("username")).trim();
  const avatarUrl = String(formData.get("avatar-url") || "").trim();

  appState.profile = {
    username,
    avatarBase64: avatarUrl
  };

  saveProfileToStorage();
  updateProfileUI();
  profileErrorMessage.textContent = "";
  profileForm.reset();

  if (appState.myProductsOnly) {
    renderProducts("filter");
  }
}

// Toggle My Products mode.
function handleMyProductsToggle() {
  if (!appState.profile.username || appState.profile.username === "Guest") {
    profileErrorMessage.textContent = "Set your username first to use My Products filter.";
    return;
  }

  profileErrorMessage.textContent = "";
  appState.myProductsOnly = !appState.myProductsOnly;
  updateMyProductsToggleUI();
  renderProducts("filter");
}

// Handle add-product form submission.
async function handleProductFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(productForm);
  const validationError = validateProductForm(formData);

  if (validationError) {
    formErrorMessage.textContent = validationError;
    return;
  }

  try {
    const newProduct = await createProductFromForm(formData);
    appState.products.push(newProduct);
  } catch {
    formErrorMessage.textContent = "Unable to process image. Please try another file.";
    return;
  }

  saveProductsToStorage();
  updateSummaryStats();
  renderProducts("add");
  showToast("Product added successfully.");

  productForm.reset();
  formErrorMessage.textContent = "";
}

// Handle delegated card actions like like/delete.
function handleProductCardActionClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) return;

  const productId = actionButton.dataset.id;
  const actionType = actionButton.dataset.action;

  const productIndex = appState.products.findIndex((product) => product.id === productId);
  if (productIndex === -1) return;

  if (actionType === "like") {
    appState.products[productIndex].likes += 1;
    saveProductsToStorage();
    updateSummaryStats();
    renderProducts();
    showToast("Product liked.");
    return;
  }

  if (actionType === "delete") {
    const isConfirmed = window.confirm("Delete this product?");
    if (!isConfirmed) return;

    const productCard = actionButton.closest("article.product-card[data-product-id]");

    const applyDelete = () => {
      appState.products = appState.products.filter((product) => product.id !== productId);
      saveProductsToStorage();
      updateSummaryStats();
      renderProducts("filter");
      showToast("Product deleted.");
    };

    if (!productCard) {
      applyDelete();
      return;
    }

    productCard.classList.add("card-exit");
    window.setTimeout(applyDelete, CARD_EXIT_ANIMATION_MS);
  }
}

// Handle delegated comment form submission on each card.
function handleCommentFormSubmit(event) {
  const commentForm = event.target.closest("form.comment-form");
  if (!commentForm) return;

  event.preventDefault();

  const productId = commentForm.dataset.id;
  const commentInput = commentForm.querySelector("input[name='comment']");
  const commentText = commentInput ? commentInput.value.trim() : "";

  if (!commentText) return;

  const targetProduct = appState.products.find((product) => product.id === productId);
  if (!targetProduct) return;

  targetProduct.comments.push({
    id: crypto.randomUUID(),
    text: commentText,
    createdAt: Date.now()
  });

  saveProductsToStorage();
  updateSummaryStats();
  renderProducts();
}

// Wire all event listeners.
function attachEventListeners() {
  productForm.addEventListener("submit", handleProductFormSubmit);
  profileForm.addEventListener("submit", handleProfileFormSubmit);

  const requestAutofillFromCurrentInput = () => {
    const rawValue = productLinkInput.value.trim();
    if (!rawValue || !parseUrl(rawValue)) return;

    window.clearTimeout(autofillDebounceTimerId);
    autofillDebounceTimerId = window.setTimeout(() => {
      autofillProductFromUrl(rawValue);
    }, 500);
  };

  productLinkInput.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text");
    if (pastedText) {
      window.setTimeout(() => {
        productLinkInput.value = pastedText;
        requestAutofillFromCurrentInput();
      }, 0);
    }
  });

  productLinkInput.addEventListener("input", () => {
    requestAutofillFromCurrentInput();
  });

  productLinkInput.addEventListener("change", () => {
    requestAutofillFromCurrentInput();
  });

  productForm.addEventListener("reset", () => {
    formErrorMessage.textContent = "";
    setAutofillImagePreview("");
  });

  categoryFilterSelect.addEventListener("change", (event) => {
    appState.categoryFilter = event.target.value;
    renderProducts("filter");
  });

  searchInput.addEventListener("input", (event) => {
    appState.searchQuery = event.target.value;
    renderProducts("filter");
  });

  sortBySelect.addEventListener("change", (event) => {
    appState.sortBy = event.target.value;
    renderProducts("filter");
  });

  myProductsToggleButton.addEventListener("click", handleMyProductsToggle);
  exportDataButton.addEventListener("click", handleExportData);
  importDataButton.addEventListener("click", () => importDataInput.click());
  importDataInput.addEventListener("change", handleImportDataFile);

  productListSection.addEventListener("click", handleProductCardActionClick);
  productListSection.addEventListener("click", handleProductCardOpen);
  productListSection.addEventListener("submit", handleCommentFormSubmit);
  productListSection.addEventListener("dragstart", handleDragStart);
  productListSection.addEventListener("dragover", handleDragOver);
  productListSection.addEventListener("drop", handleDrop);
  productListSection.addEventListener("dragend", handleDragEnd);
  themeToggleButton.addEventListener("click", toggleTheme);
  productModal.addEventListener("click", handleModalClickClose);
  modalCloseButton.addEventListener("click", closeProductModal);
  document.addEventListener("keydown", handleModalEscapeClose);
}

// Initialize the app.
function initApp() {
  applyTheme(loadStoredTheme());
  updateProfileUI();
  updateMyProductsToggleUI();
  attachEventListeners();
  updateSummaryStats();
  renderProducts();
}

initApp();
