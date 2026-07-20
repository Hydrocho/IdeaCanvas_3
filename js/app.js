// --- 1. 상태 및 상수 정의 ---
let supabaseClient = null;
let currentNotes = [];
let currentSections = []; // 동적 섹션 목록 상태
const sectionUtils = globalThis.SectionUtils;
const boardSettingsUtils = globalThis.BoardSettingsUtils;
const supabaseUtils = globalThis.IdeaCanvasSupabase;
const boardsApi = globalThis.IdeaCanvasBoards;
const boardSettingsApi = globalThis.IdeaCanvasBoardSettings;
const sectionsApi = globalThis.IdeaCanvasSections;
const authUtils = globalThis.IdeaCanvasAuth;
const likesApi = globalThis.IdeaCanvasLikes;
const attachmentUtils = globalThis.IdeaCanvasAttachmentUtils;
const drawingUtils = globalThis.IdeaCanvasDrawingUtils;
const masonryUtils = globalThis.IdeaCanvasMasonryUtils;
const noteVisibilityUtils = globalThis.IdeaCanvasNoteVisibilityUtils;
const DEFAULT_SECTIONS = [
    { id: 'sec-1', name: sectionUtils.DEFAULT_SECTION_NAME, sort_order: 1 }
];
let currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
let currentBoardId = boardsApi.getBoardIdFromUrl(window.location.href);
let currentUser = null;
let currentProfile = null;
let isSectionViewEnabled = false;
let activeCommentNoteId = null;
let clientMaskedIP = '';
let commentDataMap = {}; // noteId => [comments]
let likeCountMap = {}; // noteId => count
let userLikesMap = {}; // noteId => true/false (현재 사용자가 좋아요를 눌렀는지 여부)
let likeIdToNoteIdMap = {}; // like.id => like.note_id (Supabase Realtime DELETE 대응용)
const pendingLikeNoteIds = new Set();
let masonryRebalanceFrame = null;
let masonryResizeTimer = null;

// 사용자 식별을 위한 로컬 스토리지 정보
let authorId = localStorage.getItem('ideacanvas_author_id');
if (!authorId) {
    authorId = 'user_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('ideacanvas_author_id', authorId);
}

// 캔버스 드로잉 상태
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let brushColor = '#000000';
let brushSize = 4;
let isEraserMode = false;
let uploadedImageBase64 = null; // 첨부용 이미지
let sketchImageBase64 = null; // 손그림 이미지
let parsedLinkPreview = null; // 웹링크 미리보기 객체
let attachmentType = null;

// --- 2. DOM 요소 취득 ---
const elements = {
    // Buttons
    gridNewNoteBtn: document.getElementById('grid-new-note-btn'),
    fabNewNoteBtn: document.getElementById('fab-new-note-btn'),
    sidebarSettingsBtn: document.getElementById('sidebar-settings-btn'),
    openSettingsBtn: document.getElementById('open-settings-btn'),
    connectionStatusBtn: document.getElementById('connection-status-btn'),
    setupNowBtn: document.getElementById('setup-now-btn'),
    eraserBtn: document.getElementById('eraser-btn'),
    clearCanvasBtn: document.getElementById('clear-canvas-btn'),
    saveDrawingBtn: document.getElementById('save-drawing-btn'),
    closeDrawingBtn: document.getElementById('close-drawing-btn'),
    openDrawingPadBtn: document.getElementById('open-drawing-pad-btn'),
    removeImageBtn: document.getElementById('remove-image-btn'),
    removeLinkBtn: document.getElementById('remove-link-btn'),
    removeYoutubeBtn: document.getElementById('remove-youtube-btn'),
    removeSketchBtn: document.getElementById('remove-sketch-btn'),

    // Modals
    settingsModal: document.getElementById('settings-modal'),
    noteModal: document.getElementById('note-modal'),
    drawingModal: document.getElementById('drawing-modal'),

    // Forms & Inputs
    settingsForm: document.getElementById('settings-form'),
    supabaseUrl: document.getElementById('supabase-url'),
    supabaseKey: document.getElementById('supabase-key'),
    noteForm: document.getElementById('note-form'),
    editNoteId: document.getElementById('edit-note-id'),
    noteAuthor: document.getElementById('note-author'),
    noteTitle: document.getElementById('note-title-fixed'),
    noteContent: document.getElementById('note-content'),
    imageFileInput: document.getElementById('image-file-input'),
    linkUrlInput: document.getElementById('link-url-input'),
    youtubeUrlInput: document.getElementById('youtube-url-input'),
    searchInput: document.getElementById('search-input'),

    // Containers & Previews
    notesGrid: document.getElementById('notes-grid'),
    connectionWarning: document.getElementById('connection-warning'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imagePreviewImg: document.getElementById('image-preview-img'),
    imageDropzone: document.getElementById('image-dropzone'),
    linkPreviewBox: document.getElementById('link-preview-box'),
    linkPreviewThumbnail: document.getElementById('link-preview-thumbnail'),
    linkPreviewImgBox: document.getElementById('link-preview-img-box'),
    linkPreviewTitle: document.getElementById('link-preview-title'),
    linkPreviewDesc: document.getElementById('link-preview-desc'),
    youtubePreviewBox: document.getElementById('youtube-preview-box'),
    youtubePreviewThumbnail: document.getElementById('youtube-preview-thumbnail'),
    sketchThumbnailContainer: document.getElementById('sketch-thumbnail-container'),
    sketchThumbnailImg: document.getElementById('sketch-thumbnail-img'),
    submitNoteBtn: document.getElementById('submit-note-btn'),

    // Canvas
    drawingCanvas: document.getElementById('drawing-canvas'),
    brushSizeInput: document.getElementById('brush-size')
};

// --- 3. Supabase 초기화 및 연결 관리 ---
function initSupabase() {
    const connection = supabaseUtils.createSupabaseClient(
        typeof CONFIG !== 'undefined' ? CONFIG : null,
        typeof supabase !== 'undefined' ? supabase : null
    );

    // 1. supabase_config.js 파일에 유효한 정보가 입력되었는지 우선 확인
    if (connection.client) {
        try {
            supabaseClient = connection.client;
            
            // 연결 상태 표시 갱신 (헤더 뱃지가 존재할 경우만)
            if (elements.statusDot) elements.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
            if (elements.statusText) elements.statusText.textContent = '연결됨';
            if (elements.connectionStatusBtn) elements.connectionStatusBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 hover:scale-105 transition-all';
            
            if (elements.connectionWarning) elements.connectionWarning.classList.add('hidden');
            
            // 폼 필드 채워놓기 (존재할 경우만)
            if (elements.supabaseUrl) elements.supabaseUrl.value = connection.url;
            if (elements.supabaseKey) elements.supabaseKey.value = connection.key;

            // 데이터 로드 및 채널 구독
            loadAllData();
            subscribeRealtime();
        } catch (e) {
            console.error("Supabase client init failed:", e);
            showDisconnectedUI();
        }
    } else {
        showDisconnectedUI();
    }
}

function showDisconnectedUI() {
    supabaseClient = null;
    console.warn("Supabase 연결 자격 증명이 누락되었거나 연결에 실패했습니다. supabase_config.js 파일을 확인하세요.");
    
    // 상태 요소가 존재할 때만 갱신
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('connection-status-btn');
    if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-error';
    if (text) text.textContent = '연결 안 됨';
    if (btn) btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-error-container text-on-error-container hover:scale-105 transition-all';
    
    if (elements.connectionWarning) elements.connectionWarning.classList.remove('hidden');

    // 오프라인 상태에서도 섹션 및 노트는 로컬 폴백으로 그려지게 처리
    resetSectionsToDefault();
    currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
    renderBoardSettings();
    renderSectionsUI();
    renderNotes();
}

// --- 4. 데이터베이스 통신 (CRUD) ---
// --- 4. 데이터베이스 통신 (CRUD) ---
async function loadAllData() {
    // 0. 우선 로컬 섹션이라도 안전하게 먼저 채워둠
    resetSectionsToDefault();

    if (!currentBoardId) {
        window.location.href = 'index.html';
        return;
    }

    if (!supabaseClient) {
        renderSectionsUI();
        renderNotes();
        return;
    }

    try {
        // 1. 메모 가져오기
        const { data: notes, error: notesError } = await supabaseClient
            .from('notes')
            .select('*')
            .eq('board_id', currentBoardId)
            .order('created_at', { ascending: false });

        if (notesError) throw notesError;
        currentNotes = notes || [];
        const currentNoteIds = currentNotes.map(note => note.id);

        // 2. 댓글 전체 가져오기
        const { data: comments, error: commentsError } = await supabaseClient
            .from('comments')
            .select('*')
            .in('note_id', currentNoteIds.length ? currentNoteIds : ['00000000-0000-0000-0000-000000000000']);
        
        if (commentsError) throw commentsError;
        
        // 댓글 맵핑
        commentDataMap = {};
        if (comments) {
            comments.forEach(c => {
                if (!commentDataMap[c.note_id]) commentDataMap[c.note_id] = [];
                commentDataMap[c.note_id].push(c);
            });
        }

        // 3. 좋아요 전체 가져오기
        const { data: likes, error: likesError } = await supabaseClient
            .from('likes')
            .select('*')
            .in('note_id', currentNoteIds.length ? currentNoteIds : ['00000000-0000-0000-0000-000000000000']);

        if (likesError) throw likesError;

        // 좋아요 집계
        const likeSummary = likesApi.buildLikeSummary(likes, authorId);
        likeCountMap = likeSummary.likeCountMap;
        userLikesMap = likeSummary.userLikesMap;

        // likeIdToNoteIdMap 채우기 (DELETE 대응)
        likeIdToNoteIdMap = {};
        if (likes) {
            likes.forEach(like => {
                likeIdToNoteIdMap[like.id] = like.note_id;
            });
        }

        // 4. 섹션 가져오기
        try {
            const sections = await sectionsApi.loadSectionsFromServer(supabaseClient, currentBoardId);
            if (sections && sections.length > 0) {
                const normalizedSections = sectionUtils.normalizeSections(sections);
                currentSections = normalizedSections;
                if (sectionUtils.isLegacyDefaultSections(sections)) {
                    await migrateLegacyDefaultSectionsToSupabase(sections, normalizedSections[0].name);
                }
            } else {
                currentSections = [await createDefaultSectionInSupabase()];
            }
        } catch (sectErr) {
            console.warn("sections table load failed, using in-memory default section:", sectErr.message);
            resetSectionsToDefault();
        }

        try {
            await loadBoardSettings();
        } catch (settingsErr) {
            console.warn("board_settings table load failed, using in-memory default settings:", settingsErr.message);
            currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
            renderBoardSettings();
        }

        renderSectionsUI();
        renderNotes();

    } catch (e) {
        console.error("Error loading Supabase data:", e);
        renderSectionsUI();
        renderNotes();
    }
}

// 실시간 구독 활성화
function subscribeRealtime() {
    if (!supabaseClient) return;

    const belongsToCurrentBoard = (record) => !record || !record.board_id || record.board_id === currentBoardId;
    const isCurrentBoardNoteId = (noteId) => currentNotes.some(note => note.id === noteId);

    supabaseClient
        .channel('schema-db-changes')
        // Notes 테이블 변화 감지
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, async (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
                if (belongsToCurrentBoard(newRecord) && !currentNotes.some(n => n.id === newRecord.id)) {
                    currentNotes.unshift(newRecord);
                }
            } else if (eventType === 'UPDATE') {
                const idx = currentNotes.findIndex(n => n.id === newRecord.id);
                if (belongsToCurrentBoard(newRecord)) {
                    if (idx !== -1) currentNotes[idx] = newRecord;
                    else currentNotes.unshift(newRecord);
                } else if (idx !== -1) {
                    currentNotes.splice(idx, 1);
                }
            } else if (eventType === 'DELETE') {
                currentNotes = currentNotes.filter(n => n.id !== oldRecord.id);
            }
            renderNotes();
        })
        // Comments 테이블 변화 감지
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
                if (!isCurrentBoardNoteId(newRecord.note_id)) return;
                if (!commentDataMap[newRecord.note_id]) commentDataMap[newRecord.note_id] = [];
                // 중복 방지 체크
                if (!commentDataMap[newRecord.note_id].some(c => c.id === newRecord.id)) {
                    commentDataMap[newRecord.note_id].push(newRecord);
                }
            } else if (eventType === 'DELETE') {
                // 어떤 노트의 댓글인지 찾기 위해 전체 순회
                Object.keys(commentDataMap).forEach(noteId => {
                    commentDataMap[noteId] = commentDataMap[noteId].filter(c => c.id !== oldRecord.id);
                });
            }
            renderNotes();
        })
        // Likes 테이블 변화 감지
        .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
                const noteId = newRecord.note_id;
                if (!isCurrentBoardNoteId(noteId)) return;
                
                likeIdToNoteIdMap[newRecord.id] = noteId;
                
                likeCountMap[noteId] = (likeCountMap[noteId] || 0) + 1;
                if (newRecord.user_session_id === authorId) {
                    userLikesMap[noteId] = true;
                }
            } else if (eventType === 'DELETE') {
                // Supabase Realtime DELETE의 경우 Replica Identity가 DEFAULT이면 PK인 id 정보만 오므로 mapping 이용
                const noteId = oldRecord.note_id || likeIdToNoteIdMap[oldRecord.id];
                if (noteId) {
                    if (!isCurrentBoardNoteId(noteId)) return;
                    likeCountMap[noteId] = Math.max(0, (likeCountMap[noteId] || 1) - 1);
                    
                    // 다른 기기나 세션에서 unlikes가 일어났을 때 sync
                    if (userLikesMap[noteId] && oldRecord.user_session_id === authorId) {
                        userLikesMap[noteId] = false;
                    }
                    delete likeIdToNoteIdMap[oldRecord.id];
                }
            }
            renderNotes();
        })
        // Sections 테이블 변화 감지
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
                if (belongsToCurrentBoard(newRecord) && !currentSections.some(s => s.id === newRecord.id)) {
                    currentSections.push(newRecord);
                }
            } else if (eventType === 'UPDATE') {
                const idx = currentSections.findIndex(s => s.id === newRecord.id);
                if (belongsToCurrentBoard(newRecord)) {
                    if (idx !== -1) currentSections[idx] = newRecord;
                    else currentSections.push(newRecord);
                } else if (idx !== -1) {
                    currentSections.splice(idx, 1);
                }
            } else if (eventType === 'DELETE') {
                currentSections = currentSections.filter(s => s.id !== oldRecord.id);
            }
            currentSections.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            if (currentSections.length === 0) resetSectionsToDefault();
            renderSectionsUI();
            renderNotes();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'board_settings' }, (payload) => {
            const record = payload.eventType === 'DELETE' ? payload.old : payload.new;
            if (record && record.board_id && record.board_id !== currentBoardId) return;
            
            // 실시간 업데이트 수신 시 기존 보드 제목 보존
            const currentTitle = currentBoardSettings.title;

            if (payload.eventType === 'DELETE') {
                currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
            } else {
                currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(payload.new);
            }

            currentBoardSettings.title = currentTitle;

            renderBoardSettings();
            renderNotes();
        })
        .subscribe();
}

