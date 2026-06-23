(function() {
    var m = { 'very-small': 13, small: 14, medium: 16, large: 18, 'very-large': 20 };
    var s = localStorage.getItem('money_tracker_fontScale') || 'medium';
    document.documentElement.style.fontSize = (m[s] || 16) + 'px';
})();
