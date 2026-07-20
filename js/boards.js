(function (root, factory) {
    const moduleApi = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = moduleApi;
    }
    root.IdeaCanvasBoards = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    const DEFAULT_BOARD_TITLE = '새로운 생각';

    function getBoardIdFromUrl(url) {
        try {
            return new URL(url).searchParams.get('board_id') || '';
        } catch (error) {
            return '';
        }
    }

    function normalizeBoard(board) {
        if (!board || !board.id) return null;
        const title = typeof board.title === 'string' && board.title.trim()
            ? board.title.trim()
            : DEFAULT_BOARD_TITLE;
        return {
            id: board.id,
            title,
            description: typeof board.description === 'string' ? board.description : '',
            sort_order: Number.isFinite(board.sort_order) ? board.sort_order : 0,
            created_at: board.created_at || null,
        };
    }

    function normalizeBoards(boards) {
        return Array.isArray(boards)
            ? boards.map(normalizeBoard).filter(Boolean)
            : [];
    }

    function filterBoardsByQuery(boards, query) {
        const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
        if (!normalizedQuery) return boards;
        return normalizeBoards(boards).filter(board => board.title.toLowerCase().includes(normalizedQuery));
    }

    function selectRecentBoards(boards, notes, limit = 4) {
        const latestByBoardId = (Array.isArray(notes) ? notes : []).reduce((latest, note) => {
            if (!note?.board_id || !note.created_at) return latest;
            if (!latest[note.board_id] || Date.parse(note.created_at) > Date.parse(latest[note.board_id])) {
                latest[note.board_id] = note.created_at;
            }
            return latest;
        }, {});

        return normalizeBoards(boards)
            .filter(board => latestByBoardId[board.id])
            .map(board => ({ ...board, last_note_at: latestByBoardId[board.id] }))
            .sort((a, b) => Date.parse(b.last_note_at) - Date.parse(a.last_note_at))
            .slice(0, Math.max(0, limit));
    }

    function summarizeBoardActivity(board, notes) {
        const boardNotes = (Array.isArray(notes) ? notes : [])
            .filter(note => note?.board_id === board?.id && note.created_at);
        const lastNoteAt = boardNotes.reduce((latest, note) => (
            !latest || Date.parse(note.created_at) > Date.parse(latest) ? note.created_at : latest
        ), null);
        return {
            created_at: board?.created_at || null,
            last_note_at: lastNoteAt,
            note_count: boardNotes.length,
        };
    }

    async function loadBoardsFromServer(client) {
        if (!client) throw new Error('Supabase client is not available');
        const { data, error } = await client
            .from('boards')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return normalizeBoards(data);
    }

    async function loadBoardFromServer(client, boardId) {
        if (!client) throw new Error('Supabase client is not available');
        const { data, error } = await client
            .from('boards')
            .select('*')
            .eq('id', boardId)
            .maybeSingle();

        if (error) throw error;
        return normalizeBoard(data);
    }

    async function createBoardInServer(client, title = DEFAULT_BOARD_TITLE) {
        if (!client) throw new Error('Supabase client is not available');
        const normalizedTitle = title && title.trim() ? title.trim() : DEFAULT_BOARD_TITLE;
        const { data, error } = await client
            .from('boards')
            .insert([{ title: normalizedTitle }])
            .select();

        if (error) throw error;
        return normalizeBoard(data && data.length ? data[0] : null);
    }

    async function renameBoardInServer(client, boardId, title) {
        if (!client) throw new Error('Supabase client is not available');
        const normalizedTitle = title && title.trim() ? title.trim() : DEFAULT_BOARD_TITLE;
        const { error } = await client
            .from('boards')
            .update({ title: normalizedTitle })
            .eq('id', boardId);

        if (error) throw error;
    }

    async function deleteBoardInServer(client, boardId) {
        if (!client) throw new Error('Supabase client is not available');
        const { error } = await client
            .from('boards')
            .delete()
            .eq('id', boardId);

        if (error) throw error;
    }

    return {
        DEFAULT_BOARD_TITLE,
        getBoardIdFromUrl,
        normalizeBoard,
        normalizeBoards,
        filterBoardsByQuery,
        selectRecentBoards,
        summarizeBoardActivity,
        loadBoardFromServer,
        loadBoardsFromServer,
        createBoardInServer,
        renameBoardInServer,
        deleteBoardInServer,
    };
});