// --- 5. UI 렌더링 로직 (그리드 카드 생성) ---
function createMasonryColumns() {
    if (!elements.notesGrid) return [];

    elements.notesGrid.innerHTML = '';
    const columnCount = masonryUtils.getMasonryColumnCount(window.innerWidth);
    return Array.from({ length: columnCount }, () => {
        const column = document.createElement('div');
        column.className = 'masonry-column';
        elements.notesGrid.appendChild(column);
        return column;
    });
}

function appendToShortestMasonryColumn(card, columns) {
    const shortestColumn = columns.reduce((shortest, column) => (
        column.offsetHeight < shortest.offsetHeight ? column : shortest
    ));
    shortestColumn.appendChild(card);
}

function rebalanceMasonryColumns() {
    if (isSectionViewEnabled || currentBoardSettings.note_layout === 'grid' || !elements.notesGrid) return;

    const cards = Array.from(elements.notesGrid.querySelectorAll('.masonry-item'))
        .sort((a, b) => Number(a.dataset.masonryIndex) - Number(b.dataset.masonryIndex));
    if (!cards.length) return;

    const columns = createMasonryColumns();
    cards.forEach(card => appendToShortestMasonryColumn(card, columns));
}

function scheduleMasonryRebalance() {
    if (masonryRebalanceFrame !== null) return;
    masonryRebalanceFrame = window.requestAnimationFrame(() => {
        masonryRebalanceFrame = null;
        rebalanceMasonryColumns();
    });
}

function watchMasonryImages() {
    if (!elements.notesGrid) return;
    elements.notesGrid.querySelectorAll('.masonry-item img').forEach(img => {
        if (!img.complete) img.addEventListener('load', scheduleMasonryRebalance, { once: true });
    });
}

