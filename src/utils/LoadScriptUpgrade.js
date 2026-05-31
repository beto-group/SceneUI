/**
 * Universal Script & Module Loader with ESM Support
 * ================================================
 * Loads scripts (classic or ESM modules) from URLs or local vault paths with caching.
 * 
 * Features:
 * - Classic script loading via <script> tags
 * - ESM module loading via dynamic import()
 * - URL caching in vault for offline access
 * - Local vault path support
 * - Global deduplication (prevents duplicate loads)
 * - Idempotent with global checks
 * 
 * Usage:
 * ```js
 * // Classic script with global check
 * await loadScript(dc, 'https://unpkg.com/globe.gl', { globalName: 'Globe' });
 * 
 * // ESM module from CDN
 * const { compile } = await loadScript(dc, 'https://esm.sh/svelte@5/compiler?bundle', { 
 *   type: 'module',
 *   globalName: 'SvelteCompiler'
 * });
 * 
 * // Local vault script
 * await loadScript(dc, 'scripts/mylib.js');
 * ```
 */

/**
 * Loads a script or ESM module with caching and global deduplication.
 * 
 * @param {object} dc - The Datacore context object (required for vault access).
 * @param {string} src - The URL or local vault path of the script/module.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.type='script'] - Load type: 'script' (classic) or 'module' (ESM).
 * @param {string} [options.globalName] - Global variable name to check/store (for deduplication).
 * @param {boolean} [options.cache=true] - Whether to cache URL resources in the vault.
 * @param {Function} [options.onload] - Callback when script loads successfully.
 * @param {Function} [options.onerror] - Callback on error.
 * @returns {Promise<any>} Promise resolving with the module exports (for ESM) or script element (for classic).
 */
