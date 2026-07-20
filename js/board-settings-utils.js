(function (root, factory) {
    const utils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = utils;
    }
    root.BoardSettingsUtils = utils;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    const DEFAULT_BOARD_SETTINGS = {
        id: 'default',
        title: '새로운 생각',
        write_enabled: true,
        comments_enabled: true,
        likes_enabled: true,
        bg_color: 'default',
        sections_enabled: false,
        note_sort: 'newest',
        note_layout: 'masonry',
    };

    function resolveWriteEnabled(settings) {
        if (settings.write_enabled === true || settings.write_enabled === false) {
            return settings.write_enabled;
        }
        if (settings.auth_write === true || settings.auth_write === false) {
            return !settings.auth_write;
        }
        return DEFAULT_BOARD_SETTINGS.write_enabled;
    }

    function resolveCommentsEnabled(settings) {
        if (settings.comments_enabled === true || settings.comments_enabled === false) {
            return settings.comments_enabled;
        }
        return DEFAULT_BOARD_SETTINGS.comments_enabled;
    }

    function resolveLikesEnabled(settings) {
        if (settings.likes_enabled === true || settings.likes_enabled === false) {
            return settings.likes_enabled;
        }
        return DEFAULT_BOARD_SETTINGS.likes_enabled;
    }

    function resolveBgColor(settings) {
        if (typeof settings.bg_color === 'string' && settings.bg_color.trim()) {
            return settings.bg_color.trim();
        }
        return DEFAULT_BOARD_SETTINGS.bg_color;
    }

    function resolveSectionsEnabled(settings) {
        if (settings.sections_enabled === true || settings.sections_enabled === false) {
            return settings.sections_enabled;
        }
        return DEFAULT_BOARD_SETTINGS.sections_enabled;
    }

    function normalizeBoardSettings(settings) {
        if (!settings || typeof settings !== 'object') {
            return { ...DEFAULT_BOARD_SETTINGS };
        }

        let jsonSettings = {};
        if (settings.settings_json) {
            if (typeof settings.settings_json === 'string') {
                try {
                    jsonSettings = JSON.parse(settings.settings_json);
                } catch (e) {
                    console.error("Failed to parse settings_json:", e);
                }
            } else if (typeof settings.settings_json === 'object') {
                jsonSettings = settings.settings_json;
            }
        }

        const merged = {
            ...settings,
            ...jsonSettings
        };

        const title = typeof merged.title === 'string' && merged.title.trim()
            ? merged.title.trim()
            : DEFAULT_BOARD_SETTINGS.title;

        const noteSort = ['newest', 'oldest', 'likes_desc', 'comments_desc'].includes(merged.note_sort) ? merged.note_sort : DEFAULT_BOARD_SETTINGS.note_sort;
        const noteLayout = merged.note_layout === 'grid' ? 'grid' : DEFAULT_BOARD_SETTINGS.note_layout;
        const settingsJson = {
            ...jsonSettings,
            write_enabled: resolveWriteEnabled(merged),
            comments_enabled: resolveCommentsEnabled(merged),
            likes_enabled: resolveLikesEnabled(merged),
            bg_color: resolveBgColor(merged),
            sections_enabled: resolveSectionsEnabled(merged),
            note_sort: noteSort,
            note_layout: noteLayout,
        };

        return {
            id: settings.id || DEFAULT_BOARD_SETTINGS.id,
            board_id: settings.board_id || '',
            title,
            write_enabled: settingsJson.write_enabled,
            comments_enabled: settingsJson.comments_enabled,
            likes_enabled: settingsJson.likes_enabled,
            bg_color: settingsJson.bg_color,
            sections_enabled: settingsJson.sections_enabled,
            note_sort: settingsJson.note_sort,
            note_layout: settingsJson.note_layout,
            settings_json: settingsJson
        };
    }

    return {
        DEFAULT_BOARD_SETTINGS,
        normalizeBoardSettings,
    };
});
