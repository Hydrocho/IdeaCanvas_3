(function (root, factory) {
    const moduleApi = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = moduleApi;
    }
    root.IdeaCanvasLikes = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    function buildLikeSummary(likes, currentUserSessionId) {
        const noteUserPairs = new Set();
        const likeCountMap = {};
        const userLikesMap = {};

        if (!Array.isArray(likes)) {
            return { likeCountMap, userLikesMap };
        }

        likes.forEach((like) => {
            if (!like || !like.note_id || !like.user_session_id) return;
            const pairKey = `${like.note_id}:${like.user_session_id}`;
            if (noteUserPairs.has(pairKey)) return;

            noteUserPairs.add(pairKey);
            likeCountMap[like.note_id] = (likeCountMap[like.note_id] || 0) + 1;
            if (like.user_session_id === currentUserSessionId) {
                userLikesMap[like.note_id] = true;
            }
        });

        return { likeCountMap, userLikesMap };
    }

    async function saveLikeToServer(client, noteId, userSessionId, userId = null) {
        if (!client) throw new Error('Supabase client is not available');
        const { error } = await client
            .from('likes')
            .upsert([{ note_id: noteId, user_session_id: userSessionId, user_id: userId || null }], {
                onConflict: 'note_id,user_session_id',
            });

        if (error) throw error;
    }

    return {
        buildLikeSummary,
        saveLikeToServer,
    };
});