function renderNotes() {
    const isKanbanMode = isSectionViewEnabled;

    if (isKanbanMode) {
        if (document.getElementById('notes-grid')) document.getElementById('notes-grid').classList.add('hidden');
        if (document.getElementById('kanban-board')) document.getElementById('kanban-board').classList.remove('hidden');
        
        // 각 동적 컬럼 내부 초기화
        currentSections.forEach(s => {
            const colEl = document.getElementById(`col-${s.id}`);
            if (colEl) colEl.innerHTML = '';
        });
    } else {
        if (document.getElementById('notes-grid')) {
            document.getElementById('notes-grid').classList.remove('hidden');
            document.getElementById('notes-grid').classList.toggle('masonry-grid', currentBoardSettings.note_layout !== 'grid');
            document.getElementById('notes-grid').classList.toggle('grid', currentBoardSettings.note_layout === 'grid');
            document.getElementById('notes-grid').classList.toggle('grid-cols-1', currentBoardSettings.note_layout === 'grid');
            document.getElementById('notes-grid').classList.toggle('md:grid-cols-2', currentBoardSettings.note_layout === 'grid');
            document.getElementById('notes-grid').classList.toggle('xl:grid-cols-4', currentBoardSettings.note_layout === 'grid');
            document.getElementById('notes-grid').classList.toggle('gap-5', currentBoardSettings.note_layout === 'grid');
        }
        if (document.getElementById('kanban-board')) document.getElementById('kanban-board').classList.add('hidden');
        
        // 기존 동적 메모 카드 제거
        if (elements.notesGrid) elements.notesGrid.innerHTML = '';
    }

    const searchQuery = elements.searchInput.value.toLowerCase().trim();

    // 필터링 적용
    const filteredNotes = currentNotes.filter(note => {
        if (!searchQuery) return true;
        const titleMatch = note.title && note.title.toLowerCase().includes(searchQuery);
        const contentMatch = note.content && note.content.toLowerCase().includes(searchQuery);
        const authorMatch = note.author && note.author.toLowerCase().includes(searchQuery);
        return titleMatch || contentMatch || authorMatch;
    });

    // 섹션별 카드 카운트 초기화
    const sectionCounts = {};
    currentSections.forEach(s => {
        sectionCounts[s.id] = 0;
    });

    filteredNotes.sort(compareNotesByBoardSort);
    const masonryColumns = !isKanbanMode && currentBoardSettings.note_layout !== 'grid'
        ? createMasonryColumns()
        : [];

    filteredNotes.forEach((note, masonryIndex) => {
        const cardWrapper = document.createElement('div');
        cardWrapper.id = `note-${note.id}`;

        if (isKanbanMode) {
            cardWrapper.className = 'w-full shrink-0';
        } else {
            cardWrapper.className = currentBoardSettings.note_layout === 'grid' ? 'w-full' : 'masonry-item';
            cardWrapper.dataset.masonryIndex = String(masonryIndex);
        }

        const isOwner = note.author_id === authorId || canCurrentUserManageBoard();
        const colorClass = note.bg_color || 'bg-surface-container-lowest';
        const hasImage = !!note.image_url;
        const hasSketch = !!note.drawing_data;
        const hasLink = !!note.link_preview;

        // 좋아요 상태
        const likesCount = likeCountMap[note.id] || 0;
        const userLiked = userLikesMap[note.id] || false;
        const heartIcon = userLiked ? 'favorite' : 'favorite';
        const heartStyle = userLiked ? "font-variation-settings: 'FILL' 1; color: #ba1a1a;" : "color: #7b7487;";

        // 댓글 렌더링용 HTML 조립
        const commentsList = commentDataMap[note.id] || [];
        let commentsHtml = '';
        commentsList.forEach(c => {
            const commentOwner = c.author_id === authorId || canCurrentUserManageBoard();
            commentsHtml += `
                <div class="flex items-start justify-between gap-2 text-xs py-1 border-b border-outline-variant/10 last:border-b-0 group/comment">
                    <div class="min-w-0 flex-1">
                        <span class="font-bold text-on-surface text-[11px]">${escapeHtml(c.author)} <span class="text-[9px] text-on-surface-variant/70 font-normal">${c.client_ip ? `(${c.client_ip})` : ''}</span>:</span>
                        <span class="text-on-surface-variant break-all">${escapeHtml(c.content)}</span>
                    </div>
                    ${commentOwner ? `
                        <button onclick="deleteComment('${c.id}', '${note.id}')" class="text-on-surface-variant hover:text-error opacity-0 group-hover/comment:opacity-100 transition-opacity">
                            <span class="material-symbols-outlined text-xs">close</span>
                        </button>
                    ` : ''}
                </div>
            `;
        });

        // 카드 템플릿
        cardWrapper.innerHTML = `
            <div class="glass-card rounded-2xl overflow-hidden border border-outline-variant/20 shadow-md ${colorClass} hover:shadow-lg transition-all p-5 flex flex-col relative group/card">
                
                <!-- 관리 단추 (수정/삭제) -->
                ${isOwner ? `
                    <div class="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                        <button onclick="openEditNoteModal('${note.id}')" class="w-8 h-8 rounded-full bg-white/80 backdrop-blur hover:bg-white text-on-surface-variant hover:text-primary flex items-center justify-center shadow-sm" title="수정">
                            <span class="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button onclick="deleteNote('${note.id}')" class="w-8 h-8 rounded-full bg-white/80 backdrop-blur hover:bg-white text-on-surface-variant hover:text-error flex items-center justify-center shadow-sm" title="삭제">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                ` : ''}

                <!-- 제목 영역 (항상 맨 위) -->
                ${note.title ? `<h4 class="font-bold text-base text-on-surface mb-3 break-words pr-16">${escapeHtml(note.title)}</h4>` : ''}

                <!-- 이미지 노출 -->
                ${hasImage ? `
                    <div class="w-full rounded-xl overflow-hidden max-h-48 mb-3 bg-slate-100">
                        <img src="${note.image_url}" class="clickable-note-img w-full h-full object-cover"/>
                    </div>
                ` : ''}

                <!-- 손그림 노출 -->
                ${hasSketch ? `
                    <div class="w-full rounded-xl overflow-hidden h-48 mb-3 bg-white border border-outline-variant/20 p-2">
                        <img src="${note.drawing_data}" class="clickable-note-img note-drawing-img w-full h-full object-contain mx-auto"/>
                    </div>
                ` : ''}

                <!-- 링크 미리보기 노출 -->
                ${hasLink ? renderLinkPreviewMarkup(note.link_preview, note.link_url) : ''}

                <!-- 본문 텍스트 영역 -->
                <div class="flex-1">
                    <p class="text-sm text-on-surface-variant whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(note.content)}</p>
                </div>

                <!-- 메타데이터 & 좋아요 리액션 -->
                <div class="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3">
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] text-on-surface-variant">${(note.author && note.author !== '익명') ? escapeHtml(note.author) + ' ' : ''}${note.client_ip ? `(${note.client_ip})` : ''}${((note.author && note.author !== '익명') || note.client_ip) ? ' • ' : ''}${formatDate(note.created_at)}</span>
                    </div>
                    
                    ${currentBoardSettings.likes_enabled !== false ? `
                        <button onclick="toggleLike('${note.id}')" class="flex items-center gap-1 hover:scale-110 active:scale-95 transition-all text-xs font-semibold">
                            <span class="material-symbols-outlined text-base" style="${heartStyle}">${heartIcon}</span>
                            <span class="text-on-surface-variant">${likesCount}</span>
                        </button>
                    ` : ''}
                </div>

                <!-- 댓글 목록 영역 -->
                ${currentBoardSettings.comments_enabled !== false ? `
                    <div class="mt-3 bg-surface-container-low/60 rounded-xl p-3 border border-outline-variant/10">
                        <div class="max-h-28 overflow-y-auto custom-scrollbar mb-2 space-y-1.5">
                            ${commentsHtml || '<p class="text-[10px] text-outline text-center py-1">첫 댓글을 달아주세요.</p>'}
                        </div>
                        
                        <!-- 댓글 쓰기 폼 -->
                        <div class="flex items-center gap-1 border-t border-outline-variant/20 pt-2">
                            <input readonly onclick="openCommentModal('${note.id}')" class="flex-1 cursor-pointer bg-white border border-outline-variant/30 rounded-lg px-2.5 py-1 text-xs outline-none placeholder:text-[10px]" placeholder="댓글 작성..." type="text"/>
                            <button onclick="openCommentModal('${note.id}')" class="p-1 text-primary hover:bg-primary/10 rounded-lg" title="댓글 작성">
                                <span class="material-symbols-outlined text-base">chat_bubble</span>
                            </button>
                        </div>
                    </div>
                ` : ''}

            </div>
        `;

        if (isKanbanMode) {
            const noteSect = sectionUtils.getValidSectionName(note.section, currentSections);
            const matchedSection = currentSections.find(s => s.name === noteSect) || currentSections[0];
            if (matchedSection) {
                const targetCol = document.getElementById(`col-${matchedSection.id}`);
                if (targetCol) {
                    targetCol.appendChild(cardWrapper);
                    sectionCounts[matchedSection.id] = (sectionCounts[matchedSection.id] || 0) + 1;
                }
            }
        } else {
            if (masonryColumns.length) appendToShortestMasonryColumn(cardWrapper, masonryColumns);
            else elements.notesGrid.appendChild(cardWrapper);
        }
    });

    if (isKanbanMode) {
        currentSections.forEach(s => {
            const cntEl = document.getElementById(`count-${s.id}`);
            if (cntEl) cntEl.textContent = sectionCounts[s.id] || 0;
        });
    } else if (masonryColumns.length) {
        watchMasonryImages();
        scheduleMasonryRebalance();
    }
}

function compareNotesByBoardSort(a, b) {
    const mode = currentBoardSettings.note_sort || 'newest';
    const createdDifference = new Date(b.created_at || 0) - new Date(a.created_at || 0);
    if (mode === 'oldest') return -createdDifference;
    if (mode === 'likes_desc') {
        const difference = (likeCountMap[b.id] || 0) - (likeCountMap[a.id] || 0);
        return difference || createdDifference;
    }
    if (mode === 'comments_desc') {
        const difference = (commentDataMap[b.id] || []).length - (commentDataMap[a.id] || []).length;
        return difference || createdDifference;
    }
    return createdDifference;
}

// --- 섹션 제어 관련 로컬 헬퍼 ---
function resetSectionsToDefault() {
    currentSections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
}

function clearLocalSectionCache() {
    localStorage.removeItem('ideacanvas_local_sections');
}

async function createDefaultSectionInSupabase() {
    return sectionsApi.createDefaultSectionInServer(supabaseClient, DEFAULT_SECTIONS[0], currentBoardId);
}

function requireSupabaseForSectionMutation() {
    if (supabaseClient) return true;
    alert('섹션 변경은 서버 연결 후 사용할 수 있습니다. Supabase 설정을 확인해 주세요.');
    return false;
}

function clearLocalBoardSettingsCache() {
    localStorage.removeItem('ideacanvas_board_title');
    localStorage.removeItem('ideacanvas_auth_write');
    localStorage.removeItem('ideacanvas_write_enabled');
    localStorage.removeItem('ideacanvas_section_view');
    localStorage.removeItem('ideacanvas_supabase_url');
    localStorage.removeItem('ideacanvas_supabase_key');
}

function renderBoardSettings() {
    const titleEl = document.getElementById('board-title');
    const inputEl = document.getElementById('board-title-input');
    const toggleAuthWrite = document.getElementById('toggle-auth-write');
    const toggleShowComments = document.getElementById('toggle-show-comments');
    const toggleShowLikes = document.getElementById('toggle-show-likes');
    const toggleSectionView = document.getElementById('toggle-section-view');

    if (titleEl) titleEl.textContent = currentBoardSettings.title;
    if (inputEl) inputEl.value = currentBoardSettings.title;
    if (toggleAuthWrite) toggleAuthWrite.checked = currentBoardSettings.write_enabled;
    if (toggleShowComments) toggleShowComments.checked = currentBoardSettings.comments_enabled !== false;
    if (toggleShowLikes) toggleShowLikes.checked = currentBoardSettings.likes_enabled !== false;
    
    isSectionViewEnabled = currentBoardSettings.sections_enabled === true;
    if (toggleSectionView) toggleSectionView.checked = isSectionViewEnabled;
    const noteSortSelect = document.getElementById('note-sort-select');
    if (noteSortSelect) noteSortSelect.value = currentBoardSettings.note_sort || 'newest';
    const noteLayoutSelect = document.getElementById('note-layout-select');
    if (noteLayoutSelect) noteLayoutSelect.value = currentBoardSettings.note_layout || 'masonry';

    // 보드 배경색 스타일 적용
    const mainCanvas = document.getElementById('main-canvas');
    if (mainCanvas) {
        // bg-preset-* 관련 클래스 모두 제거
        mainCanvas.className = mainCanvas.className.split(' ').filter(c => !c.startsWith('bg-preset-')).join(' ');
        const bgColor = currentBoardSettings.bg_color || 'default';
        mainCanvas.classList.add(`bg-preset-${bgColor}`);
    }

    // 설정 드로어 내 보드 배경색 버튼 선택 상태 피드백
    document.querySelectorAll('.board-bg-btn').forEach(btn => {
        const bgVal = btn.getAttribute('data-bg');
        if (bgVal === (currentBoardSettings.bg_color || 'default')) {
            btn.classList.add('border-primary', 'scale-110');
            btn.classList.remove('border-outline-variant');
            if (!btn.querySelector('span')) {
                btn.innerHTML = `<span class="material-symbols-outlined text-[10px] text-primary font-bold">check</span>`;
            }
        } else {
            btn.classList.remove('border-primary', 'scale-110');
            btn.classList.add('border-outline-variant');
            btn.innerHTML = '';
        }
    });

    renderBoardAccessUI();
}

function renderBoardNavigationLinks() {
    const homeLink = document.getElementById('board-home-link');
    if (homeLink) homeLink.href = 'index.html';
}

function canCurrentUserManageBoard() {
    return authUtils.canCreateBoard(currentProfile);
}

function renderBoardAccessUI() {
    const canManage = canCurrentUserManageBoard();
    const homeLink = document.getElementById('board-home-link');
    const controls = document.getElementById('board-settings-controls');
    const locked = document.getElementById('board-settings-locked');
    const settingsBtn = document.getElementById('open-settings-panel-btn');

    if (homeLink) homeLink.classList.toggle('hidden', !canManage);
    if (controls) controls.classList.toggle('hidden', !canManage);
    if (locked) locked.classList.toggle('hidden', canManage);
    if (settingsBtn) settingsBtn.classList.toggle('hidden', !canManage);

    // 보드 제목 편집 가능 여부에 따른 UI 세팅
    const titleContainer = document.getElementById('board-title-container');
    if (titleContainer) {
        if (canManage) {
            titleContainer.classList.add('cursor-pointer', 'group');
            titleContainer.setAttribute('title', '더블 클릭하여 제목 수정');
            const pencilIcon = titleContainer.querySelector('span.material-symbols-outlined');
            if (pencilIcon) {
                pencilIcon.classList.remove('hidden');
            }
        } else {
            titleContainer.classList.remove('cursor-pointer', 'group');
            titleContainer.removeAttribute('title');
            const pencilIcon = titleContainer.querySelector('span.material-symbols-outlined');
            if (pencilIcon) {
                pencilIcon.classList.add('hidden');
            }
        }
    }

    // 글쓰기 권한에 따른 FAB(글쓰기 버튼) 표시 여부 제어
    const canWrite = canCurrentUserWrite();
    if (elements.fabNewNoteBtn) {
        elements.fabNewNoteBtn.classList.toggle('hidden', !canWrite);
    }
}

async function loadBoardSettings() {
    if (!supabaseClient) {
        currentBoardSettings = boardSettingsUtils.normalizeBoardSettings(null);
        renderBoardSettings();
        return;
    }

    const settings = await boardSettingsApi.loadBoardSettingsFromServer(supabaseClient, currentBoardSettings.id, currentBoardId);
    const board = await boardsApi.loadBoardFromServer(supabaseClient, currentBoardId);

    if (settings) {
        currentBoardSettings = boardSettingsUtils.normalizeBoardSettings({
            ...settings,
            title: board ? board.title : settings.title,
        });
    } else {
        currentBoardSettings = await saveBoardSettings({
            ...currentBoardSettings,
            title: board ? board.title : currentBoardSettings.title,
        });
    }

    renderBoardSettings();
}

async function saveBoardSettings(nextSettings) {
    if (!supabaseClient) {
        alert('보드 설정은 서버 연결 후 저장할 수 있습니다. Supabase 설정을 확인해 주세요.');
        throw new Error('Supabase client is not available');
    }

    const boardTitle = Object.prototype.hasOwnProperty.call(nextSettings, 'title')
        ? nextSettings.title
        : currentBoardSettings.title;
    const savedSettings = await boardSettingsApi.saveBoardSettingsToServer(
        supabaseClient,
        currentBoardSettings,
        nextSettings,
        undefined,
        currentBoardId
    );
    currentBoardSettings = { ...savedSettings, title: boardTitle };
    if (Object.prototype.hasOwnProperty.call(nextSettings, 'title')) {
        await boardsApi.renameBoardInServer(supabaseClient, currentBoardId, boardTitle);
    }
    renderBoardSettings();
    renderNotes();
    return currentBoardSettings;
}

async function migrateLegacyDefaultSectionsToSupabase(legacySections, nextSectName) {
    if (!supabaseClient || !sectionUtils.isLegacyDefaultSections(legacySections)) return;

    try {
        await sectionsApi.migrateLegacyDefaultSectionsInServer(supabaseClient, legacySections, nextSectName, currentBoardId);
    } catch (e) {
        console.error("Legacy default section migration failed:", e);
    }
}

// 동적 섹션 UI 렌더링
function renderSectionsUI() {
    const kanbanBoard = document.getElementById('kanban-board');
    if (!kanbanBoard) return;
    const canManageSections = canCurrentUserManageBoard();

    // 1. 칸반 보드 컬럼들 그리기
    kanbanBoard.innerHTML = '';

    currentSections.forEach((s, idx) => {
        const colWrapper = document.createElement('div');
        colWrapper.className = 'w-[280px] md:w-[320px] bg-surface-container-low/30 border border-outline-variant/20 rounded-2xl p-4 flex flex-col space-y-4 shrink-0';
        colWrapper.id = `sect-container-${s.id}`;

        colWrapper.innerHTML = `
            <div class="flex items-center justify-between border-b border-outline-variant/20 pb-2.5 mb-1 shrink-0 select-none group/header">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                    <!-- 더블클릭 수정 텍스트 영역 -->
                    <span id="sect-title-${s.id}" class="font-bold text-xs bg-primary/10 text-primary px-3 py-1 rounded-full flex items-center gap-1 ${canManageSections ? 'cursor-pointer' : 'cursor-default'} truncate max-w-full" ${canManageSections ? 'title="더블클릭하여 제목 수정"' : ''}>
                        <span class="material-symbols-outlined text-sm">label</span>
                        <span class="sect-name-text">${escapeHtml(s.name)}</span>
                    </span>
                    <!-- 인풋 필드 (기본 숨김) -->
                    ${canManageSections ? `<input id="sect-input-${s.id}" type="text" value="${escapeHtml(s.name)}" class="hidden px-2 py-0.5 border border-primary rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary w-full"/>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0 ml-2">
                    <span id="count-${s.id}" class="text-xs font-semibold text-on-surface-variant mr-1">0</span>
                    <button onclick="openNoteModalForSection(this)" class="w-6 h-6 rounded-full hover:bg-primary/10 text-primary flex items-center justify-center transition-all" title="이 섹션에 메모 추가">
                        <span class="material-symbols-outlined text-base">add_circle</span>
                    </button>
                    ${canManageSections ? `
                        <button onclick="deleteSection('${s.id}')" class="w-6 h-6 rounded-full hover:bg-error-container/20 text-on-surface-variant hover:text-error flex items-center justify-center opacity-0 group-hover/header:opacity-100 transition-opacity" title="섹션 삭제">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    ` : ''}
                </div>
            </div>
            <div id="col-${s.id}" class="space-y-4 flex-1 min-h-[200px] pb-2"></div>
        `;

        kanbanBoard.appendChild(colWrapper);

        // 더블클릭 이벤트 연동
        const titleEl = document.getElementById(`sect-title-${s.id}`);
        const inputEl = document.getElementById(`sect-input-${s.id}`);

        if (canManageSections && titleEl && inputEl) {
            const nameSpan = titleEl.querySelector('.sect-name-text');

            const enableEdit = () => {
                titleEl.classList.add('hidden');
                inputEl.classList.remove('hidden');
                inputEl.focus();
                inputEl.select();
            };

            const saveEdit = async () => {
                const newName = inputEl.value.trim();
                const oldName = s.name;
                if (newName && newName !== oldName) {
                    titleEl.classList.remove('hidden');
                    inputEl.classList.add('hidden');
                    nameSpan.textContent = newName;
                    await updateSectionName(s.id, newName, oldName);
                } else {
                    titleEl.classList.remove('hidden');
                    inputEl.classList.add('hidden');
                    inputEl.value = oldName;
                }
            };

            titleEl.addEventListener('dblclick', enableEdit);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') {
                    titleEl.classList.remove('hidden');
                    inputEl.classList.add('hidden');
                    inputEl.value = s.name;
                }
            });
            inputEl.addEventListener('blur', saveEdit);
        }
    });

    // 2. "+ 섹션 추가" 단추 카드 생성하여 맨 오른쪽에 붙임
    if (canManageSections) {
        const addColBtn = document.createElement('button');
        addColBtn.id = 'add-kanban-section-btn';
        addColBtn.className = 'w-[280px] md:w-[320px] h-32 border-2 border-dashed border-outline-variant/40 hover:border-primary/50 bg-surface-container-low/20 rounded-2xl flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:text-primary transition-all shrink-0';
        addColBtn.innerHTML = `
            <span class="material-symbols-outlined text-2xl">add_circle</span>
            <span class="font-bold text-xs">섹션 추가</span>
        `;
        addColBtn.addEventListener('click', addSection);
        kanbanBoard.appendChild(addColBtn);
    }


    // 3. 모달 내의 섹션 선택 라디오 버튼 리스트 갱신
    const modalSelectContainer = document.getElementById('modal-section-select-container');
    if (modalSelectContainer) {
        modalSelectContainer.innerHTML = '';
        const noteSectInput = document.getElementById('note-section');
        const selectedSectionName = sectionUtils.getValidSectionName(noteSectInput ? noteSectInput.value : '', currentSections);
        if (noteSectInput) noteSectInput.value = selectedSectionName;

        currentSections.forEach((s, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-section', s.name);
            btn.className = 'py-1.5 px-3.5 bg-slate-100 text-on-surface-variant border border-transparent rounded-xl text-xs font-semibold transition-all section-select-btn';
            btn.textContent = s.name;

            // 이미 선택 상태 복원
            if (selectedSectionName === s.name) {
                btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
                btn.classList.remove('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
            }

            btn.addEventListener('click', (e) => {
                if (noteSectInput) noteSectInput.value = s.name;
                document.querySelectorAll('.section-select-btn').forEach(b => {
                    b.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
                    b.classList.add('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
                });
                btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
                btn.classList.remove('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
            });

            modalSelectContainer.appendChild(btn);
        });
    }
    requestAnimationFrame(syncKanbanScrollProxy);
}

function requireSectionManagementPermission() {
    if (canCurrentUserManageBoard()) return true;
    alert('교사 계정만 섹션을 변경할 수 있습니다.');
    return false;
}

// 섹션 추가 액션
async function addSection() {
    if (!requireSectionManagementPermission()) return;
    if (!requireSupabaseForSectionMutation()) return;

    const newName = sectionUtils.getNextSectionName(currentSections);

    const sortOrder = currentSections.length > 0 ? Math.max(...currentSections.map(s => s.sort_order || 0)) + 1 : 1;

    if (supabaseClient) {
        try {
            const inserted = await sectionsApi.addSectionToServer(supabaseClient, newName, sortOrder, currentBoardId);
            if (!currentSections.some(s => s.id === inserted.id)) {
                currentSections.push(inserted);
            }
        } catch (e) {
            console.error("Supabase add section failed:", e);
            alert('섹션을 서버에 저장하지 못했습니다. 연결 설정을 확인해 주세요.');
            return;
        }
    } else {
        return;
    }

    currentSections.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    renderSectionsUI();
    renderNotes();
}

// 섹션 이름 수정 액션
async function updateSectionName(sectionId, newName, oldName) {
    if (!requireSectionManagementPermission()) return;
    if (!requireSupabaseForSectionMutation()) {
        renderSectionsUI();
        renderNotes();
        return;
    }

    const idx = currentSections.findIndex(s => s.id === sectionId);
    if (idx !== -1) {
        currentSections[idx].name = newName;
    }

    if (supabaseClient) {
        try {
            await sectionsApi.renameSectionInServer(supabaseClient, sectionId, newName, oldName, currentBoardId);
        } catch (e) {
            console.error("Supabase update section failed:", e);
            if (idx !== -1) currentSections[idx].name = oldName;
            alert('섹션 이름을 서버에 저장하지 못했습니다. 연결 설정을 확인해 주세요.');
            renderSectionsUI();
            renderNotes();
            return;
        }
    }

    currentNotes.forEach(n => {
        if (n.section === oldName) {
            n.section = newName;
        }
    });

    renderSectionsUI();
    renderNotes();
}

// 섹션 삭제 액션
async function deleteSection(sectionId) {
    if (!requireSectionManagementPermission()) return;
    if (!requireSupabaseForSectionMutation()) return;

    const s = currentSections.find(sec => sec.id === sectionId);
    if (!s) return;
    if (!confirm(`'${s.name}' 섹션을 정말 삭제하시겠습니까? 섹션 안의 메모들은 삭제되지 않고 기본 섹션으로 이동합니다.`)) return;

    const remainingSections = currentSections.filter(sec => sec.id !== sectionId);
    const nextSectName = sectionUtils.getDefaultSectionName(remainingSections);

    if (supabaseClient) {
        try {
            await sectionsApi.deleteSectionInServer(supabaseClient, s, nextSectName, currentBoardId);
        } catch (e) {
            console.error("Supabase delete section failed:", e);
            alert('섹션 삭제를 서버에 반영하지 못했습니다. 연결 설정을 확인해 주세요.');
            return;
        }
    }

    currentSections = remainingSections;
    
    currentNotes.forEach(n => {
        if (n.section === s.name || n.section === s.id) {
            n.section = nextSectName;
        }
    });

    renderSectionsUI();
    renderNotes();
}

function renderLinkPreviewMarkup(preview, originalUrl) {
    const isYt = originalUrl.includes('youtube.com') || originalUrl.includes('youtu.be');
    
    if (isYt) {
        // 유튜브 임베디드 썸네일/플레이어 형태로 랜더링
        return `
            <div class="w-full rounded-xl overflow-hidden mb-3 border border-outline-variant/30 shadow-sm relative group/yt bg-black">
                <img src="${preview.image}" class="w-full h-full object-cover opacity-80 group-hover/yt:opacity-60 transition-opacity max-h-40"/>
                <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    <span class="bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 select-none backdrop-blur-sm">
                        <span class="material-symbols-outlined text-[10px]">link</span>
                        <span>유튜브 동영상 링크</span>
                    </span>
                    <a href="${originalUrl}" target="_blank" class="w-14 h-9 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center justify-center shadow-lg transition-transform hover:scale-110" title="동영상 보기">
                        <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                    </a>
                </div>
            </div>
        `;
    }

    return `
        <a href="${originalUrl}" target="_blank" class="block w-full rounded-xl overflow-hidden mb-3 border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high transition-colors p-2.5 flex gap-2.5 shadow-sm">
            ${preview.image ? `
                <div class="w-16 h-16 rounded overflow-hidden shrink-0 bg-white border border-outline-variant/10">
                    <img src="${preview.image}" class="w-full h-full object-cover"/>
                </div>
            ` : ''}
            <div class="min-w-0 flex-1 flex flex-col justify-center">
                <h5 class="font-bold text-xs truncate text-on-surface">${escapeHtml(preview.title || '웹 사이트')}</h5>
                <p class="text-[10px] text-on-surface-variant truncate mt-0.5">${escapeHtml(preview.description || originalUrl)}</p>
                <div class="text-[8px] md:text-[9px] text-outline font-bold mt-1.5 flex items-center gap-0.5 text-on-surface-variant/70">
                    <span class="material-symbols-outlined text-[10px]">open_in_new</span>
                    <span>외부 연결 링크</span>
                </div>
                <span class="text-[9px] text-primary font-medium mt-0.5 truncate flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[10px]">link</span>
                    웹사이트 이동
                </span>
            </div>
        </a>
    `;
}

// --- 6. 비즈니스 로직 함수들 (등록 / 수정 / 삭제 / 댓글 / 좋아요) ---

// 메모 저장(등록/수정) 처리
async function handleNoteSubmit(e) {
    e.preventDefault();
    if (!supabaseClient) {
        alert('Supabase 연결 설정이 되어 있지 않습니다.');
        return;
    }

    const noteId = elements.editNoteId.value;
    const author = elements.noteAuthor.value.trim() || '익명';
    const title = elements.noteTitle.value.trim();
    const content = elements.noteContent.value.trim();
    const hasAttachment = hasNoteAttachment();

    if (!canCurrentUserWrite()) {
        alert('현재 보드는 글쓰기 기능이 꺼져 있습니다.');
        return;
    }

    if (elements.noteAuthor) elements.noteAuthor.value = author;
    if (!title) {
        alert('제목을 입력해 주세요.');
        return;
    }
    if (!content && !hasAttachment) {
        alert('내용을 입력하거나 자료를 추가해 주세요.');
        return;
    }
    
    // 활성화된 배경색 단추에서 클래스 가져오기
    const activeColorBtn = document.querySelector('.bg-select-btn.border-primary');
    const bgColor = activeColorBtn ? activeColorBtn.getAttribute('data-bg') : 'bg-surface-container-lowest';

    const section = sectionUtils.getValidSectionName(document.getElementById('note-section').value, currentSections);

    const payload = {
        title,
        content,
        bg_color: bgColor,
        author,
        image_url: attachmentType === 'image' ? uploadedImageBase64 : null,
        drawing_data: attachmentType === 'draw' ? sketchImageBase64 : null,
        link_url: attachmentType === 'youtube' ? elements.youtubeUrlInput.value.trim() : (attachmentType === 'link' ? elements.linkUrlInput.value.trim() : null),
        link_preview: attachmentType === 'link' || attachmentType === 'youtube' ? parsedLinkPreview : null,
        section: section,
        board_id: currentBoardId,
        client_ip: clientMaskedIP
    };

    console.log('[saveNote] Attempting to save note:', noteId);
    console.log('[saveNote] currentUser:', currentUser);
    console.log('[saveNote] currentProfile:', currentProfile);
    console.log('[saveNote] canCurrentUserManageBoard():', canCurrentUserManageBoard());
    console.log('[saveNote] authorId:', authorId);

    try {
        if (noteId) {
            // 수정 모드
            const originalNote = currentNotes.find(n => n.id === noteId);
            const updatePayload = {
                ...payload,
                author_id: originalNote ? originalNote.author_id : authorId,
                author_user_id: originalNote ? originalNote.author_user_id : (currentUser?.id || null)
            };

            let query = supabaseClient
                .from('notes')
                .update(updatePayload)
                .eq('id', noteId)
                .eq('board_id', currentBoardId);

            if (!canCurrentUserManageBoard()) {
                query = query.eq('author_id', authorId); // 본인 검증
            }

            const { data, error } = await query.select();

            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn('[saveNote] Update query returned 0 rows affected. RLS restriction?');
                alert("메모 저장 실패: 수정 권한이 없거나 이미 삭제된 메모입니다.");
                return;
            } else {
                console.log('[saveNote] Successfully updated note:', data);
            }
        } else {
            // 신규 등록
            const insertPayload = {
                ...payload,
                author_id: authorId,
                author_user_id: currentUser?.id || null
            };
            const { data, error } = await supabaseClient
                .from('notes')
                .insert([insertPayload])
                .select();

            if (error) throw error;

            // 로컬 상태 즉시 업데이트 (실시간 지연 방지)
            if (data && data.length > 0) {
                const newNote = data[0];
                if (!currentNotes.some(n => n.id === newNote.id)) {
                    currentNotes.unshift(newNote);
                    
                    // 새 메모 등록 시 검색 조건을 초기화해 주어 필터링으로 숨는 현상 방지
                    if (elements.searchInput) {
                        elements.searchInput.value = '';
                    }
                    
                    renderNotes();
                }
            }
        }

        closeAllModals();
        resetNoteForm();
    } catch (e) {
        console.error("Save note failed:", e);
        alert("메모 저장 실패: " + e.message);
    }
}

// 메모 삭제
async function deleteNote(id) {
    if (!confirm('정말 이 메모를 삭제하시겠습니까?')) return;
    if (!supabaseClient) return;

    console.log('[deleteNote] Attempting to delete note:', id);
    console.log('[deleteNote] currentUser:', currentUser);
    console.log('[deleteNote] currentProfile:', currentProfile);
    console.log('[deleteNote] canCurrentUserManageBoard():', canCurrentUserManageBoard());
    console.log('[deleteNote] authorId:', authorId);

    try {
        let query = supabaseClient
            .from('notes')
            .delete()
            .eq('id', id)
            .eq('board_id', currentBoardId);

        if (!canCurrentUserManageBoard()) {
            query = query.eq('author_id', authorId); // 본인 글만 삭제
        }

        const { data, error } = await query.select();

        if (error) throw error;

        if (!data || data.length === 0) {
            console.warn('[deleteNote] Delete query returned 0 rows affected. This is likely an RLS restriction.');
            alert("삭제 실패: 삭제 권한이 없거나 이미 삭제된 메모입니다.");
        } else {
            console.log('[deleteNote] Successfully deleted rows:', data);
        }
    } catch (e) {
        console.error('[deleteNote] Error occurred during deletion:', e);
        alert("삭제 실패: " + e.message);
    }
}

// 특정 섹션에 즉시 메모 추가 모달 열기
function openNoteModalForSection(btnElement) {
    if (!canCurrentUserWrite()) {
        const writeDisabledModal = document.getElementById('write-disabled-modal');
        if (writeDisabledModal) writeDisabledModal.classList.remove('hidden');
        return;
    }
    
    const container = btnElement.closest('[id^=sect-container-]');
    if (!container) return;
    const sectId = container.id.replace('sect-container-', '');
    const titleEl = document.getElementById(`sect-title-${sectId}`);
    if (!titleEl) return;
    const nameSpan = titleEl.querySelector('.sect-name-text');
    const sectionName = nameSpan ? nameSpan.textContent.trim() : '';

    resetNoteForm();
    
    // 섹션 선택값 강제 지정
    const noteSectInput = document.getElementById('note-section');
    if (noteSectInput) {
        noteSectInput.value = sectionName;
    }
    
    // 모달 내부 버튼 기동 처리 등 동기화
    document.querySelectorAll('.section-select-btn').forEach(btn => {
        if (btn.getAttribute('data-section') === sectionName) {
            btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.remove('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        } else {
            btn.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.add('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        }
    });

    if (elements.noteModal) elements.noteModal.classList.remove('hidden');
}

// 메모 수정 모달 열기
async function openEditNoteModal(id) {
    const note = currentNotes.find(n => n.id === id);
    if (!note) return;

    resetNoteForm();

    elements.editNoteId.value = note.id;
    elements.noteAuthor.value = note.author;
    elements.noteTitle.value = note.title || '';
    elements.noteContent.value = note.content;
    elements.linkUrlInput.value = note.link_url || '';
    
    // 섹션 선택 동기화
    const activeSection = sectionUtils.getValidSectionName(note.section, currentSections);
    document.getElementById('note-section').value = activeSection;
    document.querySelectorAll('.section-select-btn').forEach(btn => {
        if (btn.getAttribute('data-section') === activeSection) {
            btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.remove('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        } else {
            btn.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.add('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        }
    });
    
    // 배경색 버튼 선택 동기화
    document.querySelectorAll('.bg-select-btn').forEach(btn => {
        if (btn.getAttribute('data-bg') === note.bg_color) {
            btn.classList.remove('border-transparent');
            btn.classList.add('border-primary');
            btn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">check</span>`;
        } else {
            btn.classList.remove('border-primary');
            btn.classList.add('border-transparent');
            btn.innerHTML = '';
        }
    });

    // 첨부 파일 정보 복원 및 해당 도구 패널 자동 열기
    if (note.image_url) {
        const p = document.getElementById('panel-image');
        const b = document.getElementById('tool-btn-image');
        if (p) p.classList.remove('hidden');
        if (b) b.classList.add('bg-primary/10', 'text-primary');

        if (note.image_url.startsWith('data:image')) {
            uploadedImageBase64 = note.image_url;
            elements.imagePreviewImg.src = note.image_url;
            elements.imagePreviewContainer.classList.remove('hidden');
        }
    }
    
    if (note.drawing_data) {
        const p = document.getElementById('panel-draw');
        const b = document.getElementById('tool-btn-draw');
        if (p) p.classList.remove('hidden');
        if (b) b.classList.add('bg-primary/10', 'text-primary');

        sketchImageBase64 = note.drawing_data;
        elements.sketchThumbnailImg.src = note.drawing_data;
        elements.sketchThumbnailContainer.classList.remove('hidden');
    }

    if (note.link_preview) {
        const p = document.getElementById('panel-link');
        const b = document.getElementById('tool-btn-link');
        if (p) p.classList.remove('hidden');
        if (b) b.classList.add('bg-primary/10', 'text-primary');

        parsedLinkPreview = note.link_preview;
        renderLinkPreviewBox(note.link_preview);
    }

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = '생각 수정하기';
    document.getElementById('submit-btn-text').textContent = '수정 완료';
    updateNoteSubmitState();
    elements.noteModal.classList.remove('hidden');
}

// 댓글 모달 열기
function openCommentModal(noteId) {
    activeCommentNoteId = noteId;
    const authorInput = document.getElementById('comment-author-input');
    const contentInput = document.getElementById('comment-content-input');
    const modal = document.getElementById('comment-modal');

    if (!authorInput || !contentInput || !modal) return;

    contentInput.value = '';

    if (currentUser) {
        authorInput.value = currentProfile?.display_name || (typeof IdeaCanvasAuth !== 'undefined' ? IdeaCanvasAuth.getDisplayName(currentProfile, currentUser) : (currentUser.email ? currentUser.email.split('@')[0] : '교사'));
        authorInput.disabled = true;
    } else {
        authorInput.value = localStorage.getItem('ideacanvas_comment_author') || '';
        authorInput.disabled = false;
    }

    modal.classList.remove('hidden');
    setTimeout(() => contentInput.focus(), 50);
}

// 댓글 모달 닫기
function closeCommentModal() {
    activeCommentNoteId = null;
    const modal = document.getElementById('comment-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 모달에서 댓글 제출
async function submitCommentFromModal() {
    if (!supabaseClient || !activeCommentNoteId) return;

    const authorInput = document.getElementById('comment-author-input');
    const contentInput = document.getElementById('comment-content-input');
    
    if (!authorInput || !contentInput) return;

    const content = contentInput.value.trim();
    if (!content) {
        alert('댓글 내용을 입력해 주세요.');
        return;
    }

    if (!canCurrentUserWrite()) {
        alert('현재 보드는 글쓰기 기능이 꺼져 있습니다.');
        return;
    }

    let cmtAuthor = authorInput.value.trim();
    if (!cmtAuthor) {
        alert('작성자 이름을 입력해 주세요.');
        return;
    }

    if (!currentUser) {
        localStorage.setItem('ideacanvas_comment_author', cmtAuthor);
    }

    try {
        const { error } = await supabaseClient
            .from('comments')
            .insert([{
                note_id: activeCommentNoteId,
                author: cmtAuthor,
                author_id: authorId,
                author_user_id: currentUser?.id || null,
                content: content,
                client_ip: clientMaskedIP
            }]);

        if (error) throw error;
        closeCommentModal();
    } catch (e) {
        console.error("Submit comment failed:", e);
        alert('댓글 등록에 실패했습니다: ' + e.message);
    }
}

// 워드 클라우드 텍스트 추출 및 빈도 계산
function extractWordFrequencies() {
    let combinedText = '';

    // Collect note contents (excluding titles and authors)
    if (Array.isArray(currentNotes)) {
        currentNotes.forEach(note => {
            if (note.content) {
                combinedText += ' ' + note.content;
            }
        });
    }

    // Collect comment contents (excluding authors)
    for (const noteId in commentDataMap) {
        const comments = commentDataMap[noteId];
        if (Array.isArray(comments)) {
            comments.forEach(c => {
                if (c.content) {
                    combinedText += ' ' + c.content;
                }
            });
        }
    }

    if (!combinedText.trim()) return [];

    // Clean text: remove special characters/emojis/punctuation (keep Korean, English, numbers)
    const cleanedText = combinedText.replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g, ' ');
    const rawWords = cleanedText.split(/\s+/);
    const frequencies = {};

    // Suffix trimmer postpositions (sorted by length descending for greedy matching)
    const postpositions = [
        '었습니다', '였습니다', '입니다', '입니까', '하나요', '해요',
        '이었다', '이라고', '에서만', '에게만', '으로는', '으로서', '으로써', '대로만',
        '에서', '에게', '으로', '하고', '이며', '이다', '부터', '까지', '보다', '처럼', '같이', '한테', '이랑', '마저', '조차', '마냥', '테고', '라고', '로써', '로서', '더러', '보고', '마다', '조차', '끼리',
        '은', '는', '이', '가', '을', '를', '에', '의', '로', '와', '과', '도', '만', '한', '고', '랑', '께'
    ];

    rawWords.forEach(w => {
        let word = w.trim();
        if (!word || word.length <= 1) return;

        // Strip common Korean suffix postpositions to find base noun
        for (const suffix of postpositions) {
            if (word.endsWith(suffix) && word.length > suffix.length) {
                const base = word.slice(0, -suffix.length);
                if (base.length >= 2) {
                    word = base;
                    break;
                }
            }
        }

        // Final check on length
        if (word.length >= 2) {
            frequencies[word] = (frequencies[word] || 0) + 1;
        }
    });

    return Object.entries(frequencies)
        .sort((a, b) => b[1] - a[1]);
}

// 워드 클라우드 모달 열기
function openWordCloudModal() {
    const modal = document.getElementById('wordcloud-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    renderWordCloud();
}

// 워드 클라우드 모달 닫기
function closeWordCloudModal() {
    const modal = document.getElementById('wordcloud-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 워드 클라우드 캔버스 및 텍스트 렌더링
function renderWordCloud() {
    const canvas = document.getElementById('wordcloud-canvas');
    const container = document.getElementById('wordcloud-canvas-container');
    const emptyMsg = document.getElementById('wordcloud-empty-msg');
    const statsList = document.getElementById('wordcloud-stats-list');

    if (!canvas || !container || !emptyMsg || !statsList) return;

    const freqList = extractWordFrequencies();

    statsList.innerHTML = '';

    if (freqList.length === 0) {
        canvas.classList.add('hidden');
        emptyMsg.classList.remove('hidden');
        return;
    }

    canvas.classList.remove('hidden');
    emptyMsg.classList.add('hidden');

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const top5 = freqList.slice(0, 5);
    top5.forEach(([word, count]) => {
        const item = document.createElement('div');
        item.className = 'bg-surface-container-low p-2 rounded-xl text-center border border-outline-variant/10 shadow-sm';
        item.innerHTML = `
            <p class="font-bold text-xs text-primary truncate" title="${escapeHtml(word)}">${escapeHtml(word)}</p>
            <p class="text-[10px] text-on-surface-variant font-semibold mt-0.5">${count}회</p>
        `;
        statsList.appendChild(item);
    });

    const maxFreq = freqList[0][1];
    const wordList = freqList.map(([word, freq]) => {
        const weight = Math.max(12, Math.min(48, (freq / maxFreq) * 36 + 10));
        return [word, weight];
    });

    if (typeof WordCloud !== 'undefined') {
        WordCloud(canvas, {
            list: wordList,
            gridSize: 8,
            weightFactor: 1,
            fontFamily: 'Outfit, Inter, system-ui, sans-serif',
            color: function () {
                const hues = [190, 200, 210, 220];
                const hue = hues[Math.floor(Math.random() * hues.length)];
                const saturation = Math.floor(Math.random() * 20) + 70;
                const lightness = Math.floor(Math.random() * 20) + 40;
                return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            },
            rotateRatio: 0.3,
            rotationSteps: 2,
            backgroundColor: '#fafcff'
        });
    }
}

// 좋아요 토글
async function toggleLike(noteId) {
    if (!supabaseClient) return;
    if (authUtils.isRejectedTeacher(currentProfile)) {
        alert('가입이 거부된 계정은 보드 기능을 사용할 수 없습니다.');
        return;
    }
    if (pendingLikeNoteIds.has(noteId)) return;

    const userLiked = userLikesMap[noteId] || false;
    pendingLikeNoteIds.add(noteId);

    try {
        if (userLiked) {
            // 좋아요 해제 (Delete)
            const { error } = await supabaseClient
                .from('likes')
                .delete()
                .eq('note_id', noteId)
                .eq('user_session_id', authorId);

            if (error) throw error;
            userLikesMap[noteId] = false;
        } else {
            // 좋아요 추가
            await likesApi.saveLikeToServer(supabaseClient, noteId, authorId, currentUser?.id || null);
            userLikesMap[noteId] = true;
        }
    } catch (e) {
        console.error("Like toggle failed:", e);
    } finally {
        pendingLikeNoteIds.delete(noteId);
    }
}

// 댓글 삭제
async function deleteComment(cmtId, noteId) {
    if (!confirm('정말 이 댓글을 삭제하시겠습니까?')) return;
    if (!supabaseClient) return;

    try {
        let query = supabaseClient
            .from('comments')
            .delete()
            .eq('id', cmtId);

        // 교사가 아닌 일반 학생인 경우 본인이 작성한 댓글만 삭제할 수 있도록 조건 추가
        if (!canCurrentUserManageBoard()) {
            query = query.eq('author_id', authorId);
        }

        const { error } = await query;

        if (error) throw error;
    } catch (e) {
        alert("삭제 실패: " + e.message);
    }
}

// --- 7. 외부 웹 사이트 / 유튜브 링크 미리보기 파싱 기능 ---
async function handleLinkInput(e) {
    const url = (e?.target?.value || elements.linkUrlInput.value || '').trim();
    attachmentType = attachmentUtils.resolveDraftAttachmentType(attachmentType, 'link', url);
    updateAttachmentToolState();
    if (!url) {
        elements.linkPreviewBox.classList.add('hidden');
        parsedLinkPreview = null;
        updateNoteSubmitState();
        return;
    }

    // 간단한 URL 포맷 확인
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        parsedLinkPreview = null;
        elements.linkPreviewBox.classList.add('hidden');
        updateNoteSubmitState();
        return;
    }

    if (attachmentUtils.isYoutubeUrl(url)) {
        parsedLinkPreview = null;
        elements.linkPreviewBox.classList.add('hidden');
        updateNoteSubmitState();
        return;
    }
    attachmentType = 'link';
    updateAttachmentToolState();

    // 유튜브 동영상 체크
    const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytReg);
    if (ytMatch) {
        const videoId = ytMatch[1];
        parsedLinkPreview = {
            title: "유튜브 동영상",
            description: "IdeaCanvas 미디어 플레이어로 보기",
            image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            url: url
        };
        renderLinkPreviewBox(parsedLinkPreview);
        return;
    }

    // 일반 링크인 경우 microlink.io 무료 API 사용 (CORS 우회)
    try {
        elements.linkPreviewTitle.textContent = "가져오는 중...";
        elements.linkPreviewDesc.textContent = url;
        elements.linkPreviewImgBox.classList.add('hidden');
        elements.linkPreviewBox.classList.remove('hidden');

        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        
        if (json.status === 'success') {
            const data = json.data;
            parsedLinkPreview = {
                title: data.title || "웹사이트",
                description: data.description || url,
                image: data.image?.url || data.logo?.url || "",
                url: url
            };
            renderLinkPreviewBox(parsedLinkPreview);
        } else {
            throw new Error();
        }
    } catch (err) {
        parsedLinkPreview = {
            title: url,
            description: "웹 사이트 바로가기",
            image: "",
            url: url
        };
        renderLinkPreviewBox(parsedLinkPreview);
    }
}

function handleYoutubeInput(e) {
    const url = (e?.target?.value || '').trim();
    attachmentType = attachmentUtils.resolveDraftAttachmentType(attachmentType, 'youtube', url);
    updateAttachmentToolState();
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([^&?/\s]+)/i);
    if (!match) {
        parsedLinkPreview = null;
        elements.youtubePreviewBox.classList.add('hidden');
        updateNoteSubmitState();
        return;
    }
    parsedLinkPreview = {
        title: '유튜브 동영상',
        description: url,
        image: `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`,
        url
    };
    attachmentType = 'youtube';
    updateAttachmentToolState();
    elements.youtubePreviewThumbnail.src = parsedLinkPreview.image;
    elements.youtubePreviewBox.classList.remove('hidden');
    updateNoteSubmitState();
}

function renderLinkPreviewBox(preview) {
    elements.linkPreviewTitle.textContent = preview.title;
    elements.linkPreviewDesc.textContent = preview.description;
    
    if (preview.image) {
        elements.linkPreviewThumbnail.src = preview.image;
        elements.linkPreviewImgBox.classList.remove('hidden');
    } else {
        elements.linkPreviewImgBox.classList.add('hidden');
    }
    
    elements.linkPreviewBox.classList.remove('hidden');
    updateNoteSubmitState();
}

function hasNoteAttachment() {
    if (attachmentType === 'image') return Boolean(uploadedImageBase64);
    if (attachmentType === 'draw') return Boolean(sketchImageBase64);
    if (attachmentType === 'link' || attachmentType === 'youtube') return Boolean(parsedLinkPreview);
    return false;
}

function updateAttachmentToolState() {
    ['image', 'link', 'youtube', 'draw'].forEach(type => {
        const button = document.getElementById(`tool-btn-${type}`);
        if (!button) return;
        const locked = Boolean(attachmentType && attachmentType !== type);
        button.disabled = locked;
        button.setAttribute('aria-disabled', String(locked));
        button.classList.toggle('opacity-40', locked);
        button.classList.toggle('grayscale', locked);
        button.classList.toggle('cursor-not-allowed', locked);
    });
}

function clearAttachmentType(type) {
    if (attachmentType === type) attachmentType = null;
    updateAttachmentToolState();
    updateNoteSubmitState();
}

function updateNoteSubmitState() {
    if (!elements.submitNoteBtn) return;
    const hasTitle = Boolean(elements.noteTitle?.value.trim());
    const hasBody = Boolean(elements.noteContent?.value.trim()) || hasNoteAttachment();
    elements.submitNoteBtn.disabled = !(hasTitle && hasBody);
}

function updateModalSectionVisibility() {
    const sectionWrapper = document.getElementById('modal-section-wrapper');
    if (sectionWrapper) sectionWrapper.classList.toggle('hidden', !isSectionViewEnabled);
}

// --- 8. 손그림 그리기 패드 (HTML5 Canvas) ---
function initDrawingPad() {
    const canvas = elements.drawingCanvas;
    const ctx = canvas.getContext('2d');
    
    // Canvas 기본 스타일 초기화
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function startDrawing(e) {
        isDrawing = true;
        const coords = getCanvasCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        
        const coords = getCanvasCoords(e);
        ctx.lineTo(coords.x, coords.y);
        
        if (isEraserMode) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = brushSize * 3; // 지우개는 살짝 넓게
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = brushColor;
            ctx.lineWidth = brushSize;
        }
        
        ctx.stroke();
        lastX = coords.x;
        lastY = coords.y;
    }

    function stopDrawing() {
        isDrawing = false;
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        // 터치 및 마우스 지원
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // CSS 크기와 실제 캔버스 내부 해상도 스케일 보정
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    // 마우스 이벤트
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // 터치 이벤트 (모바일)
    canvas.addEventListener('touchstart', startDrawing, { passive: true });
    canvas.addEventListener('touchmove', draw, { passive: true });
    canvas.addEventListener('touchend', stopDrawing);
}

// 드로잉 컨트롤러 바인딩
function bindDrawingControls() {
    const canvas = elements.drawingCanvas;
    const ctx = canvas.getContext('2d');

    // 브러시 컬러 버튼 핸들러
    document.querySelectorAll('.brush-color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.brush-color-btn').forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-primary'));
            e.target.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
            
            brushColor = e.target.getAttribute('data-color');
            isEraserMode = false;
            elements.eraserBtn.classList.remove('bg-primary', 'text-white');
            elements.eraserBtn.classList.add('bg-slate-200');
        });
    });

    // 지우개 버튼
    elements.eraserBtn.addEventListener('click', () => {
        isEraserMode = !isEraserMode;
        if (isEraserMode) {
            elements.eraserBtn.classList.add('bg-primary', 'text-white');
            elements.eraserBtn.classList.remove('bg-slate-200');
        } else {
            elements.eraserBtn.classList.remove('bg-primary', 'text-white');
            elements.eraserBtn.classList.add('bg-slate-200');
        }
    });

    // 펜 크기
    elements.brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
    });

    // 캔버스 초기화
    elements.clearCanvasBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    // 드로잉 저장
    elements.saveDrawingBtn.addEventListener('click', () => {
        // 이미지가 비어있는지 임시 확인 (투명한 캔버스면 저장 안함)
        const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
        const hasContent = buffer.some(color => color !== 0);
        
        if (!hasContent) {
            alert('그림을 그린 후에 추가할 수 있습니다.');
            return;
        }

        // Base64 추출
        sketchImageBase64 = drawingUtils.flattenCanvasOnWhiteBackground(canvas, document);
        attachmentType = 'draw';
        updateAttachmentToolState();
        elements.sketchThumbnailImg.src = sketchImageBase64;
        elements.sketchThumbnailContainer.classList.remove('hidden');
        elements.openDrawingPadBtn.classList.add('hidden');
        elements.drawingModal.classList.add('hidden');
        updateNoteSubmitState();
    });

    elements.closeDrawingBtn.addEventListener('click', () => {
        elements.drawingModal.classList.add('hidden');
    });

}

function syncKanbanScrollProxy() {
    const board = document.getElementById('kanban-board');
    const proxy = document.getElementById('kanban-scroll-proxy');
    const proxyContent = document.getElementById('kanban-scroll-proxy-content');
    if (!board || !proxy || !proxyContent) return;

    const hasOverflow = isSectionViewEnabled && board.scrollWidth > board.clientWidth + 1;
    proxy.classList.toggle('hidden', !hasOverflow);
    if (!hasOverflow) return;

    proxyContent.style.width = `${board.scrollWidth}px`;
    proxy.scrollLeft = board.scrollLeft;

    if (proxy.dataset.scrollBound === 'true') return;
    proxy.dataset.scrollBound = 'true';
    let syncing = false;
    board.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        proxy.scrollLeft = board.scrollLeft;
        syncing = false;
    });
    proxy.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        board.scrollLeft = proxy.scrollLeft;
        syncing = false;
    });
}

