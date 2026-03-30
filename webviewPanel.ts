import * as vscode from 'vscode';
import { FRContent } from './frDocumentService';

export class FRWebViewPanel {
    public static currentPanel: FRWebViewPanel | undefined;
    public static readonly viewType = 'frDocument';

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, frNumber: string, content: FRContent) {
        // Open in side panel (beside the current editor)
        if (FRWebViewPanel.currentPanel) {
            FRWebViewPanel.currentPanel._update(frNumber, content);
            FRWebViewPanel.currentPanel._panel.reveal(undefined, true);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            FRWebViewPanel.viewType,
            `FR${frNumber}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        FRWebViewPanel.currentPanel = new FRWebViewPanel(panel, extensionUri, frNumber, content);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        frNumber: string,
        content: FRContent
    ) {
        this._panel = panel;
        this._update(frNumber, content);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        FRWebViewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update(frNumber: string, content: FRContent) {
        this._panel.title = `FR${frNumber}`;
        this._panel.webview.html = this._getHtmlForWebview(frNumber, content);
    }

    private _getHtmlForWebview(frNumber: string, content: FRContent): string {
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

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    private _convertToHtml(text: string): string {
        return this._escapeHtml(text)
            .replace(/\n\n/g, "</p><p>")
            .replace(/\n/g, "<br>");
    }
}
