(function () {
    const supabaseUtils = globalThis.IdeaCanvasSupabase;
    const boardsApi = globalThis.IdeaCanvasBoards;
    const boardSettingsApi = globalThis.IdeaCanvasBoardSettings;
    const boardSettingsUtils = globalThis.BoardSettingsUtils;
    const authUtils = globalThis.IdeaCanvasAuth;

    let supabaseClient = null;
    let boards = [];
    let boardNoteActivity = [];
    let boardSettingsByBoardId = {};
    let profiles = [];
    let searchQuery = '';
    let isConnected = false;
    let currentUser = null;
    let currentProfile = null;
    let authPanelMode = 'closed';

    const cardThemes = [
        {
            bg: 'bg-amber-50/50',
            border: 'border-amber-200/50',
            hoverBorder: 'hover:border-amber-400',
            badge: 'bg-amber-100 text-amber-800',
            accent: 'bg-amber-500',
            statsBg: 'bg-amber-50/80',
            iconText: 'text-amber-600',
        },
        {
            bg: 'bg-emerald-50/50',
            border: 'border-emerald-200/50',
            hoverBorder: 'hover:border-emerald-400',
            badge: 'bg-emerald-100 text-emerald-800',
            accent: 'bg-emerald-500',
            statsBg: 'bg-emerald-50/80',
            iconText: 'text-emerald-600',
        },
        {
            bg: 'bg-blue-50/50',
            border: 'border-blue-200/50',
            hoverBorder: 'hover:border-blue-400',
            badge: 'bg-blue-100 text-blue-800',
            accent: 'bg-blue-500',
            statsBg: 'bg-blue-50/80',
            iconText: 'text-blue-600',
        },
        {
            bg: 'bg-purple-50/50',
            border: 'border-purple-200/50',
            hoverBorder: 'hover:border-purple-400',
            badge: 'bg-purple-100 text-purple-800',
            accent: 'bg-purple-500',
            statsBg: 'bg-purple-50/80',
            iconText: 'text-purple-600',
        }
    ];

    const elements = {
        list: document.getElementById('boards-list'),
        recentList: document.getElementById('recent-boards-list'),
        recentSection: document.getElementById('recent-boards-section'),
        status: document.getElementById('boards-status'),
        publicShell: document.getElementById('public-shell'),
        publicHeader: document.getElementById('public-dashboard-header'),
        landingPreview: document.getElementById('landing-preview'),
        workspace: document.getElementById('dashboard-workspace'),
        sidebarUserSlot: document.getElementById('dashboard-sidebar-user-slot'),
        createButton: document.getElementById('create-board-btn'),
        searchInput: document.getElementById('board-search-input'),
        authActions: document.getElementById('dashboard-auth-actions'),
        authCard: document.getElementById('dashboard-auth-card'),
        openLoginButton: document.getElementById('dashboard-open-login-btn'),
        openSignupButton: document.getElementById('dashboard-open-signup-btn'),
        authLoggedOut: document.getElementById('dashboard-auth-logged-out'),
        authSignup: document.getElementById('dashboard-auth-signup'),
        authLoggedIn: document.getElementById('dashboard-auth-logged-in'),
        emailInput: document.getElementById('dashboard-auth-email'),
        passwordInput: document.getElementById('dashboard-auth-password'),
        nameInput: document.getElementById('dashboard-auth-name'),
        signupEmailInput: document.getElementById('dashboard-signup-email'),
        signupPasswordInput: document.getElementById('dashboard-signup-password'),
        signupPasswordConfirmInput: document.getElementById('dashboard-signup-password-confirm'),
        loginButton: document.getElementById('dashboard-login-btn'),
        signupButton: document.getElementById('dashboard-signup-btn'),
        closeAuthButton: document.getElementById('dashboard-close-auth-btn'),
        showSignupButton: document.getElementById('dashboard-show-signup-btn'),
        showLoginButton: document.getElementById('dashboard-show-login-btn'),
        resetPasswordButton: document.getElementById('dashboard-reset-password-btn'),
        logoutButton: document.getElementById('dashboard-logout-btn'),
        userDisplay: document.getElementById('dashboard-user-display'),
        boardsTabButton: document.getElementById('boards-tab-btn'),
        accountsTabButton: document.getElementById('accounts-tab-btn'),
        mobileTabButtons: Array.from(document.querySelectorAll('[data-mobile-tab]')),
        boardsPanel: document.getElementById('boards-panel'),
        accountsPanel: document.getElementById('accounts-panel'),
        pendingTeachersList: document.getElementById('pending-teachers-list'),
        approvedTeachersList: document.getElementById('approved-teachers-list'),
        rejectedTeachersList: document.getElementById('rejected-teachers-list'),
    };

    function setStatus(message) {
        if (elements.status) elements.status.textContent = message || '';
    }

    function setConnected(connected) {
        isConnected = connected;
        updateCreateButtonState();
    }

    function canUseDashboard() {
        return authUtils.canUseDashboard(currentProfile);
    }

    function updateCreateButtonState() {
        if (!elements.createButton) return;
        const canCreate = isConnected && authUtils.canCreateBoard(currentProfile);
        elements.createButton.disabled = !canCreate;
        elements.createButton.title = canCreate ? '' : '승인된 교사 또는 마스터만 새 보드를 만들 수 있습니다.';
    }

    function getRoleLabel() {
        if (!currentProfile) return '승인 대기';
        if (currentProfile.is_master) return currentProfile.is_primary_master ? '최초 마스터' : '마스터';
        if (currentProfile.role === 'teacher') return '교사';
        return currentProfile.role === 'teacher_rejected' ? '가입 거부' : '승인 대기';
    }

    function showAuthPanel(mode) {
        authPanelMode = authUtils.resolveAuthPanelMode(mode, currentUser);
        renderAuthState();
    }

    function renderEmptyState(message) {
        if (!elements.list) return;
        elements.list.innerHTML = `
            <div class="md:col-span-2 xl:col-span-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
                <span class="material-symbols-outlined text-4xl text-primary">dashboard_customize</span>
                <p class="mt-3 text-base font-bold text-on-surface">${escapeHtml(message)}</p>
            </div>
        `;
    }

    function formatLastNoteAt(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function formatBoardDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '정보 없음';
        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function renderRecentBoards() {
        if (!elements.recentList || !elements.recentSection) return;
        const recentBoards = boardsApi.selectRecentBoards(boards, boardNoteActivity, 4);
        elements.recentSection.classList.toggle('hidden', !canUseDashboard());

        if (!recentBoards.length) {
            elements.recentList.innerHTML = `
                <div class="sm:col-span-2 xl:col-span-4 rounded-xl border border-dashed border-outline-variant/70 bg-surface-container-lowest px-5 py-6 text-center">
                    <p class="text-sm font-bold text-on-surface">아직 메모가 등록된 보드가 없습니다.</p>
                    <p class="mt-1 text-xs text-on-surface-variant">보드에 첫 메모를 등록하면 여기에 표시됩니다.</p>
                </div>
            `;
            return;
        }

        elements.recentList.innerHTML = recentBoards.map((board, index) => {
            const settings = boardSettingsByBoardId[board.id] || boardSettingsUtils.normalizeBoardSettings({ board_id: board.id });
            const theme = cardThemes[index % 4];
            const writeLabel = settings.write_enabled ? '글쓰기 허용' : '글쓰기 중지';
            const writeClass = settings.write_enabled ? theme.badge : 'bg-surface-container-high text-on-surface-variant';
            const recentColor = `${theme.bg} ${theme.border} ${theme.hoverBorder}`;
            return `
                <article class="${recentColor} rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div class="flex items-start justify-between gap-3">
                        <h3 class="min-w-0 flex-1 truncate text-sm font-extrabold text-on-surface" title="${escapeHtml(board.title)}">${escapeHtml(board.title)}</h3>
                        <span class="${writeClass} shrink-0 rounded-full px-2 py-1 text-[10px] font-bold">${writeLabel}</span>
                    </div>
                    <p class="mt-3 text-xs text-on-surface-variant">마지막 메모 ${escapeHtml(formatLastNoteAt(board.last_note_at))}</p>
                    <a href="board.html?board_id=${encodeURIComponent(board.id)}" class="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-primary hover:opacity-75">
                        보드 열기 <span class="material-symbols-outlined text-base">arrow_forward</span>
                    </a>
                </article>
            `;
        }).join('');
    }

    function renderBoards() {
        if (!elements.list || !canUseDashboard()) return;

        renderRecentBoards();

        const visibleBoards = boardsApi.filterBoardsByQuery(boards, searchQuery);

        if (!visibleBoards.length) {
            renderEmptyState(boards.length ? '검색 결과가 없습니다.' : '아직 보드가 없습니다.');
            return;
        }

        elements.list.innerHTML = '';
        visibleBoards.forEach((board, index) => {
            const boardSettings = boardSettingsByBoardId[board.id] || boardSettingsUtils.normalizeBoardSettings({ board_id: board.id, title: board.title });
            const activity = boardsApi.summarizeBoardActivity(board, boardNoteActivity);
            const writeChecked = boardSettings.write_enabled ? 'checked' : '';
            const theme = cardThemes[index % 4];
            const card = document.createElement('article');
            card.className = 'group overflow-hidden rounded-lg bg-surface-container-lowest border border-outline-variant/60 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md';
            card.innerHTML = `
                <div class="h-1 ${theme.accent}"></div>
                <div class="p-5 flex h-full min-h-0 flex-col gap-5">
                    <div>
                        <h3 data-action="edit-board-title" data-board-id="${escapeHtml(board.id)}" class="board-title-text w-full cursor-text text-xl font-extrabold text-on-surface px-0 py-1" title="더블 클릭해서 이름 변경">${escapeHtml(board.title)}</h3>
                        <input data-board-id="${escapeHtml(board.id)}" class="board-title-input hidden w-full text-xl font-extrabold bg-transparent border-b border-primary focus:ring-0 outline-none px-0 py-1" value="${escapeHtml(board.title)}" aria-label="보드 이름"/>
                        <p class="text-xs text-on-surface-variant mt-2">보드 ID: ${escapeHtml(board.id)}</p>
                        <div class="mt-5 grid grid-cols-3 gap-2">
                            <div class="rounded-lg ${theme.statsBg} px-3 py-3">
                                <span class="material-symbols-outlined text-base ${theme.iconText}">calendar_add_on</span>
                                <p class="mt-1 text-[10px] font-bold text-on-surface-variant">최초 생성</p>
                                <p class="mt-0.5 text-xs font-extrabold text-on-surface">${escapeHtml(formatBoardDate(activity.created_at))}</p>
                            </div>
                            <div class="rounded-lg ${theme.statsBg} px-3 py-3">
                                <span class="material-symbols-outlined text-base ${theme.iconText}">edit_calendar</span>
                                <p class="mt-1 text-[10px] font-bold text-on-surface-variant">마지막 기록</p>
                                <p class="mt-0.5 text-xs font-extrabold text-on-surface">${activity.last_note_at ? escapeHtml(formatBoardDate(activity.last_note_at)) : '기록 없음'}</p>
                            </div>
                            <div class="rounded-lg ${theme.statsBg} px-3 py-3">
                                <span class="material-symbols-outlined text-base ${theme.iconText}">note_stack</span>
                                <p class="mt-1 text-[10px] font-bold text-on-surface-variant">전체 메모</p>
                                <p class="mt-0.5 text-xs font-extrabold text-on-surface">${activity.note_count.toLocaleString('ko-KR')}개</p>
                            </div>
                        </div>
                    </div>
                    <div class="mt-auto flex flex-wrap items-center gap-2">
                        <a href="board.html?board_id=${encodeURIComponent(board.id)}" class="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-dashboard-action text-white text-xs font-bold hover:opacity-90">
                            <span class="material-symbols-outlined text-base">open_in_new</span>
                            열기
                        </a>
                        <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant/70 text-xs font-bold hover:bg-surface-container-high cursor-pointer select-none">
                            <span>글쓰기 허용</span>
                            <span class="relative inline-flex items-center">
                                <input type="checkbox" data-action="toggle-write-enabled" data-board-id="${escapeHtml(board.id)}" class="sr-only peer" ${writeChecked}/>
                                <span class="block h-5 w-9 rounded-full bg-outline-variant transition peer-checked:bg-primary"></span>
                                <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4"></span>
                            </span>
                        </label>
                        <button type="button" data-action="delete-board" data-board-id="${escapeHtml(board.id)}" class="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-outline-variant/70 text-xs font-bold text-error hover:bg-red-50">
                            <span class="material-symbols-outlined text-base">delete</span>
                            삭제
                        </button>
                    </div>
                </div>
            `;
            elements.list.appendChild(card);
        });
    }

    function renderAuthState() {
        const displayName = authUtils.getDisplayName(currentProfile, currentUser);
        const dashboardAllowed = canUseDashboard();
        const panelMode = authUtils.resolveAuthPanelMode(authPanelMode, currentUser);
        authPanelMode = panelMode === 'logged_in' ? 'closed' : panelMode;

        elements.publicShell?.classList.toggle('hidden', dashboardAllowed);
        elements.publicHeader?.classList.toggle('hidden', dashboardAllowed);
        elements.landingPreview?.classList.toggle('hidden', dashboardAllowed);
        elements.workspace?.classList.toggle('hidden', !dashboardAllowed);
        elements.workspace?.classList.toggle('flex', dashboardAllowed);
        elements.authActions?.classList.toggle('hidden', panelMode === 'logged_in');
        elements.authLoggedIn?.classList.toggle('hidden', panelMode !== 'logged_in');
        elements.authLoggedIn?.classList.toggle('flex', panelMode === 'logged_in');
        elements.authCard?.classList.toggle('hidden', panelMode !== 'login' && panelMode !== 'signup');
        elements.authCard?.classList.toggle('grid', panelMode === 'login' || panelMode === 'signup');
        elements.authLoggedOut?.classList.toggle('hidden', panelMode !== 'login');
        elements.authSignup?.classList.toggle('hidden', panelMode !== 'signup');

        if (currentUser && elements.userDisplay) {
            elements.userDisplay.textContent = `${displayName || currentUser.email} (${getRoleLabel()})`;
        } else if (elements.userDisplay) {
            elements.userDisplay.textContent = '';
        }

        if (elements.authLoggedIn) {
            if (dashboardAllowed) {
                if (elements.sidebarUserSlot && elements.authLoggedIn.parentElement !== elements.sidebarUserSlot) {
                    elements.sidebarUserSlot.appendChild(elements.authLoggedIn);
                }
                elements.authLoggedIn.classList.add('w-full', 'flex-col', 'items-stretch');
                elements.authLoggedIn.classList.remove('items-center', 'gap-3');
                
                elements.userDisplay?.classList.add('max-w-full');
                elements.userDisplay?.classList.remove('max-w-56', 'truncate', 'text-sm', 'font-bold');
                
                elements.logoutButton?.classList.add('mt-2', 'w-full', 'bg-surface-container-lowest');
            } else {
                const headerContainer = elements.authActions?.parentElement;
                if (headerContainer && elements.authLoggedIn.parentElement !== headerContainer) {
                    headerContainer.appendChild(elements.authLoggedIn);
                }
                elements.authLoggedIn.classList.remove('w-full', 'flex-col', 'items-stretch');
                elements.authLoggedIn.classList.add('items-center', 'gap-3');
                
                elements.userDisplay?.classList.remove('max-w-full');
                elements.userDisplay?.classList.add('max-w-56', 'truncate', 'text-sm', 'font-bold');
                
                elements.logoutButton?.classList.remove('mt-2', 'w-full', 'bg-surface-container-lowest');
            }
        }

        if (!dashboardAllowed) {
            boards = [];
            boardNoteActivity = [];
            boardSettingsByBoardId = {};
            profiles = [];
            if (elements.list) elements.list.innerHTML = '';
            if (elements.recentList) elements.recentList.innerHTML = '';
            setStatus('');
            showTab('boards');
        }

        const isMaster = authUtils.isMaster(currentProfile);
        elements.accountsTabButton?.classList.toggle('hidden', !isMaster);
        elements.mobileTabButtons
            .filter(button => button.dataset.mobileTab === 'accounts')
            .forEach(button => button.classList.toggle('hidden', !isMaster));
        if (!isMaster) showTab('boards');
        updateCreateButtonState();
        if (dashboardAllowed) renderBoards();
        renderAccounts();
    }

    async function loadCurrentProfile() {
        currentProfile = null;
        if (!supabaseClient || !currentUser) return;

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (error) throw error;
        currentProfile = authUtils.normalizeProfile(data);

        if (currentProfile && !currentProfile.email && currentUser.email) {
            const { data: updatedData, error: updateError } = await supabaseClient
                .from('profiles')
                .update({ email: currentUser.email })
                .eq('user_id', currentUser.id)
                .select()
                .single();
            if (!updateError && updatedData) {
                currentProfile = authUtils.normalizeProfile(updatedData);
            }
        }
    }

    async function ensureCurrentProfile() {
        if (!supabaseClient || !currentUser || currentProfile) return;
        const displayName = currentUser.user_metadata?.display_name || elements.nameInput?.value || '';
        const candidates = authUtils.getProfileInsertCandidates(currentUser, displayName);

        for (const candidate of candidates) {
            const { data, error } = await supabaseClient
                .from('profiles')
                .insert([candidate])
                .select()
                .single();
            if (!error) {
                currentProfile = authUtils.normalizeProfile(data);
                return;
            }
        }
    }

    async function refreshSessionProfile() {
        if (!supabaseClient) return;
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentUser = session?.user || null;
        if (currentUser) {
            await loadCurrentProfile();
            await ensureCurrentProfile();
        } else {
            currentProfile = null;
        }
        renderAuthState();
    }

    async function loadBoards() {
        if (!canUseDashboard()) {
            boards = [];
            boardNoteActivity = [];
            boardSettingsByBoardId = {};
            renderAuthState();
            return;
        }
        if (!supabaseClient) {
            boards = [];
            boardNoteActivity = [];
            boardSettingsByBoardId = {};
            setConnected(false);
            renderBoards();
            return;
        }

        boards = await boardsApi.loadBoardsFromServer(supabaseClient);
        const { data: noteActivity, error: noteActivityError } = await supabaseClient
            .from('notes')
            .select('board_id, created_at')
            .order('created_at', { ascending: false });
        if (noteActivityError) {
            console.warn('Recent board activity load failed:', noteActivityError.message);
            boardNoteActivity = [];
        } else {
            boardNoteActivity = noteActivity || [];
        }
        boardSettingsByBoardId = await boardSettingsApi.loadBoardSettingsByBoardIdsFromServer(
            supabaseClient,
            boards.map(board => board.id)
        );
        setConnected(true);
        renderBoards();
        setStatus('');
    }

    async function loadAccounts() {
        if (!supabaseClient || !authUtils.isMaster(currentProfile)) {
            profiles = [];
            renderAccounts();
            return;
        }
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;
        profiles = (data || []).map(authUtils.normalizeProfile).filter(Boolean);
        renderAccounts();
    }

    function renderAccounts() {
        if (!elements.pendingTeachersList || !elements.approvedTeachersList || !elements.rejectedTeachersList) return;
        if (!authUtils.isMaster(currentProfile)) {
            elements.pendingTeachersList.innerHTML = '';
            elements.approvedTeachersList.innerHTML = '';
            elements.rejectedTeachersList.innerHTML = '';
            return;
        }

        const pending = profiles.filter(profile => profile.role === 'teacher_pending');
        const approved = profiles.filter(profile => profile.role === 'teacher');
        const rejected = profiles.filter(profile => profile.role === 'teacher_rejected');

        elements.pendingTeachersList.innerHTML = pending.length
            ? pending.map(profile => renderProfileRow(profile, 'pending')).join('')
            : '<p>승인 대기 중인 교사가 없습니다.</p>';

        elements.approvedTeachersList.innerHTML = approved.length
            ? approved.map(profile => renderProfileRow(profile, 'approved')).join('')
            : '<p>승인된 교사가 없습니다.</p>';

        elements.rejectedTeachersList.innerHTML = rejected.length
            ? rejected.map(profile => renderProfileRow(profile, 'rejected')).join('')
            : '<p>가입 거부된 교사가 없습니다.</p>';
    }

    function renderProfileRow(profile, group) {
        const masterBadge = profile.is_primary_master
            ? '<span class="text-xs font-bold text-primary">최초 마스터</span>'
            : profile.is_master
                ? '<span class="text-xs font-bold text-primary">마스터</span>'
                : '';
        const approveButton = group === 'pending'
            ? `<button type="button" data-action="approve-teacher" data-user-id="${escapeHtml(profile.user_id)}" class="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold">승인</button>`
            : '';
        const rejectButton = group === 'pending'
            ? `<button type="button" data-action="reject-teacher" data-user-id="${escapeHtml(profile.user_id)}" class="px-3 py-2 rounded-lg border border-error/40 text-error text-xs font-bold hover:bg-error-container/20">거부</button>`
            : '';
        const masterButton = group === 'approved' && !profile.is_primary_master
            ? profile.is_master
                ? `<button type="button" data-action="revoke-master" data-user-id="${escapeHtml(profile.user_id)}" class="px-3 py-2 rounded-lg border border-outline-variant text-xs font-bold">마스터 해제</button>`
                : `<button type="button" data-action="grant-master" data-user-id="${escapeHtml(profile.user_id)}" class="px-3 py-2 rounded-lg border border-outline-variant text-xs font-bold">마스터 부여</button>`
            : '';

        return `
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant/50 bg-white px-4 py-3">
                <div>
                    <p class="font-bold text-on-surface">${escapeHtml(profile.display_name || '이름 없음')}</p>
                    <p class="text-xs text-on-surface-variant">${escapeHtml(profile.email || profile.user_id)} ${masterBadge}</p>
                </div>
                <div class="flex gap-2">${approveButton}${rejectButton}${masterButton}</div>
            </div>
        `;
    }

    async function createBoard() {
        if (!supabaseClient || !authUtils.canCreateBoard(currentProfile)) {
            setStatus('승인된 교사 또는 마스터만 새 보드를 만들 수 있습니다.');
            return;
        }
        setStatus('보드 생성 중...');
        try {
            const created = await boardsApi.createBoardInServer(supabaseClient, boardsApi.DEFAULT_BOARD_TITLE);
            boards.push(created);
            searchQuery = '';
            if (elements.searchInput) elements.searchInput.value = '';
            renderBoards();
            setStatus('보드가 생성되었습니다.');

            if (created && created.id) {
                window.open(`board.html?board_id=${encodeURIComponent(created.id)}`, '_blank');
            }
        } catch (error) {
            console.error('Create board failed:', error);
            setStatus('보드 생성에 실패했습니다.');
        }
    }

    async function renameBoard(boardId) {
        if (!authUtils.canCreateBoard(currentProfile)) {
            setStatus('승인된 교사 또는 마스터만 보드를 수정할 수 있습니다.');
            return;
        }
        const board = boards.find(item => item.id === boardId);
        const input = elements.list.querySelector(`input[data-board-id="${cssEscape(boardId)}"]`);
        const titleEl = elements.list.querySelector(`.board-title-text[data-board-id="${cssEscape(boardId)}"]`);
        const nextTitle = input ? input.value.trim() : '';
        if (!board) return;
        if (!nextTitle || nextTitle === board.title) {
            if (input) input.value = board.title;
            if (titleEl) titleEl.classList.remove('hidden');
            if (input) input.classList.add('hidden');
            return;
        }

        setStatus('보드 이름 저장 중...');
        try {
            await boardsApi.renameBoardInServer(supabaseClient, boardId, nextTitle);
            board.title = nextTitle;
            renderBoards();
            setStatus('보드 이름이 저장되었습니다.');
        } catch (error) {
            console.error('Rename board failed:', error);
            renderBoards();
            setStatus('보드 이름 저장에 실패했습니다.');
        }
    }

    async function updateBoardWriteEnabled(boardId, writeEnabled, control) {
        if (!authUtils.canCreateBoard(currentProfile)) {
            if (control) control.checked = !writeEnabled;
            setStatus('승인된 교사 또는 마스터만 보드 설정을 수정할 수 있습니다.');
            return;
        }
        const board = boards.find(item => item.id === boardId);
        if (!board) return;
        const currentSettings = boardSettingsByBoardId[boardId] || boardSettingsUtils.normalizeBoardSettings({
            board_id: boardId,
            title: board.title,
        });

        setStatus('글쓰기 설정 저장 중...');
        try {
            const saved = await boardSettingsApi.saveBoardSettingsToServer(
                supabaseClient,
                currentSettings,
                { title: board.title, write_enabled: writeEnabled },
                undefined,
                boardId
            );
            boardSettingsByBoardId[boardId] = saved;
            setStatus('글쓰기 설정이 저장되었습니다.');
        } catch (error) {
            console.error('Save write setting failed:', error);
            if (control) control.checked = currentSettings.write_enabled;
            setStatus('글쓰기 설정 저장에 실패했습니다.');
        }
    }

    function startBoardTitleEdit(boardId) {
        const titleEl = elements.list.querySelector(`.board-title-text[data-board-id="${cssEscape(boardId)}"]`);
        const input = elements.list.querySelector(`input[data-board-id="${cssEscape(boardId)}"]`);
        if (!titleEl || !input) return;
        titleEl.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();
    }

    function finishBoardTitleEdit(boardId, shouldSave = true) {
        const titleEl = elements.list.querySelector(`.board-title-text[data-board-id="${cssEscape(boardId)}"]`);
        const input = elements.list.querySelector(`input[data-board-id="${cssEscape(boardId)}"]`);
        if (!titleEl || !input) return;
        if (shouldSave) {
            renameBoard(boardId);
        } else {
            const board = boards.find(item => item.id === boardId);
            if (board) input.value = board.title;
            titleEl.classList.remove('hidden');
            input.classList.add('hidden');
        }
    }

    async function deleteBoard(boardId) {
        if (!authUtils.canCreateBoard(currentProfile)) {
            setStatus('승인된 교사 또는 마스터만 보드를 삭제할 수 있습니다.');
            return;
        }
        const board = boards.find(item => item.id === boardId);
        if (!board) return;
        if (!confirm(`'${board.title}' 보드를 삭제할까요? 보드 안의 메모와 섹션도 삭제됩니다.`)) return;

        setStatus('보드 삭제 중...');
        try {
            await boardsApi.deleteBoardInServer(supabaseClient, boardId);
            boards = boards.filter(item => item.id !== boardId);
            renderBoards();
            setStatus('보드가 삭제되었습니다.');
        } catch (error) {
            console.error('Delete board failed:', error);
            setStatus('보드 삭제에 실패했습니다.');
        }
    }

    async function updateProfile(userId, patch) {
        const { error } = await supabaseClient
            .from('profiles')
            .update(patch)
            .eq('user_id', userId);
        if (error) throw error;
        await loadAccounts();
    }

    async function handleAccountAction(action, userId) {
        try {
            if (action === 'approve-teacher') {
                await updateProfile(userId, { role: 'teacher' });
            } else if (action === 'reject-teacher') {
                if (!confirm('이 교사 가입을 거부할까요? 거부된 계정은 보드 기능을 사용할 수 없습니다.')) return;
                await updateProfile(userId, { role: 'teacher_rejected' });
            } else if (action === 'grant-master') {
                await updateProfile(userId, { is_master: true, role: 'teacher' });
            } else if (action === 'revoke-master') {
                await updateProfile(userId, { is_master: false });
            }
        } catch (error) {
            console.error('Account action failed:', error);
            alert('계정 관리 작업에 실패했습니다: ' + error.message);
        }
    }

    async function handleLogin() {
        const email = elements.emailInput?.value.trim();
        const password = elements.passwordInput?.value.trim();
        if (!email || !password) {
            alert('이메일과 비밀번호를 입력해 주세요.');
            return;
        }
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            alert('로그인 실패: ' + error.message);
            return;
        }
        await refreshSessionProfile();
        await loadBoards();
        await loadAccounts();
    }

    async function handleSignup() {
        const email = elements.signupEmailInput?.value.trim();
        const password = elements.signupPasswordInput?.value.trim();
        const passwordConfirm = elements.signupPasswordConfirmInput?.value.trim();
        const displayName = elements.nameInput?.value.trim();
        if (!email || !password || !passwordConfirm || !displayName) {
            alert('이메일, 비밀번호, 이름을 모두 입력해 주세요.');
            return;
        }
        const passwordConfirmation = authUtils.validatePasswordConfirmation(password, passwordConfirm);
        if (!passwordConfirmation.valid) {
            alert(passwordConfirmation.message);
            return;
        }
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } },
        });
        if (error) {
            alert('가입 실패: ' + error.message);
            return;
        }
        if (data?.user) {
            await refreshSessionProfile();
            await loadBoards();
            await loadAccounts();
        } else {
            showAuthPanel('login');
        }
    }

    async function handleResetPassword() {
        const email = elements.emailInput?.value.trim();
        if (!email) {
            alert('비밀번호를 재설정할 이메일을 입력해 주세요.');
            return;
        }
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
            alert('비밀번호 재설정 실패: ' + error.message);
            return;
        }
        alert('비밀번호 재설정 메일을 보냈습니다.');
    }

    async function handleLogout() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            alert('로그아웃 실패: ' + error.message);
            return;
        }
        currentUser = null;
        currentProfile = null;
        authPanelMode = 'closed';
        boards = [];
        boardSettingsByBoardId = {};
        profiles = [];
        renderAuthState();
    }

    function showTab(tabName) {
        const isAccounts = tabName === 'accounts' && authUtils.isMaster(currentProfile);
        elements.boardsPanel?.classList.toggle('hidden', isAccounts);
        elements.accountsPanel?.classList.toggle('hidden', !isAccounts);
        elements.boardsTabButton?.classList.toggle('bg-primary', !isAccounts);
        elements.boardsTabButton?.classList.toggle('text-white', !isAccounts);
        elements.accountsTabButton?.classList.toggle('bg-primary', isAccounts);
        elements.accountsTabButton?.classList.toggle('text-white', isAccounts);
        elements.mobileTabButtons.forEach(button => {
            const isActive = button.dataset.mobileTab === (isAccounts ? 'accounts' : 'boards');
            button.classList.toggle('bg-primary', isActive);
            button.classList.toggle('text-white', isActive);
            button.classList.toggle('text-on-surface-variant', !isActive);
        });
        if (isAccounts) loadAccounts().catch(error => console.error('Load accounts failed:', error));
    }

    function handleListClick(event) {
        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;

        const action = actionElement.getAttribute('data-action');
        const boardId = actionElement.getAttribute('data-board-id');
        const userId = actionElement.getAttribute('data-user-id');

        if (action === 'create-board') {
            createBoard();
        } else if (action === 'delete-board') {
            deleteBoard(boardId);
        } else if (userId) {
            handleAccountAction(action, userId);
        }
    }

    function handleListChange(event) {
        const actionElement = event.target.closest('[data-action="toggle-write-enabled"]');
        if (!actionElement) return;
        const boardId = actionElement.getAttribute('data-board-id');
        updateBoardWriteEnabled(boardId, actionElement.checked, actionElement);
    }

    function handleListDoubleClick(event) {
        const actionElement = event.target.closest('[data-action="edit-board-title"]');
        if (!actionElement) return;
        startBoardTitleEdit(actionElement.getAttribute('data-board-id'));
    }

    function handleListKeydown(event) {
        const input = event.target.closest('.board-title-input');
        if (!input) return;
        const boardId = input.getAttribute('data-board-id');
        if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            finishBoardTitleEdit(boardId, false);
        }
    }

    function handleListFocusOut(event) {
        const input = event.target.closest('.board-title-input');
        if (!input) return;
        finishBoardTitleEdit(input.getAttribute('data-board-id'), true);
    }

    function handleSearchInput(event) {
        searchQuery = event.target.value || '';
        renderBoards();
    }

    async function initAuth() {
        if (!supabaseClient) {
            renderAuthState();
            return;
        }
        await refreshSessionProfile();
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            currentUser = session?.user || null;
            if (currentUser) {
                await loadCurrentProfile();
                await ensureCurrentProfile();
            } else {
                currentProfile = null;
                boards = [];
                profiles = [];
            }
            renderAuthState();
            if (canUseDashboard()) {
                await loadBoards();
                await loadAccounts();
            }
        });
    }

    async function init() {
        const connection = supabaseUtils.createSupabaseClient(
            typeof CONFIG !== 'undefined' ? CONFIG : null,
            typeof supabase !== 'undefined' ? supabase : null
        );
        supabaseClient = connection.client;
        setConnected(Boolean(supabaseClient));

        if (elements.createButton) elements.createButton.addEventListener('click', createBoard);
        if (elements.list) elements.list.addEventListener('click', handleListClick);
        if (elements.list) elements.list.addEventListener('change', handleListChange);
        if (elements.list) elements.list.addEventListener('dblclick', handleListDoubleClick);
        if (elements.list) elements.list.addEventListener('keydown', handleListKeydown);
        if (elements.list) elements.list.addEventListener('focusout', handleListFocusOut);
        if (elements.searchInput) elements.searchInput.addEventListener('input', handleSearchInput);
        if (elements.openLoginButton) elements.openLoginButton.addEventListener('click', () => showAuthPanel('login'));
        if (elements.openSignupButton) elements.openSignupButton.addEventListener('click', () => showAuthPanel('signup'));
        if (elements.authCard) {
            elements.authCard.addEventListener('click', (event) => {
                if (event.target === elements.authCard) showAuthPanel('closed');
            });
        }
        if (elements.closeAuthButton) elements.closeAuthButton.addEventListener('click', () => showAuthPanel('closed'));
        if (elements.showSignupButton) elements.showSignupButton.addEventListener('click', () => showAuthPanel('signup'));
        if (elements.showLoginButton) elements.showLoginButton.addEventListener('click', () => showAuthPanel('login'));
        if (elements.loginButton) elements.loginButton.addEventListener('click', () => handleLogin().catch(error => alert(error.message)));
        if (elements.signupButton) elements.signupButton.addEventListener('click', () => handleSignup().catch(error => alert(error.message)));
        if (elements.resetPasswordButton) elements.resetPasswordButton.addEventListener('click', () => handleResetPassword().catch(error => alert(error.message)));
        if (elements.logoutButton) elements.logoutButton.addEventListener('click', () => handleLogout().catch(error => alert(error.message)));
        if (elements.boardsTabButton) elements.boardsTabButton.addEventListener('click', () => showTab('boards'));
        if (elements.accountsTabButton) elements.accountsTabButton.addEventListener('click', () => showTab('accounts'));
        elements.mobileTabButtons.forEach(button => {
            button.addEventListener('click', () => showTab(button.dataset.mobileTab));
        });
        if (elements.accountsPanel) elements.accountsPanel.addEventListener('click', handleListClick);



        await initAuth();
        if (canUseDashboard()) {
            await loadBoards();
            await loadAccounts();
        }
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
        if (globalThis.CSS && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }
        return String(value).replace(/"/g, '\\"');
    }

    document.addEventListener('DOMContentLoaded', () => {
        init().catch((error) => {
            console.error('Dashboard init failed:', error);
            renderAuthState();
        });
    });
})();