function getActiveNoteSurface() {
    return document.getElementById(noteVisibilityUtils.getActiveNoteSurfaceId(isSectionViewEnabled));
}

function countVisibleRenderedNotes() {
    const surface = getActiveNoteSurface();
    if (!surface) return 0;
    return surface.querySelectorAll('[id^="note-"]').length;
}

function isEmptyCanvasClickTarget(target) {
    if (!(target instanceof Element)) return false;
    return !target.closest('[id^="note-"], button, input, textarea, select, a, [role="button"]');
}

function recoverAnonymousNoteVisibility() {
    if (currentUser) return;

    const shouldRecover = noteVisibilityUtils.shouldRecoverNoteVisibility({
        noteCount: currentNotes.length,
        visibleCardCount: countVisibleRenderedNotes(),
        searchQuery: elements.searchInput?.value || '',
    });
    if (!shouldRecover) return;

    try {
        if (isSectionViewEnabled) renderSectionsUI();
        renderNotes();
    } catch (error) {
        console.error('Anonymous note visibility recovery failed:', error);
    }
}

// --- 9. 일반 헬퍼 및 이벤트 바인딩 ---

// 모달 닫기 공통
function closeAllModals() {
    if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
    if (elements.noteModal) elements.noteModal.classList.add('hidden');
    if (elements.drawingModal) elements.drawingModal.classList.add('hidden');
}

