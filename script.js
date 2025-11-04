// S.to-like Framework Script - Universal German Streaming Site Plugin
// Supports sites using the S.to/Aniworld framework

// These constants are populated during config generation
const PLATFORM = plugin.config.constants?.platformName ?? "S.to-like";
const BASE_URL = plugin.config.constants?.baseUrl ?? "https://s.to";
const CONTENT_TYPE = plugin.config.constants?.contentType ?? "serie"; // "anime" or "serie"

let config = {};

//================ SOURCE API IMPLEMENTATION ================//

source.enable = function (conf, settings, savedState) {
  config = conf ?? {};
};

source.saveState = function () {
  return "";
};

source.getHome = function () {
  try {
    const dom = fetchHTML("/");
    const results = [];

    const coverLinks = dom.querySelectorAll("a[href*='/stream/']");
    for (let i = 0; i < Math.min(coverLinks.length, 20); i++) {
      const link = coverLinks[i];
      let href = link.getAttribute("href");
      const img = link.querySelector("img");

      if (href && href.includes("/stream/")) {
        // Normalize URL: ensure we have a relative path first
        let relativePath = href;
        if (href.startsWith("http")) {
          // Strip any domain to get relative path
          relativePath = href.replace(/^https?:\/\/[^\/]+/, "");
        }

        // Build full URL from clean relative path
        const fullUrl = BASE_URL + relativePath;

        // Extract clean title from the path
        const pathMatch = relativePath.match(/\/stream\/([^\/]+)/);
        const titleSlug = pathMatch ? pathMatch[1] : "";
        const title = extractTitleFromPath(titleSlug);

        const thumbnail = img
          ? img.getAttribute("data-src") || img.getAttribute("src")
          : "";

        // Normalize thumbnail URL
        const fullThumbnail =
          thumbnail && !thumbnail.startsWith("http")
            ? BASE_URL + thumbnail
            : thumbnail;

        results.push(
          new PlatformVideo({
            id: new PlatformID(PLATFORM, relativePath, config.id),
            name: title,
            thumbnails: new Thumbnails(
              fullThumbnail ? [new Thumbnail(fullThumbnail, 0)] : []
            ),
            author: new PlatformAuthorLink(
              new PlatformID(PLATFORM, relativePath, config.id),
              title,
              fullUrl,
              fullThumbnail
            ),
            uploadDate: parseInt(new Date().getTime() / 1000),
            duration: 0,
            viewCount: 0,
            url: fullUrl,
            isLive: false,
          })
        );
      }
    }

    return new ContentPager(results, false);
  } catch (e) {
    log("Error in getHome: " + e);
    return new ContentPager([], false);
  }
};

source.searchSuggestions = function (query) {
  if (!query || query.length < 2) return [];

  try {
    // Try to get autocomplete suggestions from the search endpoint
    const resp = http.GET(
      `${BASE_URL}/ajax/search/suggest?keyword=${encodeURIComponent(query)}`,
      {},
      false
    );

    if (resp.isOk) {
      try {
        const data = JSON.parse(resp.body);
        if (data && Array.isArray(data)) {
          return data
            .map((item) => item.title || item.name || item)
            .slice(0, 10);
        }
      } catch (e) {
        // If JSON parsing fails, return empty
      }
    }
  } catch (e) {
    log("Search suggestions error: " + e);
  }

  return [];
};

source.getSearchCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.search = function (query, type, order, filters) {
  const results = searchContent(query);
  return new ContentPager(results, false);
};

source.getSearchChannelContentsCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.searchChannelContents = function (
  channelUrl,
  query,
  type,
  order,
  filters
) {
  throw new ScriptException("Channel content search not supported");
};

source.searchChannels = function (query) {
  return new ChannelPager([], false, {});
};

source.isChannelUrl = function (url) {
  const pattern = new RegExp(`/${CONTENT_TYPE}/stream/[^/]+/?$`);
  return pattern.test(url);
};

source.getChannel = function (url) {
  const titlePath = extractTitleFromUrl(url);
  const seriesInfo = getSeriesInfo(titlePath);

  return new PlatformChannel({
    id: new PlatformID(PLATFORM, titlePath, config.id),
    name: seriesInfo.title,
    thumbnail: seriesInfo.thumbnail,
    banner: seriesInfo.banner,
    subscribers: 0,
    description: seriesInfo.description || "",
    url: url,
  });
};

source.getChannelContents = function (url, type, order, filters) {
  const titlePath = extractTitleFromUrl(url);
  const episodes = getAllEpisodes(titlePath);
  return new ContentPager(episodes, false);
};

