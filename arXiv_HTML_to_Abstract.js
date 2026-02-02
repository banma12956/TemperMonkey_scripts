// ==UserScript==
// @name         arXiv HTML to Abstract Redirect
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Redirects arXiv HTML pages to their abstract pages
// @author       Claude
// @match        https://arxiv.org/html/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    const currentUrl = window.location.href;
    const newUrl = currentUrl.replace('https://arxiv.org/html/', 'https://arxiv.org/abs/');
    
    if (currentUrl !== newUrl) {
        window.location.replace(newUrl);
    }
})();
