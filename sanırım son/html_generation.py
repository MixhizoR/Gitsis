import re
import os
import base64
from html import escape


def image_to_base64(image_path):
    """Resim dosyasını Base64 string'e çevirir"""
    try:
        if not os.path.exists(image_path):
            return ""
        with open(image_path, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode('utf-8')
    except Exception as e:
        print(f"Resim yükleme hatası: {e}")
        return ""


def generate_advanced_html(tree_data, flat_data=None):
    """Generate advanced HTML report with design hierarchy (TID -> SGD -> STT -> DGÖ-YGÖ) and test connections (KMTD/SITET/DTET-YTET)"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(current_dir, "ehsim logo.png")
    logo_base64 = image_to_base64(logo_path)
    if logo_base64:
        logo_html = f'<img src="data:image/png;base64,{logo_base64}" alt="EHSİM Logo" class="header-logo">'
    else:
        logo_html = ''

    design_html = ""
    for tid_id, tid_data in sorted(tree_data.items()):
        design_html += f"""
        <details class="block tid" id="tid-{tid_id}" open>
            <summary class="block-header">
                <span class="block-id">TID: {tid_id}</span>
            </summary>
            <div class="content">{escape(tid_data.get('content', ''))}</div>
        """
        
        if 'sgds' in tid_data:
            for sgd_id, sgd_data in sorted(tid_data['sgds'].items()):
                design_html += f"""
                <details class="block sgd" id="sgd-{sgd_id}" open>
                    <summary class="block-header">
                        <span class="block-id">SGD: {sgd_id}</span>
                    </summary>
                    <div class="content">{escape(sgd_data.get('content', ''))}</div>
                """

                if 'stts' in sgd_data:
                    for stt_id, stt_data in sorted(sgd_data['stts'].items()):
                        design_html += f"""
                        <div class="block stt" id="stt-{stt_id}">
                            <div class="block-header">
                                <span class="block-id">STT: {stt_id}</span>
                            </div>
                            <div class="content">{escape(stt_data.get('content', ''))}</div>
                        </div>
                        """

                if 'dgöygös' in sgd_data:
                    for dgöygö_id, dgöygö_data in sorted(sgd_data['dgöygös'].items()):
                        design_html += f"""
                        <div class="block dgöygö" id="dgöygö-{dgöygö_id}">
                            <div class="block-header">
                                <span class="block-id">DGÖ-YGÖ: {dgöygö_id}</span>
                            </div>
                            <div class="content">{escape(dgöygö_data.get('content', ''))}</div>
                        </div>
                        """
                
                design_html += "</details>"
        design_html += "</details>"

    test_html = ""
    
    test_mappings = {
        'kmtd': [],
        'sitet': [],
        'dtet-ytet': [],
    }

    if flat_data:
        for item_id, item_data in flat_data.items():
            doc_type = item_data.get('type')
            if doc_type == 'KMTD':
                test_mappings['kmtd'].append((item_id, item_data))
            elif doc_type == 'SITET':
                test_mappings['sitet'].append((item_id, item_data))
            elif doc_type in ['DTET-YTET', 'DTET', 'YTET']:
                test_mappings['dtet-ytet'].append((item_id, item_data))

    test_html += f"""
    <div class="test-section-header">
        <h2 class="section-title">Test Dokümanları</h2>
        <p class="section-description">Test dokümanları (KMTD, SITET, DTET-YTET)</p>
    </div>
    <div class="test-section test-docs-section">
    """
    
    for doc_type in ['kmtd', 'sitet', 'dtet-ytet']:
        for item_id, item_data in sorted(test_mappings[doc_type]):
            doc_id = item_data.get(f'{doc_type.upper()}_ID', item_id)
            test_html += f"""
            <div class="block {doc_type}-block" id="test-{doc_type}-{doc_id}">
                <div class="block-header">
                    <span class="block-id">{doc_type.upper()}: {doc_id}</span>
                </div>
                <div class="content">{escape(item_data.get('content', ''))}</div>
            </div>
            """
    
    test_html += "</div>"

    html_template = """
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>EHSİM - İzlenebilirlik Matrisi</title>
        <style>
            :root {
                --primary-color: #0052cc;
                --tid-color: #1976d2;
                --sgd-color: #4caf50;
                --stt-color: #ff9800;
                --dgöygö-color: #e91e63;
                --kmtd-color: #2196f3;
                --sitet-color: #9c27b0;
                --dtet-ytet-color: #f44336;
                --background-light: #f7f9fc;
                --text-light: #333;
                --background-dark: #121212;
                --text-dark: #f1f1f1;
            }

            body {
                font-family: 'Segoe UI', Arial, sans-serif;
                background-color: var(--background-light);
                color: var(--text-light);
                padding: 20px;
                line-height: 1.6;
                margin: 0;
                min-height: 100vh;
            }

            body.dark-mode {
                background-color: var(--background-dark);
                color: var(--text-dark);
            }

            .container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 20px;
            }

            /* Logo ve Başlık Düzeni */
            .toolbar {
                padding: 20px 0;
                border-bottom: 1px solid rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            
            .header-container {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
            }

            .header-logo {
                height: 150px;
                width: auto;
                object-fit: contain;
            }

            h1 {
                margin: 0;
                color: var(--primary-color);
            }

            .section-tabs {
                display: flex;
                margin-bottom: 30px;
                border-bottom: 2px solid #ddd;
                gap: 20px;
            }

            .tab-button {
                padding: 15px 30px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
                border-bottom: 3px solid transparent;
                transition: all 0.3s;
                color: var(--text-light);
            }

            .dark-mode .tab-button {
                color: var(--text-dark);
            }

            .tab-button.active {
                color: var(--primary-color);
                border-bottom-color: var(--primary-color);
            }

            .tab-button.design-tab.active {
                color: var(--tid-color);
                border-bottom-color: var(--tid-color);
            }

            .tab-button.test-tab.active {
                color: var(--kmtd-color);
                border-bottom-color: var(--kmtd-color);
            }

            .section-content {
                display: none;
            }

            .section-content.active {
                display: block;
            }

            .block {
                border-radius: 12px;
                margin: 12px 0;
                padding: 15px 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                background-color: white;
            }

            .dark-mode .block {
                background-color: #1e1e1e;
                border: 1px solid #333;
            }

            .block:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            }

            .tid { 
                background: linear-gradient(135deg, #bbdefb, #e3f2fd);
                border-left: 6px solid var(--tid-color);
            }

            .sgd { 
                background: linear-gradient(135deg, #c8e6c9, #e8f5e8);
                border-left: 6px solid var(--sgd-color);
                margin-left: 25px;
            }

            .stt { 
                background: linear-gradient(135deg, #ffe0b2, #fff3e0);
                border-left: 6px solid var(--stt-color);
                margin-left: 50px;
            }

            .dgöygö { 
                background: linear-gradient(135deg, #fce4ec, #f8bbd9);
                border-left: 6px solid var(--dgöygö-color);
                margin-left: 50px;
            }

            .kmtd-block { 
                background: linear-gradient(135deg, #e3f2fd, #e1f5fe);
                border-left: 6px solid var(--kmtd-color);
                margin-left: 25px;
                margin-bottom: 20px;
            }

            .sitet-block { 
                background: linear-gradient(135deg, #f3e5f5, #e1bee7);
                border-left: 6px solid var(--sitet-color);
                margin-left: 25px;
                margin-bottom: 20px;
            }

            .dtet-ytet-block { 
                background: linear-gradient(135deg, #ffcdd2, #ffebee);
                border-left: 6px solid var(--dtet-ytet-color);
                margin-left: 25px;
                margin-bottom: 20px;
            }

            .dark-mode .tid { background: linear-gradient(135deg, #1a2330, #1a1a1a); border-left-color: var(--tid-color); }
            .dark-mode .sgd { background: linear-gradient(135deg, #1b2b1b, #1a1a1a); border-left-color: var(--sgd-color); }
            .dark-mode .stt { background: linear-gradient(135deg, #2d2520, #1a1a1a); border-left-color: var(--stt-color); }
            .dark-mode .dgöygö { background: linear-gradient(135deg, #2a1a20, #1a1a1a); border-left-color: var(--dgöygö-color); }
            .dark-mode .kmtd-block { background: linear-gradient(135deg, #1a2330, #1a1a1a); border-left-color: var(--kmtd-color); }
            .dark-mode .sitet-block { background: linear-gradient(135deg, #2a1a2a, #1a1a1a); border-left-color: var(--sitet-color); }
            .dark-mode .dtet-ytet-block { background: linear-gradient(135deg, #3d1a1a, #1a1a1a); border-left-color: var(--dtet-ytet-color); }

            .block-header {
                display: flex;
                justify-content: flex-start;
                align-items: center;
                margin-bottom: 8px;
            }

            .block-id {
                font-weight: bold;
                color: var(--primary-color);
                font-size: 14px;
                padding: 4px 8px;
                background: rgba(0, 82, for 0.1);
                border-radius: 6px;
            }

            .test-section .block-id {
                color: var(--kmtd-color);
                background: rgba(33, 150, 243, 0.1);
            }

            .content {
                font-size: 14px;
                line-height: 1.5;
                margin-top: 10px;
            }

            summary {
                font-weight: bold;
                cursor: pointer;
                outline: none;
                padding: 8px 0;
            }

            summary::-webkit-details-marker {
                display: none;
            }

            .search-container {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }

            input[type="text"] {
                flex: 1;
                max-width: 500px;
                padding: 10px 15px;
                border: 2px solid #ddd;
                border-radius: 8px;
                font-size: 16px;
            }

            .dark-mode input[type="text"] {
                background-color: #333;
                border-color: #555;
                color: var(--text-dark);
            }

            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                background-color: var(--primary-color);
                color: white;
            }

            .btn:hover {
                background-color: #003d99;
            }

            .hidden {
                display: none !important;
            }

            .highlight {
                background-color: yellow;
                color: black;
            }

            .dark-mode .highlight {
                background-color: #ffc107;
                color: black;
            }

            .test-section-header {
                margin: 30px 0 20px 0;
                padding: 20px;
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                border-radius: 12px;
                border-left: 6px solid var(--kmtd-color);
            }

            .dark-mode .test-section-header {
                background: linear-gradient(135deg, #2d2d2d, #1a1a1a);
                border-left-color: var(--kmtd-color);
            }

            .section-title {
                color: var(--kmtd-color);
                margin: 0 0 8px 0;
                font-size: 24px;
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .section-description {
                color: #666;
                margin: 0;
                font-size: 14px;
                font-style: italic;
            }

            .dark-mode .section-description {
                color: #999;
            }

            .section-divider {
                border: none;
                border-top: 3px solid #e0e0e0;
                margin: 40px 0;
                border-radius: 2px;
            }

            .dark-mode .section-divider {
                border-top-color: #333;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="toolbar">
                <div class="header-container">
                    <h1>EHSİM - İzlenebilirlik Matrisi</h1>
                    LOGO_PLACEHOLDER
                </div>
                <div class="search-container">
                    <input type="text" id="searchInput" placeholder="Arama yapın (TID, SGD, STT, DGÖ-YGÖ, KMTD, SITET, DTET-YTET)...">
                    <button class="btn" onclick="searchContent()">Ara</button>
                    <button class="btn" onclick="clearSearch()">Temizle</button>
                    <button class="btn" onclick="expandAll()">Tümünü Aç</button>
                    <button class="btn" onclick="collapseAll()">Tümünü Kapat</button>
                    <button class="btn" onclick="toggleDarkMode()">Koyu Mod 🌙</button>
                    <button class="btn" onclick="exportToCSV()">CSV İndir 📊</button>
                </div>
            </div>

            <div class="section-tabs">
                <button class="tab-button design-tab active" onclick="showSection('design')">
                    Tasarım Doküman Hiyerarşisi (TID → SGD → STT → DGÖ-YGÖ)
                </button>
                <button class="tab-button test-tab" onclick="showSection('test')">
                    Test Dokümanları (KMTD, SITET, DTET-YTET)
                </button>
            </div>

            <div id="design-section" class="section-content design-section active">
                <h2>Tasarım Doküman Hiyerarşisi</h2>
                <p>Teknik İsterlerden Yazılım ve Donanım Tasarımına doğru hiyerarşik yapı</p>
                <div class="hierarchy-content">
                    DESIGN_HTML_PLACEHOLDER
                </div>
            </div>

            <div id="test-section" class="section-content test-section">
                <h2>Test Dokümanları</h2>
                <p>Test dokümanları (KMTD, SITET, DTET-YTET)</p>
                <div class="test-hierarchy-content">
                    TEST_HTML_PLACEHOLDER
                </div>
            </div>
        </div>

        <script>
            function showSection(sectionName) {
                document.querySelectorAll('.section-content').forEach(section => {
                    section.classList.remove('active');
                });
                document.querySelectorAll('.tab-button').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.getElementById(sectionName + '-section').classList.add('active');
                document.querySelector('.tab-button.' + sectionName + '-tab').classList.add('active');
            }

            function searchContent() {
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                if (!searchTerm) return;

                clearHighlights();

                const blocks = document.querySelectorAll('.block');
                let found = false;

                blocks.forEach(block => {
                    const text = block.textContent.toLowerCase();
                    if (text.includes(searchTerm)) {
                        found = true;
                        block.classList.remove('hidden');
                        highlightText(block, searchTerm);
                        let parent = block.closest('details');
                        while (parent) {
                            parent.open = true;
                            parent = parent.parentElement.closest('details');
                        }
                    } else {
                        block.classList.add('hidden');
                    }
                });

                if (found) {
                    const firstVisible = document.querySelector('.block:not(.hidden)');
                    if (firstVisible) {
                        firstVisible.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }

            function clearSearch() {
                document.getElementById('searchInput').value = '';
                document.querySelectorAll('.block').forEach(block => {
                    block.classList.remove('hidden');
                });
                clearHighlights();
            }

            function highlightText(element, searchTerm) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                const textNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    textNodes.push(node);
                }

                textNodes.forEach(textNode => {
                    const text = textNode.textContent;
                    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
                    if (regex.test(text)) {
                        const highlightedText = text.replace(regex, '<span class="highlight">$1</span>');
                        const span = document.createElement('span');
                        span.innerHTML = highlightedText;
                        textNode.parentNode.replaceChild(span, textNode);
                    }
                });
            }

            function clearHighlights() {
                document.querySelectorAll('.highlight').forEach(highlight => {
                    const parent = highlight.parentNode;
                    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                    parent.normalize();
                });
            }

            function escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
            }

            function expandAll() {
                document.querySelectorAll('details').forEach(details => {
                    details.open = true;
                });
            }

            function collapseAll() {
                document.querySelectorAll('details').forEach(details => {
                    details.open = false;
                });
            }

            function toggleDarkMode() {
                document.body.classList.toggle('dark-mode');
                const btn = document.querySelector('[onclick="toggleDarkMode()"]');
                btn.textContent = document.body.classList.contains('dark-mode') ? 'Açık Mod ☀️' : 'Koyu Mod 🌙';
                localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
            }

            function exportToCSV() {
                const rows = [];
                rows.push(['Tür', 'ID', 'İçerik']);

                document.querySelectorAll('.block').forEach(block => {
                    const classList = Array.from(block.classList);
                    const type = classList.find(cls => ['tid', 'sgd', 'stt', 'dgöygö', 'kmtd-block', 'sitet-block', 'dtet-ytet-block'].includes(cls))
                                 ?.replace('-block', '').toUpperCase() || 'Bilinmeyen';
                    const idElement = block.querySelector('.block-id');
                    const id = idElement ? idElement.textContent.trim() : '';
                    const content = block.querySelector('.content')?.textContent.trim() || '';
                    rows.push([type, id, content]);
                });

                const csvContent = rows.map(row => 
                    row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')
                ).join('\\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', 'izlenebilirlik_matrisi.csv');
                link.click();
            }

            if (localStorage.getItem('darkMode') === 'true') {
                document.body.classList.add('dark-mode');
                const btn = document.querySelector('[onclick="toggleDarkMode()"]');
                if (btn) btn.textContent = 'Açık Mod ☀️';
            }

            document.getElementById('searchInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    searchContent();
                }
            });
        </script>
    </body>
    </html>
    """

    html = html_template.replace('DESIGN_HTML_PLACEHOLDER', design_html)
    html = html.replace('TEST_HTML_PLACEHOLDER', test_html)
    html = html.replace('LOGO_PLACEHOLDER', logo_html)
    
    return html


def generate_html_tree(tree_data):
    """Legacy function for backward compatibility"""
    return generate_advanced_html(tree_data)