source.getChannelCapabilities = function () {
  return {
    types: [Type.Feed.Videos],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.isContentDetailsUrl = function (url) {
  const pattern = new RegExp(
    `/${CONTENT_TYPE}/stream/.+/staffel-\\d+/episode-\\d+`
  );
  return pattern.test(url);
};

source.getContentDetails = function (url) {
  const match = url.match(
    new RegExp(`/${CONTENT_TYPE}/stream/(.+)/staffel-(\\d+)/episode-(\\d+)`)
  );
  if (!match) throw new ScriptException("Invalid episode URL");

  const [, titlePath, season, episode] = match;

  const seriesInfo = getSeriesInfo(titlePath);
  const episodeInfo = getEpisodeInfo(titlePath, season, episode);

  return new PlatformVideoDetails({
    id: new PlatformID(
      PLATFORM,
      `${titlePath}-s${season}e${episode}`,
      config.id
    ),
    name: seriesInfo.title,
    thumbnails: new Thumbnails(
      seriesInfo.thumbnail ? [new Thumbnail(seriesInfo.thumbnail, 0)] : []
    ),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, titlePath, config.id),
      seriesInfo.title,
      `${BASE_URL}/${CONTENT_TYPE}/stream/${titlePath}`,
      seriesInfo.thumbnail
    ),
    uploadDate: 0,
    duration: episodeInfo.duration || 0,
    viewCount: 0,
    url: url,
    isLive: false,
    description: seriesInfo.description || "",
    video: new VideoSourceDescriptor([]),
    live: null,
    rating: null,
    subtitles: [],
  });
};

source.getComments = function (url) {
  return new CommentPager([], false, {});
};

source.getSubComments = function (comment) {
  return new CommentPager([], false, {});
};

//================ HELPER FUNCTIONS ================//

function fetchHTML(path) {
  const resp = http.GET(BASE_URL + path, {}, false);
  if (!resp.isOk) {
    throw new ScriptException(`HTTP request failed: ${resp.code}`);
  }

  // Parse HTML using GrayJay's global domParser
  const dom = domParser.parseFromString(resp.body, "text/html");
  return dom;
}

function normalizeUrl(url) {
  // Convert any URL format to a full absolute URL
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return BASE_URL + url;
  }
  return BASE_URL + "/" + url;
}

function extractTitleFromUrl(url) {
  const pattern = new RegExp(`/${CONTENT_TYPE}/stream/([^/\\?]+)`);
  const match = url.match(pattern);
  return match ? match[1] : "";
}

function extractTitleFromPath(path) {
  // Convert path like "one-punch-man" to "One Punch Man"
  return path
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toRelativePath(text) {
  text = text.toLowerCase();
  const replacements = [":", ",", "(", ")", "~", "!", "?", "&", "'", '"', " "];
  let relative = text;
  for (const char of replacements) {
    relative = relative.split(char).join("");
  }
  return relative.split(" ").join("-");
}

function mapLanguage(lang) {
  if (!lang) return "Unknown";
  lang = lang.toLowerCase().trim();
  switch (lang) {
    case "german":
    case "deutsch":
    case "ger":
    case "deu":
      return "German";
    case "gerdu" | "subbed":
    case "deutschsub":
    case "germansub":
      return "GermanSub";
    case "english":
    case "eng":
      return "English";
    case "englishsub":
      return "EnglishSub";
    case "japanese":
    case "japanisch":
      return "Japanese";
    case "japanesesub":
      return "JapaneseSub";
    default:
      return "Unknown";
  }
}

function searchContent(query) {
  try {
    const dom = fetchHTML("/search?q=" + encodeURIComponent(query));
    const results = [];

    const links = dom.querySelectorAll("li > a, .searchResults a");
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      let href = a.getAttribute("href");
      const em = a.querySelector("em");
      const title = em ? em.textContent.trim() : a.textContent.trim();

      if (href && title && href.includes("/stream/")) {
        // Normalize URL: ensure we have a relative path first
        let relativePath = href;
        if (href.startsWith("http")) {
          relativePath = href.replace(/^https?:\/\/[^\/]+/, "");
        }

        const fullUrl = BASE_URL + relativePath;

        // Get thumbnail
        let thumbnail = "";
        const img = a.querySelector("img");
        if (img) {
          const src = img.getAttribute("data-src") || img.getAttribute("src");
          if (src) {
            thumbnail = src.startsWith("http") ? src : BASE_URL + src;
          }
        }

        results.push(
          new PlatformVideo({
            id: new PlatformID(PLATFORM, relativePath, config.id),
            name: title,
            thumbnails: new Thumbnails(
              thumbnail ? [new Thumbnail(thumbnail, 0)] : []
            ),
            author: new PlatformAuthorLink(
              new PlatformID(PLATFORM, relativePath, config.id),
              title,
              fullUrl,
              thumbnail
            ),
            uploadDate: 0,
            duration: 0,
            viewCount: 0,
            url: fullUrl,
            isLive: false,
          })
        );
      }
    }

    return results;
  } catch (e) {
    log("Error in searchContent: " + e);
    return [];
  }
}