// 노트 작성 폼 상태 초기화
function resetNoteForm() {
    elements.editNoteId.value = '';
    if (elements.noteAuthor) elements.noteAuthor.value = '익명';
    elements.noteTitle.value = '';
    elements.noteContent.value = '';
    elements.linkUrlInput.value = '';
    elements.youtubeUrlInput.value = '';
    elements.imagePreviewContainer.classList.add('hidden');
    elements.imageDropzone.classList.remove('hidden');
    elements.linkPreviewBox.classList.add('hidden');
    elements.youtubePreviewBox.classList.add('hidden');
    elements.sketchThumbnailContainer.classList.add('hidden');
    elements.openDrawingPadBtn.classList.remove('hidden');
    uploadedImageBase64 = null;
    sketchImageBase64 = null;
    parsedLinkPreview = null;
    attachmentType = null;
    
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = '새 생각 더하기';
    document.getElementById('submit-btn-text').textContent = '생각 올리기';

    // 기본 배경색 단추(첫 번째) 체크
    document.querySelectorAll('.bg-select-btn').forEach((btn, index) => {
        if (index === 0) {
            btn.classList.remove('border-transparent');
            btn.classList.add('border-primary');
            btn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">check</span>`;
        } else {
            btn.classList.remove('border-primary');
            btn.classList.add('border-transparent');
            btn.innerHTML = '';
        }
    });

    // 섹션 선택 기본값 리셋
    document.getElementById('note-section').value = sectionUtils.getDefaultSectionName(currentSections);
    document.querySelectorAll('.section-select-btn').forEach((btn, index) => {
        if (index === 0) {
            btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.remove('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        } else {
            btn.classList.remove('bg-primary/10', 'text-primary', 'border-primary/20');
            btn.classList.add('bg-slate-100', 'text-on-surface-variant', 'border-transparent');
        }
    });

    // 첨부 패널 및 단추 상태 초기화
    const panels = ['panel-image', 'panel-link', 'panel-youtube', 'panel-draw'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const btns = ['tool-btn-image', 'tool-btn-link', 'tool-btn-youtube', 'tool-btn-draw'];
    btns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('bg-primary/10', 'text-primary');
            el.classList.add('text-on-surface-variant');
        }
    });
    updateAttachmentToolState();
    updateModalSectionVisibility();
    updateNoteSubmitState();
}

