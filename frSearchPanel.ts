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
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'search') {
                try {
                    const results = await this._service.searchFR(message.query, message.filters || {});
                    webviewView.webview.postMessage({ command: 'results', results });
                } catch (err: unknown) {
                    let msg = 'Unknown error';
                    if (err instanceof Error) {
                        msg = err.message;
                    }
                    webviewView.webview.postMessage({ command: 'error', message: msg });
                }
            }
            if (message.command === 'openFR') {
                vscode.commands.executeCommand('frDetector.openFR', message.frNumber, message.filePath);
            }
        });
    }

    public refresh(): void {}

    private _nonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let n = '';
        for (let i = 0; i < 32; i++) {
            n += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return n;
    }

    private _getHtml(): string {
        const nonce = this._nonce();
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 8px; }
input { width: 100%; margin-bottom: 4px; padding: 4px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #888); }
#status { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
.item { padding: 4px; margin-bottom: 4px; cursor: pointer; border-left: 2px solid transparent; }
.item:hover { background: var(--vscode-list-hoverBackground); border-left-color: var(--vscode-focusBorder); }
mark { background: rgba(234,92,0,0.33); }
</style>
</head>
<body>
<input id="q" type="text" placeholder="Search FR documents..." autocomplete="off">
<input id="orig" type="text" placeholder="Originator name..." autocomplete="off">
<input id="frn" type="text" placeholder="FR number..." autocomplete="off">
<div id="status">Ready</div>
<div id="list"></div>
<script nonce="${nonce}">
var vscode = acquireVsCodeApi();
var timer = null;

function onInput() {
    clearTimeout(timer);
    timer = setTimeout(doSearch, 300);
}

document.getElementById('q').addEventListener('input', onInput);
document.getElementById('orig').addEventListener('input', onInput);
document.getElementById('frn').addEventListener('input', onInput);

function doSearch() {
    var q = document.getElementById('q').value.trim();
    var orig = document.getElementById('orig').value.trim();
    var frn = document.getElementById('frn').value.trim();
    if (!q && !orig && !frn) {
        document.getElementById('list').innerHTML = '';
        document.getElementById('status').textContent = 'Ready';
        return;
    }
    document.getElementById('status').textContent = 'Searching...';
    vscode.postMessage({ command: 'search', query: q, filters: { originator: orig, frNumber: frn } });
}

window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.command === 'results') {
        showResults(msg.results);
    }
    if (msg.command === 'error') {
        showError(msg.message);
    }
});

function showError(m) {
    document.getElementById('status').textContent = '';
    if (m === 'not_indexed') {
        document.getElementById('list').innerHTML = '<p>No documents indexed. Run FR: Ingest Documents.</p>';
    } else {
        document.getElementById('list').innerHTML = '<p>Error: ' + esc(m) + '</p>';
    }
}

function showResults(results) {
    if (!results || results.length === 0) {
        document.getElementById('status').textContent = 'No results';
        document.getElementById('list').innerHTML = '<p>No matching FR documents found.</p>';
        return;
    }
    document.getElementById('status').textContent = results.length + ' result(s)';
    var html = '';
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html += '<div class="item" data-fr="' + esc(r.frNumber) + '" data-fp="' + esc(r.filePath || '') + '">';
        html += '<b>FR' + esc(r.frNumber) + '</b> ' + esc(r.title || 'Untitled');
        if (r.originator) {
            html += '<br>Originator: ' + esc(r.originator);
        }
        if (r.snippet) {
            html += '<br><small>' + hilite(r.snippet) + '</small>';
        }
        html += '</div>';
    }
    document.getElementById('list').innerHTML = html;
}

function hilite(s) {
    return esc(s).replace(/&lt;&lt;/g, '<mark>').replace(/&gt;&gt;/g, '<\/mark>');
}

function esc(s) {
    if (!s) { return ''; }
    s = String(s);
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;');
    return s;
}

document.getElementById('list').addEventListener('click', function(e) {
    var item = e.target.closest('.item');
    if (item) {
        vscode.postMessage({ command: 'openFR', frNumber: item.dataset.fr, filePath: item.dataset.fp });
    }
});
<\/script>
</body>
</html>`;
    }
}
