(function (root, factory) {
    const utils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = utils;
    }
    root.SectionUtils = utils;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    const DEFAULT_SECTION_NAME = '새 섹션';
    const LEGACY_DEFAULT_SECTION_NAMES = ['아이디어', '질문', '피드백'];

    function getDefaultSectionName(sections) {
        if (!Array.isArray(sections)) return DEFAULT_SECTION_NAME;
        const firstNamedSection = sections.find(section => {
            return section && typeof section.name === 'string' && section.name.trim();
        });
        return firstNamedSection ? firstNamedSection.name.trim() : DEFAULT_SECTION_NAME;
    }

    function getValidSectionName(sectionValue, sections) {
        const fallbackName = getDefaultSectionName(sections);
        if (!Array.isArray(sections) || sections.length === 0) return fallbackName;

        const normalizedValue = typeof sectionValue === 'string' ? sectionValue.trim() : '';
        if (!normalizedValue) return fallbackName;

        const matchedSection = sections.find(section => {
            return section && (section.name === normalizedValue || section.id === normalizedValue);
        });

        return matchedSection && matchedSection.name ? matchedSection.name : fallbackName;
    }

    function getNextSectionName(sections) {
        const names = Array.isArray(sections) ? sections.map(section => section && section.name) : [];
        if (!names.includes(DEFAULT_SECTION_NAME)) return DEFAULT_SECTION_NAME;

        let index = 1;
        while (names.includes(`${DEFAULT_SECTION_NAME}(${index})`)) {
            index += 1;
        }
        return `${DEFAULT_SECTION_NAME}(${index})`;
    }

    function isLegacyDefaultSections(sections) {
        if (!Array.isArray(sections) || sections.length !== LEGACY_DEFAULT_SECTION_NAMES.length) {
            return false;
        }

        const names = sections.map(section => section && section.name);
        return LEGACY_DEFAULT_SECTION_NAMES.every((name, index) => names[index] === name);
    }

    function normalizeSections(sections) {
        if (!Array.isArray(sections) || sections.length === 0 || isLegacyDefaultSections(sections)) {
            return [{ id: 'sec-1', name: DEFAULT_SECTION_NAME, sort_order: 1 }];
        }

        return sections;
    }

    return {
        DEFAULT_SECTION_NAME,
        getDefaultSectionName,
        getValidSectionName,
        getNextSectionName,
        isLegacyDefaultSections,
        normalizeSections,
    };
});