// 파일 선택 시 Base64 변환
function handleImageFileSelect(e) {
    if (!attachmentUtils.canSelectAttachment(attachmentType, 'image')) return;
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 첨부할 수 있습니다.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedImageBase64 = event.target.result;
        attachmentType = 'image';
        updateAttachmentToolState();
        elements.imagePreviewImg.src = uploadedImageBase64;
        elements.imagePreviewContainer.classList.remove('hidden');
        elements.imageDropzone.classList.add('hidden');
        updateNoteSubmitState();
    };
    reader.readAsDataURL(file);
}

function extractFirstUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : '';
}

function openToolPanel(key) {
    const panel = document.getElementById(`panel-${key}`);
    const button = document.getElementById(`tool-btn-${key}`);
    if (panel) panel.classList.remove('hidden');
    if (button) {
        button.classList.add('bg-primary/10', 'text-primary');
        button.classList.remove('text-on-surface-variant');
    }
}

function applyDetectedUrl(url, mode = 'link') {
    if (!url || attachmentType) return;
    const resolvedMode = mode === 'youtube' || attachmentUtils.isYoutubeUrl(url) ? 'youtube' : 'link';
    const input = resolvedMode === 'youtube' ? elements.youtubeUrlInput : elements.linkUrlInput;
    input.value = url;
    openToolPanel(resolvedMode);
    if (resolvedMode === 'youtube') handleYoutubeInput({ target: input });
    else handleLinkInput({ target: input });
    updateNoteSubmitState();
}

function handleNotePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (imageItem) {
        if (!attachmentUtils.canSelectAttachment(attachmentType, 'image')) return;
        const file = imageItem.getAsFile();
        if (file) {
            openToolPanel('image');
            handleImageFileSelect({ target: { files: [file] } });
        }
        return;
    }

}

// 드롭존 드래그 앤 드롭
function initImageDragAndDrop() {
    const dropzone = document.getElementById('image-dropzone');
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('bg-surface-container-high', 'border-primary');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('bg-surface-container-high', 'border-primary');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            elements.imageFileInput.files = files;
            handleImageFileSelect({ target: { files } });
        }
    });
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
}

