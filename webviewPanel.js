"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FRWebViewPanel = void 0;
const vscode = __importStar(require("vscode"));
class FRWebViewPanel {
    static createOrShow(extensionUri, frNumber, content) {
        // Open in side panel (beside the current editor)
        if (FRWebViewPanel.currentPanel) {
            FRWebViewPanel.currentPanel._update(frNumber, content);
            FRWebViewPanel.currentPanel._panel.reveal(undefined, true);
            return;
        }
        const panel = vscode.window.createWebviewPanel(FRWebViewPanel.viewType, `FR${frNumber}`, vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri]
        });
        FRWebViewPanel.currentPanel = new FRWebViewPanel(panel, extensionUri, frNumber, content);
    }
    constructor(panel, extensionUri, frNumber, content) {
        this._disposables = [];
        this._panel = panel;
        this._update(frNumber, content);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    dispose() {
        FRWebViewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
    _update(frNumber, content) {
        this._panel.title = `FR${frNumber}`;
        this._panel.webview.html = this._getHtmlForWebview(frNumber, content);
    }
    _getHtmlForWebview(frNumber, content) {
        const htmlContent = content.html || this._convertToHtml(content.content);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FR${frNumber}</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif);
            font-size: var(--vscode-font-size, 14px);
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        h2 {
            color: var(--vscode-textLink-foreground);
            margin-top: 1.5em;
        }
        p {
            margin: 0.5em 0;
        }
        table {
            border-collapse: collapse;
            margin: 8px 0;
            width: auto;
        }
        td, th {
            border: 1px solid var(--vscode-panel-border);
            padding: 4px 8px;
        }
    </style>
</head>
<body>
    <h1>FR${frNumber}</h1>
    <div class="content">
        ${htmlContent}
    </div>
</body>
</html>`;
    }
    _escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
    _convertToHtml(text) {
        return this._escapeHtml(text)
            .replace(/\n\n/g, "</p><p>")
            .replace(/\n/g, "<br>");
    }
}
exports.FRWebViewPanel = FRWebViewPanel;
FRWebViewPanel.viewType = 'frDocument';
//# sourceMappingURL=webviewPanel.js.map