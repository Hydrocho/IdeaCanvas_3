(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.IdeaCanvasMasonryUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getMasonryColumnCount(viewportWidth) {
        if (viewportWidth >= 1280) return 4;
        if (viewportWidth >= 1024) return 3;
        if (viewportWidth >= 640) return 2;
        return 1;
    }

    function assignItemsToShortestColumns(itemHeights, columnCount, gap = 0) {
        const columns = Array.from({ length: columnCount }, () => []);
        const heights = Array.from({ length: columnCount }, () => 0);

        itemHeights.forEach((itemHeight, index) => {
            const targetIndex = heights.indexOf(Math.min(...heights));
            columns[targetIndex].push(index);
            heights[targetIndex] += (columns[targetIndex].length > 1 ? gap : 0) + itemHeight;
        });

        return columns;
    }

    return { getMasonryColumnCount, assignItemsToShortestColumns };
});