async function ensureCurrentProfile() {
    if (!supabaseClient || !currentUser || currentProfile) return;
    const displayName = currentUser.user_metadata?.display_name || document.getElementById('auth-display-name')?.value || '';
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

async function syncCurrentUser(sessionUser) {
    currentUser = sessionUser || null;
    currentProfile = null;
    if (currentUser) {
        await loadCurrentProfile();
        await ensureCurrentProfile();
    }
}

function canCurrentUserWrite() {
    return authUtils.canWriteToBoard(currentProfile, currentBoardSettings);
}

function bindGeneralEvents() {
    // 1. 모달 및 설정 패널 제어
    const settingsPanel = document.getElementById('settings-panel');
    const settingsPanelOverlay = document.getElementById('settings-panel-overlay');
    const writeDisabledModal = document.getElementById('write-disabled-modal');
    
    // 교사 계정 관리 드롭다운 메뉴 이벤트 바인딩
    const authMenuBtn = document.getElementById('auth-menu-btn');
    const authDropdownMenu = document.getElementById('auth-dropdown-menu');
    
    if (authMenuBtn && authDropdownMenu) {
        authMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // document click 이벤트 전파 방지
            authDropdownMenu.classList.toggle('hidden');
        });
        
        // 메뉴 내부 클릭 시 닫히지 않도록 방지
        authDropdownMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 외부 영역 클릭 시 메뉴 닫기
        document.addEventListener('click', () => {
            authDropdownMenu.classList.add('hidden');
        });
    }

    const openSettingsPanel = () => {
        if (settingsPanel) settingsPanel.classList.remove('translate-x-full');
        if (settingsPanelOverlay) settingsPanelOverlay.classList.remove('hidden');
    };
    
    const closeSettingsPanel = () => {
        if (settingsPanel) settingsPanel.classList.add('translate-x-full');
        if (settingsPanelOverlay) settingsPanelOverlay.classList.add('hidden');
    };
    
    const openSettingsPanelBtn = document.getElementById('open-settings-panel-btn');
    const closeSettingsPanelBtn = document.getElementById('close-settings-panel-btn');
    
    if (openSettingsPanelBtn) openSettingsPanelBtn.addEventListener('click', openSettingsPanel);
    if (closeSettingsPanelBtn) closeSettingsPanelBtn.addEventListener('click', closeSettingsPanel);
    if (settingsPanelOverlay) settingsPanelOverlay.addEventListener('click', closeSettingsPanel);

    // 보드 공유 (QR코드 페이지) 새 창 열기
    const openShareModalBtn = document.getElementById('open-share-modal-btn');
    if (openShareModalBtn) {
        openShareModalBtn.addEventListener('click', () => {
            const currentUrl = window.location.href;
            const boardTitle = currentBoardSettings.title || '아이디어 협업 보드';
            const sharePageUrl = `qr.html?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(boardTitle)}`;
            
            // 새 창(또는 새 탭)으로 크게 열기
            window.open(sharePageUrl, '_blank', 'width=800,height=800,scrollbars=yes');
        });
    }

    const openWriteDisabledModal = () => {
        if (writeDisabledModal) writeDisabledModal.classList.remove('hidden');
    };

    const closeWriteDisabledModal = () => {
        if (writeDisabledModal) writeDisabledModal.classList.add('hidden');
    };

    document.querySelectorAll('.write-disabled-close-trigger, #write-disabled-close-btn').forEach(btn => {
        btn.addEventListener('click', closeWriteDisabledModal);
    });

    const openNoteModal = () => {
        if (!canCurrentUserWrite()) {
            openWriteDisabledModal();
            return;
        }
        resetNoteForm();
        elements.noteModal.classList.remove('hidden');
    };
    
    if (elements.gridNewNoteBtn) elements.gridNewNoteBtn.addEventListener('click', openNoteModal);
    if (elements.fabNewNoteBtn) elements.fabNewNoteBtn.addEventListener('click', openNoteModal);

    document.querySelectorAll('.modal-close-trigger, .modal-close-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // 댓글 모달 이벤트 바인딩
    document.querySelectorAll('.comment-modal-close-trigger, .comment-modal-close-btn').forEach(btn => {
        btn.addEventListener('click', closeCommentModal);
    });

    const commentSubmitBtn = document.getElementById('comment-submit-btn');
    if (commentSubmitBtn) {
        commentSubmitBtn.addEventListener('click', submitCommentFromModal);
    }

    const commentContentInput = document.getElementById('comment-content-input');
    if (commentContentInput) {
        commentContentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitCommentFromModal();
            }
        });
    }

    // 워드 클라우드 모달 이벤트 바인딩
    const openWordCloudBtn = document.getElementById('open-wordcloud-btn');
    if (openWordCloudBtn) {
        openWordCloudBtn.addEventListener('click', openWordCloudModal);
    }

    document.querySelectorAll('.wordcloud-modal-close-trigger, .wordcloud-modal-close-btn').forEach(btn => {
        btn.addEventListener('click', closeWordCloudModal);
    });



    // 보드 스위치 토글 기능 리스너
    const toggleSectionView = document.getElementById('toggle-section-view');
    const toggleAuthWrite = document.getElementById('toggle-auth-write');
    
    if (toggleSectionView) {
        toggleSectionView.checked = isSectionViewEnabled;
        toggleSectionView.addEventListener('change', async (e) => {
            const nextValue = e.target.checked;
            if (!canCurrentUserManageBoard()) {
                e.target.checked = isSectionViewEnabled;
                return;
            }
            const previousValue = isSectionViewEnabled;
            try {
                isSectionViewEnabled = nextValue;
                await saveBoardSettings({ sections_enabled: nextValue });
                renderSectionsUI();
                renderNotes();
                updateModalSectionVisibility();
            } catch (err) {
                console.error("Save sections_enabled setting failed:", err);
                alert("설정 저장 실패: " + (err.message || JSON.stringify(err)));
                isSectionViewEnabled = previousValue;
                e.target.checked = previousValue;
            }
        });
    }
    
    if (toggleAuthWrite) {
        toggleAuthWrite.checked = currentBoardSettings.write_enabled;
        toggleAuthWrite.addEventListener('change', async (e) => {
            const nextValue = e.target.checked;
            if (!canCurrentUserManageBoard()) {
                e.target.checked = currentBoardSettings.write_enabled;
                return;
            }
            try {
                await saveBoardSettings({ write_enabled: nextValue });
            } catch (err) {
                console.error("Save write_enabled setting failed:", err);
                alert("설정 저장 실패: " + (err.message || JSON.stringify(err)));
                e.target.checked = currentBoardSettings.write_enabled;
            }
        });
    }

    const toggleShowComments = document.getElementById('toggle-show-comments');
    if (toggleShowComments) {
        toggleShowComments.checked = currentBoardSettings.comments_enabled !== false;
        toggleShowComments.addEventListener('change', async (e) => {
            const nextValue = e.target.checked;
            if (!canCurrentUserManageBoard()) {
                e.target.checked = currentBoardSettings.comments_enabled !== false;
                alert('교사 계정만 보드 설정을 변경할 수 있습니다.');
                return;
            }
            try {
                await saveBoardSettings({ comments_enabled: nextValue });
            } catch (err) {
                console.error("Save comments_enabled setting failed:", err);
                alert("설정 저장 실패: " + (err.message || JSON.stringify(err)));
                e.target.checked = currentBoardSettings.comments_enabled !== false;
            }
        });
    }

    const toggleShowLikes = document.getElementById('toggle-show-likes');
    if (toggleShowLikes) {
        toggleShowLikes.checked = currentBoardSettings.likes_enabled !== false;
        toggleShowLikes.addEventListener('change', async (e) => {
            const nextValue = e.target.checked;
            if (!canCurrentUserManageBoard()) {
                e.target.checked = currentBoardSettings.likes_enabled !== false;
                alert('교사 계정만 보드 설정을 변경할 수 있습니다.');
                return;
            }
            try {
                await saveBoardSettings({ likes_enabled: nextValue });
            } catch (err) {
                console.error("Save likes_enabled setting failed:", err);
                alert("설정 저장 실패: " + (err.message || JSON.stringify(err)));
                e.target.checked = currentBoardSettings.likes_enabled !== false;
            }
        });
    }

    const noteSortSelect = document.getElementById('note-sort-select');
    if (noteSortSelect) {
        noteSortSelect.addEventListener('change', async (e) => {
            if (!canCurrentUserManageBoard()) {
                e.target.value = currentBoardSettings.note_sort || 'newest';
                return;
            }
            try {
                await saveBoardSettings({ note_sort: e.target.value });
            } catch (err) {
                e.target.value = currentBoardSettings.note_sort || 'newest';
            }
        });
    }
    const noteLayoutSelect = document.getElementById('note-layout-select');
    if (noteLayoutSelect) noteLayoutSelect.addEventListener('change', async (e) => { await saveBoardSettings({ note_layout: e.target.value }); });

    window.addEventListener('resize', () => {
        clearTimeout(masonryResizeTimer);
        masonryResizeTimer = setTimeout(() => {
            if (!isSectionViewEnabled && currentBoardSettings.note_layout !== 'grid') renderNotes();
        }, 150);
    });

    // 보드 배경색 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.board-bg-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const nextBg = btn.getAttribute('data-bg');
            if (!canCurrentUserManageBoard()) {
                alert('교사 계정만 보드 설정을 변경할 수 있습니다.');
                return;
            }
            try {
                await saveBoardSettings({ bg_color: nextBg });
            } catch (err) {
                console.error("Save bg_color setting failed:", err);
                alert("설정 저장 실패: " + (err.message || JSON.stringify(err)));
            }
        });
    });

    // 이미지 확대 모달(Lightbox) 오픈 함수
    function openImageLightbox(src, title, isDrawing = false) {
        const modal = document.getElementById('image-lightbox-modal');
        const img = document.getElementById('lightbox-img');
        const caption = document.getElementById('lightbox-caption');
        const downloadBtn = document.getElementById('download-lightbox-btn');
        
        if (!modal || !img) return;
        
        img.src = src;
        img.classList.toggle('bg-white', isDrawing);
        
        if (title) {
            caption.textContent = title;
            caption.classList.remove('hidden');
        } else {
            caption.textContent = '';
            caption.classList.add('hidden');
        }
        
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = src;
                if (src.startsWith('data:image')) {
                    const ext = src.split(';')[0].split('/')[1] || 'png';
                    link.download = `ideacanvas_image_${Date.now()}.${ext}`;
                } else {
                    const filename = src.substring(src.lastIndexOf('/') + 1) || 'download';
                    link.download = filename;
                }
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
        }
        
        modal.classList.remove('hidden');
    }

    // Lightbox 모달 닫기 이벤트 바인딩
    const lightboxModal = document.getElementById('image-lightbox-modal');
    const closeLightboxBtn = document.getElementById('close-lightbox-btn');
    
    function closeLightbox() {
        if (lightboxModal) {
            lightboxModal.classList.add('hidden');
            const img = document.getElementById('lightbox-img');
            if (img) img.src = '';
        }
    }
    
    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', closeLightbox);
    }
    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) {
                closeLightbox();
            }
        });
    }
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightboxModal && !lightboxModal.classList.contains('hidden')) {
            closeLightbox();
        }
    });
    
    // 메모 내부 이미지 클릭 이벤트 위임
    const noteContentArea = document.getElementById('main-canvas');
    if (noteContentArea) {
        noteContentArea.addEventListener('click', (e) => {
            if (!(e.target instanceof Element)) return;
            const clickedImg = e.target.closest('.clickable-note-img');
            if (clickedImg) {
                const src = clickedImg.getAttribute('src');
                const card = clickedImg.closest('.group\\/card');
                const titleEl = card ? card.querySelector('h4') : null;
                const title = titleEl ? titleEl.textContent.trim() : '';
                openImageLightbox(src, title, clickedImg.classList.contains('note-drawing-img'));
            }
            if (isEmptyCanvasClickTarget(e.target)) {
                window.requestAnimationFrame(recoverAnonymousNoteVisibility);
            }
        });
    }

    // Supabase Auth 연동 UI 갱신 헬퍼
    function getCurrentRoleLabel() {
        if (!currentProfile) return '\uad50\uc0ac \uc2b9\uc778 \ub300\uae30';
        if (currentProfile.is_master) return currentProfile.is_primary_master ? '\ucd5c\ucd08 \ub9c8\uc2a4\ud130' : '\ub9c8\uc2a4\ud130';
        if (currentProfile.role === 'teacher') return '\uad50\uc0ac';
        return currentProfile.role === 'teacher_rejected' ? '\uac00\uc785 \uac70\ubd80' : '\uad50\uc0ac \uc2b9\uc778 \ub300\uae30';
    }

    function updateAuthUI() {
        const loggedOutEl = document.getElementById('auth-logged-out');
        const loggedInEl = document.getElementById('auth-logged-in');
        const emailDisplay = document.getElementById('user-email-display');
        const statusBadge = document.getElementById('auth-status-badge');
        const displayName = authUtils.getDisplayName(currentProfile, currentUser);
        const isPendingTeacher = currentProfile?.role === 'teacher_pending';
        const isRejectedTeacher = currentProfile?.role === 'teacher_rejected';

        if (currentUser) {
            if (loggedOutEl) loggedOutEl.classList.add('hidden');
            if (loggedInEl) loggedInEl.classList.remove('hidden');
            if (emailDisplay) emailDisplay.textContent = displayName ? displayName + ' (' + getCurrentRoleLabel() + ')' : currentUser.email;
            if (statusBadge) {
                statusBadge.textContent = isPendingTeacher ? '교사 승인 대기 중' : (isRejectedTeacher ? '가입이 거부되었습니다' : '');
                statusBadge.classList.toggle('hidden', !isPendingTeacher && !isRejectedTeacher);
                statusBadge.classList.toggle('bg-amber-100', isPendingTeacher);
                statusBadge.classList.toggle('text-amber-800', isPendingTeacher);
                statusBadge.classList.toggle('bg-red-100', isRejectedTeacher);
                statusBadge.classList.toggle('text-red-700', isRejectedTeacher);
            }
            if (elements.noteAuthor) elements.noteAuthor.value = displayName || currentUser.email.split('@')[0];
        } else {
            if (loggedOutEl) loggedOutEl.classList.remove('hidden');
            if (loggedInEl) loggedInEl.classList.add('hidden');
            if (emailDisplay) emailDisplay.textContent = '';
            if (statusBadge) {
                statusBadge.textContent = '';
                statusBadge.classList.add('hidden');
            }
            if (elements.noteAuthor) elements.noteAuthor.value = '';
        }
        renderBoardAccessUI();
    }

    async function refreshAuthState(sessionUser) {
        try {
            await syncCurrentUser(sessionUser);
        } catch (error) {
            console.error('Sync auth profile failed:', error);
        }
        updateAuthUI();
        renderBoardSettings();
        renderSectionsUI();
        renderNotes();
    }

    if (supabaseClient) {
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            refreshAuthState(session ? session.user : null);
        });

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            refreshAuthState(session ? session.user : null);
        });
    }

    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value.trim();
            if (!email || !password) {
                alert('\uc774\uba54\uc77c\uacfc \ube44\ubc00\ubc88\ud638\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694.');
                return;
            }
            try {
                btnLogin.textContent = '\ub85c\uadf8\uc778 \uc911...';
                btnLogin.disabled = true;
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                await refreshAuthState(data.user);
                const authDropdownMenu = document.getElementById('auth-dropdown-menu');
                if (authDropdownMenu && !['teacher_pending', 'teacher_rejected'].includes(currentProfile?.role)) {
                    authDropdownMenu.classList.add('hidden');
                }
            } catch (err) {
                alert('\ub85c\uadf8\uc778 \uc2e4\ud328: ' + err.message);
            } finally {
                btnLogin.textContent = '\ub85c\uadf8\uc778';
                btnLogin.disabled = false;
            }
        });
    }

    const btnSignUp = document.getElementById('btn-signup');
    if (btnSignUp) {
        btnSignUp.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value.trim();
            const displayName = document.getElementById('auth-display-name')?.value.trim() || '';
            if (!email || !password || !displayName) {
                alert('\uc774\uba54\uc77c, \ube44\ubc00\ubc88\ud638, \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.');
                return;
            }
            if (password.length < 6) {
                alert('\ube44\ubc00\ubc88\ud638\ub294 \ucd5c\uc18c 6\uc790\ub9ac \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.');
                return;
            }
            try {
                btnSignUp.textContent = '\ucc98\ub9ac \uc911...';
                btnSignUp.disabled = true;
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { display_name: displayName } }
                });
                if (error) throw error;
                if (data.user) await refreshAuthState(data.user);
            } catch (err) {
                alert('\uad50\uc0ac \uac00\uc785 \uc2e4\ud328: ' + err.message);
            } finally {
                btnSignUp.textContent = '\uad50\uc0ac \uac00\uc785';
                btnSignUp.disabled = false;
            }
        });
    }

    const btnResetPassword = document.getElementById('btn-reset-password');
    if (btnResetPassword) {
        btnResetPassword.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            if (!email) {
                alert('\ube44\ubc00\ubc88\ud638\ub97c \uc7ac\uc124\uc815\ud560 \uc774\uba54\uc77c\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.');
                return;
            }
            try {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
                if (error) throw error;
                alert('\ube44\ubc00\ubc88\ud638 \uc7ac\uc124\uc815 \uba54\uc77c\uc744 \ubcf4\ub0c8\uc2b5\ub2c8\ub2e4.');
            } catch (err) {
                alert('\ube44\ubc00\ubc88\ud638 \uc7ac\uc124\uc815 \uc2e4\ud328: ' + err.message);
            }
        });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                const { error } = await supabaseClient.auth.signOut();
                if (error) throw error;
                await refreshAuthState(null);
            } catch (err) {
                alert('\ub85c\uadf8\uc544\uc6c3 \uc2e4\ud328: ' + err.message);
            }
        });
    }

    // 2. 배경색 둥근 버튼 선택 스크립트
    document.querySelectorAll('.bg-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.bg-select-btn').forEach(b => {
                b.classList.remove('border-primary');
                b.classList.add('border-transparent');
                b.innerHTML = '';
            });
            const targetBtn = e.currentTarget;
            targetBtn.classList.remove('border-transparent');
            targetBtn.classList.add('border-primary');
            targetBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">check</span>`;
        });
    });

    // 3. 첨부 툴바 토글 로직
    const toolButtons = {
        image: { btn: document.getElementById('tool-btn-image'), panel: document.getElementById('panel-image') },
        link: { btn: document.getElementById('tool-btn-link'), panel: document.getElementById('panel-link') },
        youtube: { btn: document.getElementById('tool-btn-youtube'), panel: document.getElementById('panel-youtube') },
        draw: { btn: document.getElementById('tool-btn-draw'), panel: document.getElementById('panel-draw') }
    };

    Object.keys(toolButtons).forEach(key => {
        const item = toolButtons[key];
        if (item.btn && item.panel) {
            item.btn.addEventListener('click', () => {
                if (!attachmentUtils.canSelectAttachment(attachmentType, key)) return;
                const isHidden = item.panel.classList.contains('hidden');
                
                // 클릭한 툴의 패널 상태 토글
                if (isHidden) {
                    Object.values(toolButtons).forEach(other => {
                        other.panel?.classList.add('hidden');
                        other.btn?.classList.remove('bg-primary/10', 'text-primary');
                        other.btn?.classList.add('text-on-surface-variant');
                    });
                    item.panel.classList.remove('hidden');
                    item.btn.classList.add('bg-primary/10', 'text-primary');
                    item.btn.classList.remove('text-on-surface-variant');
                    if (key === 'link') {
                        const linkInput = document.getElementById('link-url-input');
                        if (linkInput) linkInput.focus();
                    } else if (key === 'youtube') {
                        elements.youtubeUrlInput.focus();
                    }
                } else {
                    item.panel.classList.add('hidden');
                    item.btn.classList.remove('bg-primary/10', 'text-primary');
                    item.btn.classList.add('text-on-surface-variant');
                }
            });
        }
    });



    // 5. 텍스트 필드/첨부 이벤트 바인딩
    elements.noteForm.addEventListener('submit', handleNoteSubmit);
    elements.imageFileInput.addEventListener('change', handleImageFileSelect);
    elements.linkUrlInput.addEventListener('input', debounce(handleLinkInput, 500));
    elements.youtubeUrlInput.addEventListener('input', debounce(handleYoutubeInput, 300));
    elements.noteTitle.addEventListener('input', updateNoteSubmitState);
    elements.noteContent.addEventListener('input', updateNoteSubmitState);
    elements.noteForm.addEventListener('paste', handleNotePaste);
    elements.searchInput.addEventListener('input', debounce(renderNotes, 300));

    // 6. 첨부 삭제 버튼
    elements.removeImageBtn.addEventListener('click', () => {
        uploadedImageBase64 = null;
        elements.imagePreviewContainer.classList.add('hidden');
        elements.imageDropzone.classList.remove('hidden');
        elements.imageFileInput.value = '';
        clearAttachmentType('image');
    });
    elements.removeLinkBtn.addEventListener('click', () => {
        parsedLinkPreview = null;
        elements.linkUrlInput.value = '';
        elements.linkPreviewBox.classList.add('hidden');
        clearAttachmentType('link');
    });
    elements.removeYoutubeBtn.addEventListener('click', () => {
        parsedLinkPreview = null;
        elements.youtubeUrlInput.value = '';
        elements.youtubePreviewBox.classList.add('hidden');
        clearAttachmentType('youtube');
    });
    elements.removeSketchBtn.addEventListener('click', () => {
        sketchImageBase64 = null;
        elements.sketchThumbnailContainer.classList.add('hidden');
        elements.openDrawingPadBtn.classList.remove('hidden');
        clearAttachmentType('draw');
    });
    // 7. 손그림 드로잉 패드 오픈
    elements.openDrawingPadBtn.addEventListener('click', () => {
        elements.drawingModal.classList.remove('hidden');
        // 캔버스 사이즈가 컨테이너 크기에 대응하여 레이아웃 리프레시되도록 초기화
        const canvas = elements.drawingCanvas;
        const ctx = canvas.getContext('2d');
        // 캔버스 초기화는 진행하되, 기존 스케치가 있었다면 그대로 로드해 줄 수도 있음 (현재는 매번 리셋)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        isEraserMode = false;
        elements.eraserBtn.classList.remove('bg-primary', 'text-white');
        elements.eraserBtn.classList.add('bg-slate-200');
    });

    // 8. 확장 가능한 검색바 토글 기능 구현
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchInput = elements.searchInput;

    if (searchToggleBtn && searchInput) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = searchInput.classList.contains('w-48') || searchInput.classList.contains('md:w-64');
            
            if (!isOpen) {
                // 검색창 열기
                searchInput.classList.remove('w-0', 'opacity-0');
                searchInput.classList.add('w-48', 'md:w-64', 'opacity-100');
                searchInput.focus();
            } else {
                // 열려있을 때 돋보기 누르고 내용 없으면 닫기
                if (!searchInput.value.trim()) {
                    searchInput.classList.remove('w-48', 'md:w-64', 'opacity-100');
                    searchInput.classList.add('w-0', 'opacity-0');
                }
            }
        });

        // 포커스를 잃었을 때 검색어가 비어 있으면 닫기
        searchInput.addEventListener('blur', () => {
            if (!searchInput.value.trim()) {
                searchInput.classList.remove('w-48', 'md:w-64', 'opacity-100');
                searchInput.classList.add('w-0', 'opacity-0');
            }
        });
        
        // ESC 키 입력 시 검색 취소 및 닫기
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                renderNotes(); // 전체 노트 재렌더링
                searchInput.blur();
            }
        });
    }
}