function getSeriesInfo(titlePath) {
  try {
    const dom = fetchHTML(`/${CONTENT_TYPE}/stream/${titlePath}`);
    const coverElement = dom.querySelector(".seriesCoverBox");
    const descElement = dom.querySelector(".seriesdescription");

    const title = extractTitleFromPath(titlePath);
    let thumbnail = "";
    let banner = "";

    if (coverElement) {
      const img = coverElement.querySelector("img");
      if (img) {
        const src = img.getAttribute("data-src") || img.getAttribute("src");
        if (src) {
          thumbnail = src.startsWith("http") ? src : BASE_URL + src;
          banner = thumbnail;
        }
      }
    }

    const description = descElement ? descElement.textContent.trim() : "";

    return {
      title,
      thumbnail,
      banner,
      description,
    };
  } catch (e) {
    log("Error in getSeriesInfo: " + e);
    return {
      title: extractTitleFromPath(titlePath),
      thumbnail: "",
      banner: "",
      description: "",
    };
  }
}

function getAllEpisodes(titlePath) {
  const allEpisodes = [];

  // Try to fetch multiple seasons (up to 10)
  for (let season = 1; season <= 10; season++) {
    try {
      const episodes = getEpisodesFromSeason(titlePath, season);
      if (episodes.length > 0) {
        allEpisodes.push.apply(allEpisodes, episodes);
      } else {
        break; // No more seasons
      }
    } catch (e) {
      break; // Season doesn't exist
    }
  }

  return allEpisodes;
}

function getEpisodesFromSeason(titlePath, season) {
  try {
    const dom = fetchHTML(
      `/${CONTENT_TYPE}/stream/${titlePath}/staffel-${season}`
    );

    const episodes = [];
    const rows = dom.querySelectorAll(
      "table.seasonEpisodesList tbody tr, .episodes-list tr"
    );

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const numElement = tr.querySelector("td a, .episode-number");
      const titleElement = tr.querySelector(
        "td:nth-child(2) strong, .episode-title"
      );

      if (numElement) {
        // Extract episode number from text like "1", "Episode 1", "1.", etc.
        const numText = numElement.textContent.trim();
        const numMatch = numText.match(/\d+/);
        const episodeNum = numMatch ? parseInt(numMatch[0]) : i + 1;
        const episodeTitle = titleElement
          ? titleElement.textContent.trim()
          : "";

        episodes.push(
          new PlatformVideo({
            id: new PlatformID(
              PLATFORM,
              `${titlePath}-s${season}e${episodeNum}`,
              config.id
            ),
            name: episodeTitle
              ? `S${season}E${episodeNum}: ${episodeTitle}`
              : `S${season}E${episodeNum}`,
            thumbnails: new Thumbnails([]),
            author: new PlatformAuthorLink(
              new PlatformID(PLATFORM, titlePath, config.id),
              extractTitleFromPath(titlePath),
              `${BASE_URL}/${CONTENT_TYPE}/stream/${titlePath}`,
              ""
            ),
            uploadDate: 0,
            duration: 0,
            viewCount: 0,
            url: `${BASE_URL}/${CONTENT_TYPE}/stream/${titlePath}/staffel-${season}/episode-${episodeNum}`,
            isLive: false,
          })
        );
      }
    }

    return episodes;
  } catch (e) {
    log(`Error getting episodes for season ${season}: ` + e);
    return [];
  }
}

function getEpisodeInfo(titlePath, season, episode) {
  try {
    const dom = fetchHTML(
      `/${CONTENT_TYPE}/stream/${titlePath}/staffel-${season}/episode-${episode}`
    );

    return {
      duration: 0,
    };
  } catch (e) {
    log("Error in getEpisodeInfo: " + e);
    return {
      duration: 0,
    };
  }
}

log("S.to-like Framework Plugin Loaded");
