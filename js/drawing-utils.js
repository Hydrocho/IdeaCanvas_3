(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.IdeaCanvasDrawingUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function flattenCanvasOnWhiteBackground(drawingCanvas, documentRef) {
        const exportCanvas = documentRef.createElement('canvas');
        exportCanvas.width = drawingCanvas.width;
        exportCanvas.height = drawingCanvas.height;

        const exportContext = exportCanvas.getContext('2d');
        exportContext.fillStyle = '#ffffff';
        exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportContext.drawImage(drawingCanvas, 0, 0);

        return exportCanvas.toDataURL('image/png');
    }

    return { flattenCanvasOnWhiteBackground };
});
