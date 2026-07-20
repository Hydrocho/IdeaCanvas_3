(function () {
    const supabaseUtils = globalThis.IdeaCanvasSupabase;
    const sectionUtils = globalThis.SectionUtils;
    const sectionsApi = globalThis.IdeaCanvasSections;
    const boardSettingsUtils = globalThis.BoardSettingsUtils;
    const boardSettingsApi = globalThis.IdeaCanvasBoardSettings;

    let supabaseClient = null;
    let currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
    let currentSections = sectionUtils.normalizeSections([]);

    const elements = {
        badge: document.getElementById('admin-connection-badge'),
        detail: document.getElementById('admin-connection-detail'),
        form: document.getElementById('admin-board-settings-form'),
        title: document.getElementById('admin-board-title'),
        authWrite: document.getElementById('admin-auth-write'),
        saveButton: document.getElementById('admin-save-btn'),
        saveStatus: document.getElementById('admin-save-status'),
        sectionsList: document.getElementById('admin-sections-list'),
        addSectionButton: document.getElementById('admin-add-section-btn'),
        sectionStatus: document.getElementById('admin-section-status'),
    };

    function setConnectionState(connected, message) {
        if (elements.badge) {
            elements.badge.textContent = connected ? '연결됨' : '연결 안 됨';
            elements.badge.className = connected
                ? 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800'
                : 'px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700';
        }
        if (elements.detail) elements.detail.textContent = message;
        if (elements.saveButton) elements.saveButton.disabled = !connected;
        if (elements.addSectionButton) elements.addSectionButton.disabled = !connected;
    }

    function setSectionStatus(message) {
        if (elements.sectionStatus) elements.sectionStatus.textContent = message || '';
    }

    function renderSettings() {
        if (elements.title) elements.title.value = currentBoardSettings.title;
        if (elements.authWrite) elements.authWrite.checked = currentBoardSettings.write_enabled;
    }

    function renderSections() {
        if (!elements.sectionsList) return;

        if (!currentSections.length) {
            elements.sectionsList.innerHTML = '<p class="text-sm text-on-surface-variant">등록된 섹션이 없습니다.</p>';
            return;
        }

        elements.sectionsList.innerHTML = '';
        currentSections.forEach((section) => {
            const row = document.createElement('div');
            row.className = 'flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl bg-surface-container-low p-3';
            row.innerHTML = `
                <input data-section-id="${escapeHtml(section.id)}" class="admin-section-name flex-1 rounded-lg border border-outline-variant/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" value="${escapeHtml(section.name)}"/>
                <div class="flex items-center gap-2">
                    <button type="button" data-action="save-section" data-section-id="${escapeHtml(section.id)}" class="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-50">저장</button>
                    <button type="button" data-action="delete-section" data-section-id="${escapeHtml(section.id)}" class="px-3 py-2 rounded-lg border border-outline-variant/70 text-xs font-bold text-error hover:bg-red-50 disabled:opacity-50">삭제</button>
                </div>
            `;
            elements.sectionsList.appendChild(row);
        });
    }

    async function loadSettings() {
        if (!supabaseClient) {
            currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
            renderSettings();
            setConnectionState(false, 'supabase_config.js의 Supabase URL/key를 설정하면 관리 값을 서버에 저장할 수 있습니다.');
            return;
        }

        const serverSettings = await boardSettingsApi.loadBoardSettingsFromServer(
            supabaseClient,
            currentBoardSettings.id
        );

        currentBoardSettings = serverSettings
            ? serverSettings
            : await boardSettingsApi.saveBoardSettingsToServer(
                supabaseClient,
                currentBoardSettings,
                currentBoardSettings
            );

        renderSettings();
        setConnectionState(true, 'Supabase에 연결되었습니다. 관리 값은 서버에 저장됩니다.');
    }

    async function loadSections() {
        if (!supabaseClient) {
            currentSections = [];
            renderSections();
            setSectionStatus('Supabase 연결 후 섹션을 관리할 수 있습니다.');
            return;
        }

        const serverSections = await sectionsApi.loadSectionsFromServer(supabaseClient);
        if (serverSections.length > 0) {
            currentSections = sectionUtils.normalizeSections(serverSections);
            if (sectionUtils.isLegacyDefaultSections(serverSections)) {
                await sectionsApi.migrateLegacyDefaultSectionsInServer(
                    supabaseClient,
                    serverSections,
                    currentSections[0].name
                );
            }
        } else {
            currentSections = [
                await sectionsApi.createDefaultSectionInServer(
                    supabaseClient,
                    { id: 'sec-1', name: sectionUtils.DEFAULT_SECTION_NAME, sort_order: 1 }
                )
            ];
        }

        renderSections();
        setSectionStatus('');
    }

    async function saveSettings(event) {
        event.preventDefault();
        if (!supabaseClient) return;

        const nextSettings = {
            title: elements.title.value,
            write_enabled: elements.authWrite.checked,
        };

        if (elements.saveButton) elements.saveButton.disabled = true;
        if (elements.saveStatus) elements.saveStatus.textContent = '저장 중...';

        try {
            const savedSettings = await boardSettingsApi.saveBoardSettingsToServer(
                supabaseClient,
                currentBoardSettings,
                nextSettings
            );
            currentBoardSettings = { ...savedSettings, title: nextSettings.title };
            renderSettings();
            if (elements.saveStatus) elements.saveStatus.textContent = '저장됨';
        } catch (error) {
            console.error('Save board settings failed:', error);
            if (elements.saveStatus) elements.saveStatus.textContent = '저장 실패';
        } finally {
            if (elements.saveButton) elements.saveButton.disabled = !supabaseClient;
        }
    }

    async function addSection() {
        if (!supabaseClient) return;

        const name = sectionUtils.getNextSectionName(currentSections);
        const sortOrder = currentSections.length > 0
            ? Math.max(...currentSections.map(section => section.sort_order || 0)) + 1
            : 1;

        setSectionStatus('섹션 추가 중...');
        try {
            const inserted = await sectionsApi.addSectionToServer(supabaseClient, name, sortOrder);
            currentSections.push(inserted);
            currentSections.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            renderSections();
            setSectionStatus('섹션이 추가되었습니다.');
        } catch (error) {
            console.error('Add section failed:', error);
            setSectionStatus('섹션 추가에 실패했습니다.');
        }
    }

    async function saveSectionName(sectionId) {
        if (!supabaseClient) return;

        const section = currentSections.find(item => item.id === sectionId);
        const input = elements.sectionsList.querySelector(`input[data-section-id="${cssEscape(sectionId)}"]`);
        const newName = input ? input.value.trim() : '';
        if (!section || !newName || newName === section.name) return;

        setSectionStatus('섹션 저장 중...');
        try {
            await sectionsApi.renameSectionInServer(supabaseClient, sectionId, newName, section.name);
            section.name = newName;
            renderSections();
            setSectionStatus('섹션 이름이 저장되었습니다.');
        } catch (error) {
            console.error('Rename section failed:', error);
            renderSections();
            setSectionStatus('섹션 이름 저장에 실패했습니다.');
        }
    }

    async function deleteSection(sectionId) {
        if (!supabaseClient) return;

        const section = currentSections.find(item => item.id === sectionId);
        if (!section) return;
        if (!confirm(`'${section.name}' 섹션을 삭제할까요? 메모는 첫 번째 섹션으로 이동합니다.`)) return;

        const remainingSections = currentSections.filter(item => item.id !== sectionId);
        const nextSectionName = sectionUtils.getDefaultSectionName(remainingSections);

        setSectionStatus('섹션 삭제 중...');
        try {
            await sectionsApi.deleteSectionInServer(supabaseClient, section, nextSectionName);
            currentSections = remainingSections.length
                ? remainingSections
                : [await sectionsApi.createDefaultSectionInServer(
                    supabaseClient,
                    { id: 'sec-1', name: sectionUtils.DEFAULT_SECTION_NAME, sort_order: 1 }
                )];
            renderSections();
            setSectionStatus('섹션이 삭제되었습니다.');
        } catch (error) {
            console.error('Delete section failed:', error);
            setSectionStatus('섹션 삭제에 실패했습니다.');
        }
    }

    function handleSectionListClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const sectionId = button.getAttribute('data-section-id');
        if (button.getAttribute('data-action') === 'save-section') {
            saveSectionName(sectionId);
        } else if (button.getAttribute('data-action') === 'delete-section') {
            deleteSection(sectionId);
        }
    }

    function init() {
        const connection = supabaseUtils.createSupabaseClient(
            typeof CONFIG !== 'undefined' ? CONFIG : null,
            typeof supabase !== 'undefined' ? supabase : null
        );

        supabaseClient = connection.client;
        if (elements.form) elements.form.addEventListener('submit', saveSettings);
        if (elements.addSectionButton) elements.addSectionButton.addEventListener('click', addSection);
        if (elements.sectionsList) elements.sectionsList.addEventListener('click', handleSectionListClick);

        Promise.all([loadSettings(), loadSections()]).catch((error) => {
            console.error('Load admin data failed:', error);
            currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
            currentSections = [];
            renderSettings();
            renderSections();
            setConnectionState(false, '관리 데이터를 불러오지 못했습니다. Supabase 스키마와 연결 설정을 확인해 주세요.');
        });
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function cssEscape(value) {
        if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
            return globalThis.CSS.escape(value);
        }
        return String(value).replace(/"/g, '\\"');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
