(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.IdeaCanvasAttachmentUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    const TYPES = ['image', 'link', 'youtube', 'draw'];

    function normalizeAttachmentType(value) {
        return TYPES.includes(value) ? value : null;
    }

    function canSelectAttachment(activeType, requestedType) {
        const active = normalizeAttachmentType(activeType);
        const requested = normalizeAttachmentType(requestedType);
        return Boolean(requested) && (!active || active === requested);
    }

    function isYoutubeUrl(value) {
        return /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i.test(String(value || ''));
    }

    function resolveDraftAttachmentType(activeType, requestedType, value) {
        const requested = normalizeAttachmentType(requestedType);
        if (!requested || !String(value || '').trim()) return activeType === requested ? null : normalizeAttachmentType(activeType);
        return canSelectAttachment(activeType, requested) ? requested : normalizeAttachmentType(activeType);
    }

    return { canSelectAttachment, normalizeAttachmentType, isYoutubeUrl, resolveDraftAttachmentType };
});
