(function (root, factory) {
    const utils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = utils;
    }
    root.IdeaCanvasSupabase = utils;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    function resolveSupabaseConfig(config) {
        const url = typeof config?.SUPABASE_URL === 'string' ? config.SUPABASE_URL.trim() : '';
        const key = typeof config?.SUPABASE_KEY === 'string' ? config.SUPABASE_KEY.trim() : '';

        const isPlaceholderUrl = !url || url.includes('YOUR_SUPABASE_URL');
        const isPlaceholderKey = !key || key.includes('YOUR_SUPABASE_ANON_KEY');

        if (isPlaceholderUrl || isPlaceholderKey) {
            return { url: '', key: '', isConfigured: false };
        }

        return { url, key, isConfigured: true };
    }

    function createSupabaseClient(config, supabaseGlobal) {
        const resolved = resolveSupabaseConfig(config);
        if (!resolved.isConfigured || !supabaseGlobal?.createClient) {
            return {
                client: null,
                ...resolved,
            };
        }

        return {
            client: supabaseGlobal.createClient(resolved.url, resolved.key),
            ...resolved,
        };
    }

    return {
        resolveSupabaseConfig,
        createSupabaseClient,
    };
});