async function loadScript(dc, src, options = {}) {
  const {
    type = 'script',
    globalName = null,
    cache = true,
    cacheDir = null, // Custom cache directory
    onload = null,
    onerror = null
  } = options;

  // Validate dc context
  if (!dc || !dc.app || !dc.app.vault || !dc.app.vault.adapter) {
    const error = new Error("Datacore context 'dc' with vault adapter is required for loadScript.");
    if (onerror) onerror(error);
    throw error;
  }

  const adapter = dc.app.vault.adapter;
  // Resolve custom cacheDir or default to SCENE UI local path
  const resolvedCacheDir = cacheDir ? dc.resolvePath(cacheDir) : dc.resolvePath("SCENE UI/data/cache/scripts");
  const isUrl = /^https?:\/\//.test(src);

  // --- GLOBAL DEDUPLICATION CHECK ---
  if (globalName && window[globalName]) {
    console.log(`[LoadScript] ✓ ${globalName} already available (skipping load)`);
    return type === 'module' ? window[globalName] : Promise.resolve();
  }

  // --- GLOBAL PROMISE TRACKING (prevent duplicate concurrent loads) ---
  window.__scriptPromises = window.__scriptPromises || {};
  const promiseKey = `${type}:${src}`;
  
  if (window.__scriptPromises[promiseKey]) {
    console.log(`[LoadScript] ⏳ ${src} already loading, reusing promise...`);
    return window.__scriptPromises[promiseKey];
  }

  console.log(`[LoadScript] 📥 Loading ${type} from ${isUrl ? 'URL' : 'local'}: ${src}`);

  // --- MAIN LOADING LOGIC ---
  const loadPromise = (async () => {
    try {
      let scriptContent = null;

      // Step 1: Fetch or read script content
      if (isUrl) {
        const safeFilename = src
          .replace(/^https?:\/\//, '')
          .replace(/[\/\\?%*:|"<>]/g, '_') + '.js';
        const cachePath = `${resolvedCacheDir}/${safeFilename}`;

        // Check cache first
        if (cache && await adapter.exists(cachePath)) {
          console.log(`[LoadScript] 📦 Loading from cache: ${cachePath}`);
          try {
            scriptContent = await adapter.read(cachePath);
          } catch (readError) {
            console.warn(`[LoadScript] ⚠️ Cache read failed, refetching:`, readError);
          }
        }

        // If not in custom cache but exists in the default cache folder, copy it over
        if (scriptContent === null && cacheDir) {
          const defaultCacheDir = dc.resolvePath("LOAD SCRIPT/data/cache/scripts");
          const defaultCachePath = `${defaultCacheDir}/${safeFilename}`;
          if (await adapter.exists(defaultCachePath)) {
            console.log(`[LoadScript] 🚚 Copying CDN file from default cache to custom location: ${cachePath}`);
            try {
              scriptContent = await adapter.read(defaultCachePath);
              if (!(await adapter.exists(resolvedCacheDir))) {
                await adapter.mkdir(resolvedCacheDir);
              }
              await adapter.write(cachePath, scriptContent);
            } catch (copyError) {
              console.warn(`[LoadScript] ⚠️ Copying default cache failed:`, copyError);
            }
          }
        }

        // Fetch from network if not cached
        if (scriptContent === null) {
          console.log(`[LoadScript] 🌐 Fetching from network: ${src}`);
          const response = await fetch(src);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          scriptContent = await response.text();

          // Write to cache
          if (cache) {
            try {
              if (!(await adapter.exists(resolvedCacheDir))) {
                await adapter.mkdir(resolvedCacheDir);
              }
              console.log(`[LoadScript] 💾 Caching to: ${cachePath}`);
              await adapter.write(cachePath, scriptContent);
            } catch (writeError) {
              console.warn(`[LoadScript] ⚠️ Cache write failed:`, writeError);
            }
          }
        }
      } else {
        // Local vault path
        console.log(`[LoadScript] 📁 Reading from vault: ${src}`);
        if (!(await adapter.exists(src))) {
          throw new Error(`Local file not found: ${src}`);
        }
        scriptContent = await adapter.read(src);
      }

      // Step 2: Execute based on type
      let result;

      if (type === 'module') {
        // ESM MODULE LOADING
        console.log(`[LoadScript] 🎭 Loading as ESM module...`);
        
        try {
          let moduleExports;
          
          // If we have cached scriptContent, load it via Blob URL for offline-first execution
          if (scriptContent) {
            console.log(`[LoadScript] 📦 Importing from blob URL...`);
            const blob = new Blob([scriptContent], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            
            try {
              moduleExports = await import(blobUrl);
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
          } else if (isUrl) {
            // Fallback to direct import if scriptContent fetch failed
            console.log(`[LoadScript] 📦 Importing from URL directly: ${src}`);
            moduleExports = await import(src);
          } else {
            throw new Error("No script content available to construct module blob");
          }
          
          console.log(`[LoadScript] ✅ Module loaded successfully`);
          console.log(`[LoadScript] 📊 Exports:`, Object.keys(moduleExports));
          
          // Store in global if requested
          if (globalName) {
            window[globalName] = moduleExports;
            console.log(`[LoadScript] 🌍 Stored as window.${globalName}`);
          }
          
          result = moduleExports;
          
        } catch (importError) {
          throw new Error(`Module import failed: ${importError.message}`);
        }
        
      } else {
        // CLASSIC SCRIPT LOADING
        console.log(`[LoadScript] 📜 Loading as classic script...`);
        
        const scriptElement = document.createElement('script');
        
        // For inline scripts (textContent), onload doesn't fire
        // We need to execute synchronously and resolve immediately
        try {
          scriptElement.textContent = scriptContent;
          
          // Append to DOM to execute
          document.body.appendChild(scriptElement);
          
          // Script executes synchronously, so check immediately
          console.log(`[LoadScript] ✅ Script executed successfully`);
          
          // Check for global if specified
          if (globalName) {
            if (window[globalName]) {
              console.log(`[LoadScript] 🌍 window.${globalName} available`);
            } else {
              console.warn(`[LoadScript] ⚠️ Global "${globalName}" not found after load`);
            }
          }
          
          result = scriptElement;
          
        } catch (execError) {
          console.error(`[LoadScript] ❌ Script execution failed:`, execError);
          if (scriptElement.parentNode) {
            scriptElement.parentNode.removeChild(scriptElement);
          }
          throw new Error(`Script execution failed: ${execError.message}`);
        }
      }

      // Success callback
      if (onload) {
        onload(result);
      }

      console.log(`[LoadScript] 🎉 Load complete: ${src}`);
      return result;

    } catch (error) {
      console.error(`[LoadScript] 💥 Failed to load ${src}:`, error);
      
      if (onerror) {
        onerror(error);
      }
      
      throw error;
      
    } finally {
      // Clean up promise tracker
      delete window.__scriptPromises[promiseKey];
    }
  })();

  // Store promise for deduplication
  window.__scriptPromises[promiseKey] = loadPromise;
  
  return loadPromise;
}

/**
 * Helper: Load multiple scripts/modules in sequence or parallel.
 * 
 * @param {object} dc - Datacore context.
 * @param {Array<{src: string, options?: object}>} scripts - Array of script configs.
 * @param {boolean} [parallel=false] - Load in parallel (true) or sequence (false).
 * @returns {Promise<Array>} Array of results.
 */
async function loadMultiple(dc, scripts, parallel = false) {
  if (parallel) {
    return Promise.all(scripts.map(({ src, options }) => loadScript(dc, src, options)));
  } else {
    const results = [];
    for (const { src, options } of scripts) {
      results.push(await loadScript(dc, src, options));
    }
    return results;
  }
}

/**
 * Fetches an image from a URL and caches it in the vault for offline access.
 * On subsequent loads, it reads the image directly from the cache.
 *
 * @param {object} dc - The Datacore context object.
 * @param {string} url - The URL of the image to fetch.
 * @returns {Promise<string>} A promise that resolves with a local blob URL for the image.
 */
async function fetchAndCacheImage(dc, url) {
  const cacheDir = dc.resolvePath("LOAD SCRIPT/data/cache/images");
  const adapter = dc.app.vault.adapter;

  const safeFilename = url.replace(/^https?:\/\//, '').replace(/[\/\\?%*:|"<>]/g, '_');
  const cachePath = `${cacheDir}/${safeFilename}`;

  // Check cache
  if (await adapter.exists(cachePath)) {
    console.log(`[ImageCache] Loading from cache: ${cachePath}`);
    try {
      const binaryData = await adapter.readBinary(cachePath);
      const blob = new Blob([binaryData]);
      return URL.createObjectURL(blob);
    } catch (readError) {
      console.warn(`[ImageCache] Cache read failed, re-fetching:`, readError);
    }
  }

  // Fetch from network
  console.log(`[ImageCache] Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const blob = await response.blob();

  // Write to cache
  try {
    const buffer = await blob.arrayBuffer();
    if (!(await adapter.exists(cacheDir))) {
      await adapter.mkdir(cacheDir);
    }
    console.log(`[ImageCache] Caching to: ${cachePath}`);
    await adapter.writeBinary(cachePath, buffer);
  } catch (writeError) {
    console.warn(`[ImageCache] Cache write failed:`, writeError);
  }

  return URL.createObjectURL(blob);
}

return { loadScript, loadMultiple, fetchAndCacheImage };