(function (root, factory) {
    const moduleApi = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = moduleApi;
    }
    root.IdeaCanvasNoteVisibilityUtils = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    function shouldRecoverNoteVisibility({ noteCount, visibleCardCount, searchQuery } = {}) {
        const loadedNotes = Number.isFinite(Number(noteCount)) ? Number(noteCount) : 0;
        const visibleCards = Number.isFinite(Number(visibleCardCount)) ? Number(visibleCardCount) : 0;
        const normalizedSearch = typeof searchQuery === 'string' ? searchQuery.trim() : '';
        return loadedNotes > 0 && visibleCards === 0 && normalizedSearch === '';
    }

    function getActiveNoteSurfaceId(sectionViewEnabled) {
        return sectionViewEnabled ? 'kanban-board' : 'notes-grid';
    }

    return {
        shouldRecoverNoteVisibility,
        getActiveNoteSurfaceId,
    };
});