// 디바운싱 유틸リティ
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// 날짜 포맷 유틸리티
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    
    // 하루 이내인 경우 간단 표현
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// HTML 이스케이프 유틸리티 (XSS 방지)
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 9. 보드 제목 더블클릭 편집 기능 ---
function initBoardTitleEditor() {
    const container = document.getElementById('board-title-container');
    const titleEl = document.getElementById('board-title');
    const inputEl = document.getElementById('board-title-input');

    if (!container || !titleEl || !inputEl) return;

    renderBoardSettings();

    // 더블클릭 시 편집 모드로 전환
    container.addEventListener('dblclick', () => {
        if (!canCurrentUserManageBoard()) return;
        titleEl.classList.add('hidden');
        inputEl.classList.remove('hidden');
        // 더블클릭 시 즉시 blur 이벤트가 호출되는 현상 방지
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 0);
    });

    // 편집 완료 함수 (중복 실행 방지 플래그 추가)
    let isSaving = false;
    const saveTitle = async () => {
        if (isSaving) return;
        isSaving = true;

        if (!canCurrentUserManageBoard()) {
            renderBoardSettings();
            titleEl.classList.remove('hidden');
            inputEl.classList.add('hidden');
            isSaving = false;
            return;
        }
        const newTitle = inputEl.value.trim() || boardSettingsUtils.DEFAULT_BOARD_SETTINGS.title;
        titleEl.textContent = newTitle;
        inputEl.value = newTitle;

        try {
            await saveBoardSettings({ title: newTitle });
        } catch (err) {
            console.error("Save board title failed:", err);
            renderBoardSettings();
        } finally {
            titleEl.classList.remove('hidden');
            inputEl.classList.add('hidden');
            isSaving = false;
        }
    };

    // 엔터키 또는 ESC, 포커스 아웃 이벤트 바인딩
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveTitle();
        } else if (e.key === 'Escape') {
            inputEl.value = titleEl.textContent;
            titleEl.classList.remove('hidden');
            inputEl.classList.add('hidden');
        }
    });

    inputEl.addEventListener('blur', saveTitle);
}

// IP 조회 및 마스킹
async function fetchClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const ip = data.ip;
        if (ip) {
            const parts = ip.split('.');
            if (parts.length === 4) {
                clientMaskedIP = `${parts[0]}.${parts[1]}.***.***`;
            } else if (ip.includes(':')) {
                const blocks = ip.split(':');
                if (blocks.length >= 2) {
                    clientMaskedIP = `${blocks[0]}:${blocks[1]}:***:***`;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to fetch client IP:', e);
    }
}

// --- 10. 초기화 구문 ---
document.addEventListener('DOMContentLoaded', () => {
    fetchClientIP();
    document.querySelector('.bg-error-container\\/30')?.remove();
    const legacyTitleInput = document.getElementById('note-title');
    if (legacyTitleInput) {
        legacyTitleInput.disabled = true;
        legacyTitleInput.parentElement?.classList.add('hidden');
    }
    clearLocalSectionCache();
    clearLocalBoardSettingsCache();
    renderBoardNavigationLinks();

    if (!currentBoardId) {
        window.location.href = 'index.html';
        return;
    }

    // 임시로 elements에 바인딩되지 않은 헤더 연결 정보 속성 바인딩
    elements.statusDot = document.getElementById('status-dot');
    elements.statusText = document.getElementById('status-text');

    initSupabase();
    initDrawingPad();
    bindDrawingControls();
    initImageDragAndDrop();
    bindGeneralEvents();
    initBoardTitleEditor();
});
