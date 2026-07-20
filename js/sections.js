(function (root, factory) {
    const moduleApi = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = moduleApi;
    }
    root.IdeaCanvasSections = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    async function loadSectionsFromServer(client, boardId = '') {
        if (!client) throw new Error('Supabase client is not available');

        let query = client
            .from('sections')
            .select('*');

        if (boardId) query = query.eq('board_id', boardId);

        const { data, error } = await query.order('sort_order', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async function createDefaultSectionInServer(client, defaultSection, boardId = '') {
        const payload = { name: defaultSection.name, sort_order: defaultSection.sort_order };
        if (boardId) payload.board_id = boardId;

        const { data, error } = await client
            .from('sections')
            .insert([payload])
            .select();

        if (error) throw error;
        return data && data.length ? data[0] : { ...defaultSection };
    }

    async function addSectionToServer(client, name, sortOrder, boardId = '') {
        const payload = { name, sort_order: sortOrder };
        if (boardId) payload.board_id = boardId;

        const { data, error } = await client
            .from('sections')
            .insert([payload])
            .select();

        if (error) throw error;
        return data && data.length ? data[0] : { name, sort_order: sortOrder };
    }

    function scopeByBoard(query, boardId) {
        return boardId ? query.eq('board_id', boardId) : query;
    }

    async function renameSectionInServer(client, sectionId, newName, oldName, boardId = '') {
        const { error: sectionError } = await client
            .from('sections')
            .update({ name: newName })
            .eq('id', sectionId);

        if (sectionError) throw sectionError;

        const { error: notesError } = await scopeByBoard(client
            .from('notes')
            .update({ section: newName })
            .eq('section', oldName), boardId);

        if (notesError) throw notesError;
    }

    async function deleteSectionInServer(client, section, nextSectionName, boardId = '') {
        const { error: deleteError } = await client
            .from('sections')
            .delete()
            .eq('id', section.id);

        if (deleteError) throw deleteError;

        const { error: updateByNameError } = await scopeByBoard(client
            .from('notes')
            .update({ section: nextSectionName })
            .eq('section', section.name), boardId);

        if (updateByNameError) throw updateByNameError;

        if (section.id !== section.name) {
            const { error: updateByIdError } = await scopeByBoard(client
                .from('notes')
                .update({ section: nextSectionName })
                .eq('section', section.id), boardId);

            if (updateByIdError) throw updateByIdError;
        }
    }

    async function migrateLegacyDefaultSectionsInServer(client, legacySections, nextSectionName, boardId = '') {
        if (!client || !Array.isArray(legacySections) || legacySections.length === 0) return;

        const firstLegacySection = legacySections[0];
        const removableSections = legacySections.slice(1);

        const { error: updateSectionError } = await client
            .from('sections')
            .update({ name: nextSectionName, sort_order: 1 })
            .eq('id', firstLegacySection.id);

        if (updateSectionError) throw updateSectionError;

        for (const legacySection of legacySections) {
            const { error: updateNotesError } = await scopeByBoard(client
                .from('notes')
                .update({ section: nextSectionName })
                .eq('section', legacySection.name), boardId);

            if (updateNotesError) throw updateNotesError;
        }

        for (const section of removableSections) {
            const { error: deleteSectionError } = await client
                .from('sections')
                .delete()
                .eq('id', section.id);

            if (deleteSectionError) throw deleteSectionError;
        }
    }

    return {
        loadSectionsFromServer,
        createDefaultSectionInServer,
        addSectionToServer,
        renameSectionInServer,
        deleteSectionInServer,
        migrateLegacyDefaultSectionsInServer,
    };
});
