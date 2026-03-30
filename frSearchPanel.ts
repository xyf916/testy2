import * as vscode from 'vscode';
import { FRDocumentService } from './frDocumentService';

export class FRSearchPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'frSearchPanel';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _service: FRDocumentService
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlFull();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'search':
                    try {
                        const results = await this._service.searchFR(
                            message.query,
                            message.filters || {}
                        );
                        webviewView.webview.postMessage({ command: 'results', results });
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        webviewView.webview.postMessage({ command: 'error', message: msg });
                    }
                    break;

                case 'getFilters':
                    try {
                        const opts = await this._service.getFilterOptions();
                        webviewView.webview.postMessage({ command: 'filterOptions', ...opts });
                    } catch {
                        webviewView.webview.postMessage({
                            command: 'filterOptions',
                            statuses: [], severities: [], subsystems: []
                        });
                    }
                    break;

                case 'openFR':
                    vscode.commands.executeCommand('frDetector.openFR', message.frNumber, message.filePath);
                    break;
            }
        });
    }

    /** Call after ingestion completes to refresh the filter dropdowns. */
    public refresh(): void {
        if (this._view) {
            this._view.webview.postMessage({ command: 'getFilters' });
        }
    }

    private _getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let i = 0; i < 32; i++) {
            nonce += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return nonce;
    }

    private _getHtml(): string {
        const nonce = this._getNonce();
        return '<!DOCTYPE html>' +
            '<html lang="en"><head>' +
            '<meta charset="UTF-8">' +
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'nonce-' + nonce + '\'; ">' +
            '</head><body>' +
            '<p id="probe">Loading...</p>' +
            '<script nonce="' + nonce + '">document.getElementById(\'probe\').textContent=\'JS is running!\';</scr' + 'ipt>' +
            '</body></html>';
    }

    private _getHtmlFull(): string {
        const nonce = this._getNonce();

        const css = [
            '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
            'body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); padding: 8px; overflow-x: hidden; }',
            '#searchInput { width: 100%; padding: 5px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font-size: var(--vscode-font-size); font-family: var(--vscode-font-family); outline: none; margin-bottom: 6px; }',
            '#searchInput:focus { border-color: var(--vscode-focusBorder); }',
            '#searchInput::placeholder { color: var(--vscode-input-placeholderForeground); }',
            '.filters { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }',
            'select { flex: 1; min-width: 0; padding: 3px 5px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 2px; font-size: 11px; font-family: var(--vscode-font-family); outline: none; cursor: pointer; }',
            'select:focus { border-color: var(--vscode-focusBorder); }',
            '#statusBar { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; min-height: 16px; padding-left: 2px; }',
            '.result-item { padding: 6px 8px; margin-bottom: 1px; border-radius: 2px; cursor: pointer; border-left: 2px solid transparent; }',
            '.result-item:hover { background: var(--vscode-list-hoverBackground); border-left-color: var(--vscode-focusBorder); }',
            '.result-header { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; flex-wrap: wrap; }',
            '.fr-number { font-weight: 600; color: var(--vscode-textLink-foreground); font-size: 12px; }',
            '.chip { font-size: 10px; padding: 1px 5px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); white-space: nowrap; }',
            '.result-title { font-size: 12px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.result-snippet { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4; word-break: break-word; }',
            'mark { background: var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33)); color: inherit; border-radius: 2px; }',
            '.empty-state { text-align: center; color: var(--vscode-descriptionForeground); padding: 24px 12px; font-size: 12px; line-height: 1.6; }',
            '.empty-state strong { color: var(--vscode-foreground); }',
        ].join(' ');

        const js = [
            'const vscode = acquireVsCodeApi();',
            'let debounceTimer = null;',
            'console.log("[FR Search] panel script loaded");',
            'vscode.postMessage({ command: "getFilters" });',
            'document.getElementById("searchInput").addEventListener("input", function() { clearTimeout(debounceTimer); debounceTimer = setTimeout(doSearch, 300); });',
            'document.getElementById("statusFilter").addEventListener("change", doSearch);',
            'document.getElementById("severityFilter").addEventListener("change", doSearch);',
            'document.getElementById("subsystemFilter").addEventListener("change", doSearch);',
            'function doSearch() {',
            '  var query = document.getElementById("searchInput").value.trim();',
            '  var status = document.getElementById("statusFilter").value;',
            '  var severity = document.getElementById("severityFilter").value;',
            '  var subsystem = document.getElementById("subsystemFilter").value;',
            '  if (!query && !status && !severity && !subsystem) { document.getElementById("resultsList").innerHTML = ""; document.getElementById("statusBar").textContent = "Ready"; return; }',
            '  console.log("[FR Search] searching:", query);',
            '  document.getElementById("statusBar").textContent = "Searching...";',
            '  vscode.postMessage({ command: "search", query: query, filters: { status: status, severity: severity, subsystem: subsystem } });',
            '}',
            'window.addEventListener("message", function(event) {',
            '  var msg = event.data;',
            '  console.log("[FR Search] received:", msg.command);',
            '  if (msg.command === "results") { renderResults(msg.results); }',
            '  else if (msg.command === "filterOptions") { populateSelect("statusFilter", "Status: Any", msg.statuses || []); populateSelect("severityFilter", "Severity: Any", msg.severities || []); populateSelect("subsystemFilter", "Subsystem: Any", msg.subsystems || []); }',
            '  else if (msg.command === "error") { handleError(msg.message); }',
            '  else if (msg.command === "getFilters") { vscode.postMessage({ command: "getFilters" }); }',
            '});',
            'function populateSelect(id, placeholder, options) {',
            '  var sel = document.getElementById(id); var cur = sel.value;',
            '  sel.innerHTML = "<option value=\\"\\">"+placeholder+"</option>";',
            '  options.forEach(function(opt) { var o = document.createElement("option"); o.value = opt; o.textContent = opt; sel.appendChild(o); });',
            '  if (cur) { sel.value = cur; }',
            '}',
            'function handleError(message) {',
            '  var list = document.getElementById("resultsList");',
            '  document.getElementById("statusBar").textContent = "";',
            '  if (message === "not_indexed") { list.innerHTML = "<div class=\\"empty-state\\">No documents indexed yet.<br>Run <strong>FR: Ingest Documents</strong><br>from the Command Palette.</div>"; }',
            '  else { list.innerHTML = "<div class=\\"empty-state\\">Search error: " + escHtml(message) + "</div>"; }',
            '}',
            'function renderResults(results) {',
            '  var list = document.getElementById("resultsList");',
            '  var bar = document.getElementById("statusBar");',
            '  if (!results || results.length === 0) { bar.textContent = "No results"; list.innerHTML = "<div class=\\"empty-state\\">No matching FR documents found.</div>"; return; }',
            '  bar.textContent = results.length + " result" + (results.length !== 1 ? "s" : "");',
            '  list.innerHTML = results.map(function(r) {',
            '    var chips = [r.status, r.severity].filter(Boolean).map(function(c) { return "<span class=\\"chip\\">" + escHtml(c) + "</span>"; }).join("");',
            '    var snippet = r.snippet ? "<div class=\\"result-snippet\\">" + highlightSnippet(r.snippet) + "</div>" : "";',
            '    return "<div class=\\"result-item\\" data-fr=\\""+escHtml(r.frNumber)+"\\" data-fp=\\""+escHtml(r.filePath||"")+"\\">" +',
            '      "<div class=\\"result-header\\"><span class=\\"fr-number\\">FR"+escHtml(r.frNumber)+"</span>"+chips+"</div>" +',
            '      "<div class=\\"result-title\\">"+escHtml(r.title||"Untitled")+"</div>"+snippet+"</div>";',
            '  }).join("");',
            '}',
            'function highlightSnippet(s) { return escHtml(s).replace(/&lt;&lt;/g,"<mark>").replace(/&gt;&gt;/g,"</mark>"); }',
            'function escHtml(s) { if (!s) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }',
            'document.getElementById("resultsList").addEventListener("click", function(e) { var item = e.target.closest(".result-item"); if (item) { vscode.postMessage({ command: "openFR", frNumber: item.dataset.fr, filePath: item.dataset.fp }); } });',
        ].join('\n');

        return '<!DOCTYPE html>' +
            '<html lang="en"><head>' +
            '<meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'nonce-' + nonce + '\';">' +
            '<title>FR Search</title>' +
            '<style>' + css + '</style>' +
            '</head><body>' +
            '<input id="searchInput" type="text" placeholder="Search FR documents..." autocomplete="off" spellcheck="false">' +
            '<div class="filters">' +
            '<select id="statusFilter"><option value="">Status: Any</option></select>' +
            '<select id="severityFilter"><option value="">Severity: Any</option></select>' +
            '<select id="subsystemFilter"><option value="">Subsystem: Any</option></select>' +
            '</div>' +
            '<div id="statusBar">Ready</div>' +
            '<div id="resultsList"></div>' +
            '<script nonce="' + nonce + '">' + js + '<\/script>' +
            '</body></html>';
    }
}

