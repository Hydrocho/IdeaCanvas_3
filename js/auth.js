(function (root, factory) {
    const moduleApi = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = moduleApi;
    }
    root.IdeaCanvasAuth = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    function normalizeProfile(profile) {
        if (!profile || typeof profile !== 'object') return null;
        const displayName = typeof profile.display_name === 'string' && profile.display_name.trim()
            ? profile.display_name.trim()
            : '';
        const role = ['teacher_pending', 'teacher', 'teacher_rejected'].includes(profile.role)
            ? profile.role
            : 'teacher_pending';
        return {
            user_id: profile.user_id || profile.id || '',
            display_name: displayName,
            role,
            is_master: profile.is_master === true,
            is_primary_master: profile.is_primary_master === true,
            email: typeof profile.email === 'string' ? profile.email : '',
        };
    }

    function isApprovedTeacher(profile) {
        const normalized = normalizeProfile(profile);
        return normalized?.role === 'teacher';
    }

    function isTeacherAccount(profile) {
        const normalized = normalizeProfile(profile);
        return normalized?.role === 'teacher_pending' || normalized?.role === 'teacher' || normalized?.is_master === true;
    }

    function isRejectedTeacher(profile) {
        return normalizeProfile(profile)?.role === 'teacher_rejected';
    }

    function isMaster(profile) {
        const normalized = normalizeProfile(profile);
        return normalized?.is_master === true;
    }

    function canCreateBoard(profile) {
        return isApprovedTeacher(profile) || isMaster(profile);
    }

    function canUseDashboard(profile) {
        return canCreateBoard(profile);
    }

    function canWriteToBoard(profile, settings) {
        if (isRejectedTeacher(profile)) return false;
        if (isTeacherAccount(profile)) return true;
        return settings?.write_enabled === true;
    }

    function getDisplayName(profile, user) {
        const normalized = normalizeProfile(profile);
        if (normalized?.display_name) return normalized.display_name;
        if (typeof user?.email === 'string' && user.email.includes('@')) {
            return user.email.split('@')[0];
        }
        return '';
    }

    function resolveAuthPanelMode(mode, user) {
        if (user) return 'logged_in';
        return mode === 'login' || mode === 'signup' ? mode : 'closed';
    }

    function validatePasswordConfirmation(password, confirmation) {
        if (!password || !confirmation) {
            return { valid: false, message: '비밀번호를 입력해 주세요.' };
        }
        if (password !== confirmation) {
            return { valid: false, message: '비밀번호가 일치하지 않습니다.' };
        }
        return { valid: true, message: '' };
    }

    function getProfileInsertCandidates(user, displayName) {
        if (!user?.id) return [];
        const normalizedName = typeof displayName === 'string' && displayName.trim()
            ? displayName.trim()
            : getDisplayName(null, user) || '교사';
        return [
            {
                user_id: user.id,
                display_name: normalizedName,
                email: user.email || '',
                role: 'teacher',
                is_master: true,
                is_primary_master: true,
            },
            {
                user_id: user.id,
                display_name: normalizedName,
                email: user.email || '',
                role: 'teacher_pending',
                is_master: false,
                is_primary_master: false,
            },
        ];
    }

    return {
        normalizeProfile,
        isApprovedTeacher,
        isTeacherAccount,
        isRejectedTeacher,
        isMaster,
        canCreateBoard,
        canUseDashboard,
        canWriteToBoard,
        getProfileInsertCandidates,
        getDisplayName,
        resolveAuthPanelMode,
        validatePasswordConfirmation,
    };
});
